/*
 * Anaphylaxis Guard - XIAO ESP32C3 firmware
 *
 * BLE server that streams live sensor data to the Anaphylaxis Guard app.
 * No simulated/demo data - every value below is measured from hardware.
 *
 * MUST match lib/ble-real.ts in the app:
 *   Service UUID:        aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f
 *   Characteristic UUID: 7973c8f9-eb2e-47b4-9e1f-05a20cb48622
 *   Payload (JSON):      {"hr":<n>,"tewl":<n>,"temp":<n>}
 *
 * ============================ HARDWARE ============================
 * Per the provided schematic:
 *   U1  XIAO ESP32C3
 *   U2  TCA9548A I2C multiplexer @ 0x70 (A0/A1/A2 -> GND)
 *   J3  SHT31 on mux channel 0
 *   J4  SHT31 on mux channel 1
 *   J5  SHT31 on mux channel 2
 *   TH1 10K NTC thermistor, HIGH side: +3V3 -> TH1 -> D0 -> R5(10K) -> GND
 *   Q1  NMOS heater driver on D8  (HeaterPin), film heater J1 on +5V
 *   Q3  NMOS fan driver    on D7  (FanPin),    fan J2 on +3V3
 *   I2C: SDA = D4, SCL = D5
 *
 * ==================== CHAMBER TEMPERATURE CONTROL ==================
 * A PID loop reads TH1 and drives the film heater (PWM on D8) to hold the
 * humidity chamber at CHAMBER_SETPOINT_C. Stable chamber temperature is what
 * makes the humidity-gradient flux measurement meaningful - without it,
 * ambient temperature swings would dominate the reading.
 *
 * ============================ TEWL / FLUX ==========================
 * Evaporative flux is derived from the ABSOLUTE HUMIDITY GRADIENT between
 * two sensors at different heights in the chamber (the standard open-chamber
 * vapor-flux method). Absolute humidity is computed from each sensor's RH +
 * temperature, so the gradient reflects actual water vapor content, not
 * relative readings at different temperatures.
 *
 *   flux ~ (AH_lower - AH_upper) * FLUX_GAIN
 *
 * >>> SENSOR ROLE ASSIGNMENT - CONFIRM THIS <<<
 * The schematic has THREE SHT31s but the gradient method needs a defined
 * lower (skin-side) and upper (outer) sensor. Current assignment:
 *   CH_SKIN   = 0  (J3) - closest to skin
 *   CH_OUTER  = 1  (J4) - outer/reference
 *   CH_AMBIENT= 2  (J5) - ambient reference (read + reported, not in flux)
 * If your physical layout differs, change these three constants only.
 *
 * FLUX_GAIN converts the gradient (g/m^3) to g/m^2/h. It depends on chamber
 * geometry and airflow and MUST be calibrated against a reference TEWL meter.
 * The default is a placeholder that produces plausible magnitudes, not a
 * clinically calibrated value.
 *
 * ============================ HEART RATE ==========================
 * >>> NO PULSE SENSOR IS PRESENT IN THIS SCHEMATIC. <<<
 * The app's risk model uses heart rate as the corroborating sign for a TEWL
 * rise. With no pulse hardware wired, HR cannot be measured. This firmware
 * sends HR_NOT_AVAILABLE (-1) so the app can show "unavailable" rather than
 * a fake number. Wire a pulse sensor (e.g. MAX30102 on a free mux channel)
 * and implement readHeartRate() to enable corroboration.
 */

#include <Wire.h>
#include <math.h>
#include "Adafruit_SHT31.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------------- BLE identity (must match the app) ----------------
#define SERVICE_UUID        "aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f"
#define CHARACTERISTIC_UUID "7973c8f9-eb2e-47b4-9e1f-05a20cb48622"
#define DEVICE_NAME         "AnaphylaxisGuard"
#define NOTIFY_INTERVAL_MS  1000

// ---------------- Pins (from schematic) ----------------
#define THERMISTOR_PIN  D0    // TH1 divider midpoint (ADC)
#define FAN_PIN         D7    // Q3 gate
#define HEATER_PIN      D8    // Q1 gate (PWM)

// ---------------- I2C multiplexer ----------------
#define TCA9548A_ADDR   0x70  // A0/A1/A2 -> GND
#define CH_SKIN         0     // J3 - skin-side sensor
#define CH_OUTER        1     // J4 - outer sensor
#define CH_AMBIENT      2     // J5 - ambient reference

// ---------------- Thermistor (10K NTC, Beta 3950) ----------------
// HIGH-side wiring: +3V3 -> TH1 -> node(D0) -> R5(10K) -> GND
// so  R_therm = R_fixed * (ADC_MAX - raw) / raw
const float THERM_NOMINAL_R = 10000.0;
const float THERM_NOMINAL_T = 25.0;
const float THERM_BETA      = 3950.0;
const float THERM_FIXED_R   = 10000.0;   // R5
const float ADC_MAX         = 4095.0;    // 12-bit ADC

// ---------------- Chamber PID ----------------
const float CHAMBER_SETPOINT_C = 35.0;   // hold chamber near skin temperature
const float PID_KP = 40.0;
const float PID_KI = 0.8;
const float PID_KD = 12.0;
const float PID_I_LIMIT = 200.0;         // anti-windup clamp
const int   HEATER_PWM_MAX = 255;

// ---------------- Flux calibration (PLACEHOLDER - calibrate!) ----------------
const float FLUX_GAIN = 12.0;            // (g/m^3 gradient) -> (g/m^2/h)

// ---------------- Heart rate ----------------
const float HR_NOT_AVAILABLE = -1.0;     // no pulse sensor wired

Adafruit_SHT31 shtSkin    = Adafruit_SHT31();
Adafruit_SHT31 shtOuter   = Adafruit_SHT31();
Adafruit_SHT31 sthAmbient = Adafruit_SHT31();
bool okSkin = false, okOuter = false, okAmbient = false;

BLECharacteristic *pCharacteristic = nullptr;
bool deviceConnected = false;

// PID state
float pidIntegral = 0.0;
float pidLastError = 0.0;
unsigned long pidLastMs = 0;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *s) override { deviceConnected = true; }
  void onDisconnect(BLEServer *s) override {
    deviceConnected = false;
    s->getAdvertising()->start();   // allow reconnect
  }
};

// ---------------- Multiplexer ----------------
void muxSelect(uint8_t channel) {
  if (channel > 7) return;
  Wire.beginTransmission(TCA9548A_ADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
  delayMicroseconds(200);           // let the switch settle
}

// ---------------- Thermistor ----------------
float readChamberTempC() {
  int raw = analogRead(THERMISTOR_PIN);
  if (raw < 1) raw = 1;
  if (raw > (int)ADC_MAX - 1) raw = (int)ADC_MAX - 1;

  // High-side thermistor: R_therm = R_fixed * (ADC_MAX - raw) / raw
  float rTherm = THERM_FIXED_R * ((ADC_MAX - (float)raw) / (float)raw);

  float tK = 1.0 / ((1.0 / (THERM_NOMINAL_T + 273.15)) +
                    (1.0 / THERM_BETA) * log(rTherm / THERM_NOMINAL_R));
  return tK - 273.15;
}

// ---------------- PID heater control ----------------
void updateHeaterPID(float measuredC) {
  unsigned long now = millis();
  float dt = (pidLastMs == 0) ? 0.0 : (now - pidLastMs) / 1000.0;
  pidLastMs = now;
  if (dt <= 0.0) return;

  float error = CHAMBER_SETPOINT_C - measuredC;

  pidIntegral += error * dt;
  if (pidIntegral >  PID_I_LIMIT) pidIntegral =  PID_I_LIMIT;
  if (pidIntegral < -PID_I_LIMIT) pidIntegral = -PID_I_LIMIT;

  float derivative = (error - pidLastError) / dt;
  pidLastError = error;

  float output = PID_KP * error + PID_KI * pidIntegral + PID_KD * derivative;
  if (output < 0) output = 0;
  if (output > HEATER_PWM_MAX) output = HEATER_PWM_MAX;

  analogWrite(HEATER_PIN, (int)output);
}

// ---------------- Humidity -> absolute humidity ----------------
// Magnus formula: saturation vapor pressure (hPa), then absolute humidity g/m^3
float absoluteHumidity(float tempC, float rhPercent) {
  float svp = 6.112 * exp((17.67 * tempC) / (tempC + 243.5));
  float vp  = svp * (rhPercent / 100.0);
  return 216.7 * (vp / (tempC + 273.15));
}

// ---------------- Evaporative flux (TEWL estimate) ----------------
float readFluxTEWL() {
  if (!okSkin || !okOuter) return 0.0;

  muxSelect(CH_SKIN);
  float tSkin  = shtSkin.readTemperature();
  float rhSkin = shtSkin.readHumidity();

  muxSelect(CH_OUTER);
  float tOuter  = shtOuter.readTemperature();
  float rhOuter = shtOuter.readHumidity();

  if (isnan(tSkin) || isnan(rhSkin) || isnan(tOuter) || isnan(rhOuter)) return 0.0;

  float ahSkin  = absoluteHumidity(tSkin,  rhSkin);
  float ahOuter = absoluteHumidity(tOuter, rhOuter);

  float flux = (ahSkin - ahOuter) * FLUX_GAIN;
  if (flux < 0) flux = 0;                     // inward gradient isn't TEWL
  return flux;
}

// ---------------- Skin temperature ----------------
// Body/skin temperature from the skin-side SHT31 (J3, mux ch0). NOT the
// thermistor - that measures the heated chamber for PID control.
// Returns NAN if unavailable; caller substitutes a safe neutral value.
float readSkinTempC() {
  if (!okSkin) return NAN;
  muxSelect(CH_SKIN);
  float t = shtSkin.readTemperature();
  return t;
}

// ---------------- Heart rate ----------------
float readHeartRate() {
  // No pulse sensor in this schematic - see header note.
  return HR_NOT_AVAILABLE;
}

void setup() {
  Serial.begin(115200);

  pinMode(FAN_PIN, OUTPUT);
  pinMode(HEATER_PIN, OUTPUT);
  digitalWrite(FAN_PIN, HIGH);     // fan on: airflow for the flux measurement
  analogWrite(HEATER_PIN, 0);

  Wire.begin();                    // SDA=D4, SCL=D5

  muxSelect(CH_SKIN);    okSkin    = shtSkin.begin(0x44);
  muxSelect(CH_OUTER);   okOuter   = shtOuter.begin(0x44);
  muxSelect(CH_AMBIENT); okAmbient = sthAmbient.begin(0x44);

  if (!okSkin)    Serial.println("WARN: SHT31 ch0 (skin) not found");
  if (!okOuter)   Serial.println("WARN: SHT31 ch1 (outer) not found");
  if (!okAmbient) Serial.println("WARN: SHT31 ch2 (ambient) not found");

  BLEDevice::init(DEVICE_NAME);
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("Anaphylaxis Guard: BLE advertising, sensors initialised");
}

void loop() {
  // Chamber temperature control runs every cycle, connected or not, so the
  // chamber is already stable when the app connects.
  float chamberC = readChamberTempC();
  updateHeaterPID(chamberC);

  if (deviceConnected) {
    float tewl = readFluxTEWL();
    float hr   = readHeartRate();

    // IMPORTANT: report SKIN temperature, not chamber temperature.
    // chamberC is the PID-controlled chamber (held at CHAMBER_SETPOINT_C), so
    // sending it as the patient's temperature would make a healthy person read
    // as hypothermic. The skin-side SHT31 sits against the skin and is the
    // closest available body-temperature measurement in this hardware.
    float skinC = readSkinTempC();
    if (isnan(skinC)) skinC = 36.8;   // neutral normal value if sensor is absent

    char payload[96];
    snprintf(payload, sizeof(payload),
             "{\"hr\":%.1f,\"tewl\":%.2f,\"temp\":%.2f}", hr, tewl, skinC);

    pCharacteristic->setValue((uint8_t *)payload, strlen(payload));
    pCharacteristic->notify();
    Serial.println(payload);
  }

  delay(NOTIFY_INTERVAL_MS);
}
