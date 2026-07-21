/*
 * EpiLink - XIAO ESP32C3 firmware
 * Written to match the KiCad schematic exactly.
 *
 * ============================ HARDWARE ============================
 *  U1  XIAO ESP32C3
 *  U2  TCA9548A I2C mux  @ 0x70  (A0/A1/A2 -> GND, RESET -> 3V3)
 *  J3  SHT31 @ mux ch 0  -> CHAMBER LOWER  (nearest the skin)
 *  J4  SHT31 @ mux ch 1  -> CHAMBER UPPER  (farther from skin)
 *  J5  SHT31 @ mux ch 2  -> AMBIENT        (outside the chamber)
 *  TH1 10K NTC thermistor -> D0 (ADC), divider with R5 10K
 *  Q1  NMOS, gate <- D8 via R1 125R  -> film HEATER  (5V, low-side switch)
 *  Q3  NMOS, gate <- D7 via R2 100R  -> FAN          (3V3, low-side switch)
 *  I2C: SDA = D4, SCL = D5
 *
 * ========================== WHAT IT DOES ==========================
 *  1. PID-controls the film heater off the thermistor to hold the chamber
 *     at CHAMBER_SETPOINT_C, so humidity readings aren't corrupted by
 *     drifting chamber temperature.
 *  2. Reads all three SHT31s through the mux.
 *  3. Converts each RH/T pair to ABSOLUTE humidity (g/m^3).
 *  4. Computes water-vapour flux from the chamber gradient using Fick's law
 *     (the standard open-chamber TEWL method):
 *        flux = D * (AH_lower - AH_upper) / sensor_spacing
 *     reported in g/(m^2*h).
 *  5. Uses the AMBIENT sensor to reject readings taken when outside air has
 *     drifted into the chamber (gradient contaminated).
 *  6. Serves it all over BLE as JSON, on the exact UUIDs the app expects.
 *
 * ========================= APP CONTRACT ===========================
 *  Service UUID:        aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f
 *  Characteristic UUID: 7973c8f9-eb2e-47b4-9e1f-05a20cb48622
 *  Payload (NOTIFY, ~1 Hz):
 *    {"hr":72,"tewl":10.24,"temp":34.12,"amb":45.2,"chT":35.01,"ok":1}
 *  The app parses hr / tewl / temp and ignores the rest, so amb/chT/ok are
 *  free diagnostics that won't break it.
 *
 * ===================== !! READ BEFORE USE !! ======================
 *  (1) NO PULSE SENSOR EXISTS ON THIS SCHEMATIC. "hr" below is a hard-coded
 *      placeholder. See readHeartRate(). This has a real consequence for the
 *      app - see the note on that function.
 *  (2) CHAMBER_SENSOR_SPACING_M must be MEASURED on your build. The flux
 *      number is directly proportional to it; a wrong value scales every
 *      reading. It is the single most important calibration constant here.
 *  (3) D0 = GPIO2 and D8 = GPIO8 are ESP32-C3 STRAPPING pins. See the notes
 *      at those #defines - the thermistor divider on GPIO2 in particular can
 *      stop the board booting.
 *
 *  Libraries: "Adafruit SHT31 Library" + "Adafruit BusIO" (Library Manager).
 *  Board:     esp32 Arduino core 3.x, board = "XIAO_ESP32C3".
 */

#include <Wire.h>
#include <math.h>
#include "Adafruit_SHT31.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ------------------------- BLE (must match the app) -------------------------
#define SERVICE_UUID        "aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f"
#define CHARACTERISTIC_UUID "7973c8f9-eb2e-47b4-9e1f-05a20cb48622"
#define DEVICE_NAME         "EpiLink"

// ------------------------------- Pins ---------------------------------------
// NOTE (strapping): D0 = GPIO2 must be HIGH at reset on ESP32-C3. A 10K/10K
// thermistor divider parks it near 1.65 V, which can read LOW and block boot.
// If the board fails to start, that divider is the first thing to check.
#define THERMISTOR_PIN  D0
// NOTE (strapping): D8 = GPIO8. R3 (10K) pulls the gate node low at boot.
// If you see boot failures, this is the second thing to check.
#define HEATER_PIN      D8
#define FAN_PIN         D7

// --------------------------- I2C mux (TCA9548A) -----------------------------
#define MUX_ADDR        0x70
#define CH_CHAMBER_LOW  0   // J3 - nearest skin
#define CH_CHAMBER_HIGH 1   // J4 - farther from skin
#define CH_AMBIENT      2   // J5 - outside chamber
#define SHT31_ADDR      0x44

// ------------------------- Thermistor (MF52-103) ----------------------------
// Divider per schematic: 3V3 -> TH1(NTC) -> node(D0) -> R5(10K) -> GND
// If yours is wired the other way round, flip THERMISTOR_ON_HIGH_SIDE.
#define THERMISTOR_ON_HIGH_SIDE 1
const float THERM_R_FIXED   = 10000.0;  // R5
const float THERM_R_NOMINAL = 10000.0;  // 10K @ 25 C
const float THERM_T_NOMINAL = 25.0;     // deg C
const float THERM_BETA      = 3950.0;   // MF52-103
const float ADC_MAX         = 4095.0;   // 12-bit

// ----------------------- Chamber / flux calibration -------------------------
// !! MEASURE THIS on your physical build: the vertical distance between the
// sensing elements of J3 and J4 inside the chamber, in METRES.
const float CHAMBER_SENSOR_SPACING_M = 0.010f;   // 10 mm placeholder

// Diffusion coefficient of water vapour in air, m^2/s (~25 C).
const float D_WATER_VAPOUR = 2.5e-5f;

// Reject a reading if the chamber has clearly equalised with outside air:
// if the lower sensor is within this margin of ambient AH, the gradient is
// contaminated and the flux number is meaningless.
const float AMBIENT_CONTAMINATION_MARGIN = 0.15f; // g/m^3

// --------------------------- Heater PID -------------------------------------
const float CHAMBER_SETPOINT_C = 35.0f;   // hold chamber here
const float CHAMBER_MAX_SAFE_C = 42.0f;   // hard cutoff - skin contact safety
const float PID_KP = 20.0f;
const float PID_KI = 0.5f;
const float PID_KD = 5.0f;
const float PID_I_CLAMP = 200.0f;         // anti-windup
const int   HEATER_MAX_DUTY = 200;        // of 255, extra headroom vs runaway

// ------------------------------ Fan -----------------------------------------
// The gradient method needs STILL air while measuring, so the fan is off
// during measurement and only used to purge stale vapour out of the chamber.
const bool          FAN_PURGE_ENABLED  = true;
const unsigned long FAN_PURGE_EVERY_MS = 60000;  // purge once a minute
const unsigned long FAN_PURGE_MS       = 3000;   // blow for 3 s
const unsigned long FAN_SETTLE_MS      = 5000;   // then let gradient re-form

// --------------------- "Not available" sentinels ----------------------------
// The app treats an implausible hr/temp as "sensor not present" and scores it
// as ZERO risk (see isHeartRateAvailable / isTemperatureAvailable in
// lib/risk-calculator.ts). That is why we must send -1 rather than a
// plausible-looking fake number: a fake 72 bpm would silently masquerade as a
// real normal reading, and a chamber temperature would score as hypothermia.
const float HR_NOT_AVAILABLE   = -1.0f;   // no pulse sensor on this schematic
const float TEMP_NOT_AVAILABLE = -1.0f;   // no BODY-temperature sensor either

// ------------------------------ Timing --------------------------------------
const unsigned long SAMPLE_INTERVAL_MS = 1000;   // ~1 Hz, matches the app

// ------------------------------ State ---------------------------------------
Adafruit_SHT31 shtLow  = Adafruit_SHT31();
Adafruit_SHT31 shtHigh = Adafruit_SHT31();
Adafruit_SHT31 shtAmb  = Adafruit_SHT31();
bool okLow = false, okHigh = false, okAmb = false;

BLECharacteristic *pCharacteristic = nullptr;
bool deviceConnected = false;

float pidIntegral = 0.0f;
float pidLastError = 0.0f;
unsigned long lastSampleMs = 0;
unsigned long lastPurgeStartMs = 0;
enum FanState { FAN_IDLE, FAN_PURGING, FAN_SETTLING };
FanState fanState = FAN_IDLE;

float lastGoodTewl = 0.0f;

// ============================================================================
//  I2C mux
// ============================================================================
void muxSelect(uint8_t channel) {
  Wire.beginTransmission(MUX_ADDR);
  Wire.write(1 << channel);
  Wire.endTransmission();
  delayMicroseconds(200);   // let the mux settle before the next transaction
}

// ============================================================================
//  Humidity maths
// ============================================================================

// Saturation vapour pressure, hPa (Magnus/Tetens).
float saturationVapourPressure(float tC) {
  return 6.112f * expf((17.62f * tC) / (243.12f + tC));
}

// Absolute humidity in g/m^3 from RH (%) and temperature (C).
float absoluteHumidity(float rh, float tC) {
  float e = (rh / 100.0f) * saturationVapourPressure(tC);   // hPa
  return 216.7f * e / (tC + 273.15f);
}

// Fick's law across the chamber gradient -> g/(m^2*h).
float vapourFlux(float ahLow, float ahHigh) {
  float dAH = ahLow - ahHigh;                                  // g/m^3
  if (dAH < 0) dAH = 0;                                        // no negative flux
  float fluxPerSec = D_WATER_VAPOUR * dAH / CHAMBER_SENSOR_SPACING_M; // g/(m^2*s)
  return fluxPerSec * 3600.0f;                                 // g/(m^2*h)
}

// ============================================================================
//  Thermistor -> chamber temperature
// ============================================================================
float readChamberTemp() {
  int raw = analogRead(THERMISTOR_PIN);
  if (raw <= 0) raw = 1;
  if (raw >= (int)ADC_MAX) raw = (int)ADC_MAX - 1;

  float ratio = raw / ADC_MAX;                 // Vnode / Vcc
  float rTherm;
#if THERMISTOR_ON_HIGH_SIDE
  // 3V3 -> NTC -> node -> Rfixed -> GND
  rTherm = THERM_R_FIXED * (1.0f / ratio - 1.0f);
#else
  // 3V3 -> Rfixed -> node -> NTC -> GND
  rTherm = THERM_R_FIXED * (ratio / (1.0f - ratio));
#endif

  float tK = 1.0f / ((1.0f / (THERM_T_NOMINAL + 273.15f)) +
                     (1.0f / THERM_BETA) * logf(rTherm / THERM_R_NOMINAL));
  return tK - 273.15f;
}

// ============================================================================
//  Heater PID
// ============================================================================
void updateHeater(float chamberT, float dtSec) {
  // Safety first: never drive the heater above the cutoff, whatever PID says.
  if (isnan(chamberT) || chamberT >= CHAMBER_MAX_SAFE_C) {
    analogWrite(HEATER_PIN, 0);
    pidIntegral = 0;
    return;
  }

  float error = CHAMBER_SETPOINT_C - chamberT;
  float derivative = (dtSec > 0) ? (error - pidLastError) / dtSec : 0.0f;
  pidIntegral += error * dtSec;
  if (pidIntegral >  PID_I_CLAMP) pidIntegral =  PID_I_CLAMP;
  if (pidIntegral < -PID_I_CLAMP) pidIntegral = -PID_I_CLAMP;

  float out = PID_KP * error + PID_KI * pidIntegral + PID_KD * derivative;
  pidLastError = error;

  int duty = (int)out;
  if (duty < 0) duty = 0;
  if (duty > HEATER_MAX_DUTY) duty = HEATER_MAX_DUTY;
  analogWrite(HEATER_PIN, duty);
}

// ============================================================================
//  Fan purge cycle
// ============================================================================
// Returns true when the chamber is settled and a flux reading is trustworthy.
bool updateFan(unsigned long now) {
  if (!FAN_PURGE_ENABLED) {
    analogWrite(FAN_PIN, 0);
    return true;
  }

  switch (fanState) {
    case FAN_IDLE:
      if (now - lastPurgeStartMs >= FAN_PURGE_EVERY_MS) {
        lastPurgeStartMs = now;
        fanState = FAN_PURGING;
        analogWrite(FAN_PIN, 255);
      }
      return true;

    case FAN_PURGING:
      if (now - lastPurgeStartMs >= FAN_PURGE_MS) {
        fanState = FAN_SETTLING;
        analogWrite(FAN_PIN, 0);
      }
      return false;   // air is moving - gradient invalid

    case FAN_SETTLING:
      if (now - lastPurgeStartMs >= FAN_PURGE_MS + FAN_SETTLE_MS) {
        fanState = FAN_IDLE;
        return true;
      }
      return false;   // gradient still re-forming
  }
  return true;
}

// ============================================================================
//  Heart rate
// ============================================================================
/*  !!! THERE IS NO PULSE SENSOR ON THE ATTACHED SCHEMATIC. !!!
 *
 *  This returns a fixed placeholder so the JSON stays valid - the app rejects
 *  any packet where hr/tewl/temp isn't a finite number, so sending NaN here
 *  would throw away the humidity data too.
 *
 *  CONSEQUENCE, PLEASE READ: the app's risk rule requires a TEWL rise AND a
 *  corroborating heart-rate abnormality before it will escalate. With hr
 *  pinned at a normal 72, that corroboration can never happen, so the app
 *  will stay in the Safe band no matter how high the measured flux goes.
 *  A pulse sensor (or an agreed change to that rule) is required before the
 *  end-to-end alerting path can work.
 *
 *  Mux channels 3-7 are free if you add an I2C pulse sensor.
 */
float readHeartRate() {
  return HR_NOT_AVAILABLE;   // no pulse sensor wired - see note above
}

// ============================================================================
//  BLE server callbacks
// ============================================================================
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *s) override {
    deviceConnected = true;
    Serial.println("BLE connected");
  }
  void onDisconnect(BLEServer *s) override {
    deviceConnected = false;
    Serial.println("BLE disconnected - re-advertising");
    s->getAdvertising()->start();
  }
};

// ============================================================================
//  Setup
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(HEATER_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  analogWrite(HEATER_PIN, 0);
  analogWrite(FAN_PIN, 0);

  Wire.begin();          // XIAO ESP32C3 default: SDA = D4, SCL = D5

  muxSelect(CH_CHAMBER_LOW);
  okLow  = shtLow.begin(SHT31_ADDR);
  muxSelect(CH_CHAMBER_HIGH);
  okHigh = shtHigh.begin(SHT31_ADDR);
  muxSelect(CH_AMBIENT);
  okAmb  = shtAmb.begin(SHT31_ADDR);

  Serial.printf("SHT31 low(ch0)=%d high(ch1)=%d amb(ch2)=%d\n", okLow, okHigh, okAmb);
  if (!okLow || !okHigh) {
    Serial.println("ERROR: a chamber sensor is missing - flux cannot be computed.");
  }

  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setMTU(185);          // room for the JSON payload

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
      CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  // ---- Advertising layout matters here ----
  // A BLE advertisement is limited to 31 bytes. A 128-bit service UUID costs
  // 18 of them (2 header + 16 UUID) and flags cost 3, leaving ~10 bytes for
  // the name. The old name "AnaphylaxisGuard" (16 chars = 18 bytes) blew past
  // that limit, so the stack silently dropped the service UUID - and the app,
  // which scanned filtered by that UUID, could never see this device.
  // "EpiLink" (7 chars = 9 bytes) fits: 3 + 18 + 9 = 30 <= 31.
  // We additionally push the name into the SCAN RESPONSE packet, which is a
  // separate 31 bytes, so the advertisement itself only has to carry the UUID.
  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);

  BLEAdvertisementData scanResponse;
  scanResponse.setName(DEVICE_NAME);
  adv->setScanResponseData(scanResponse);

  BLEDevice::startAdvertising();

  Serial.println("Advertising as " DEVICE_NAME " - service " SERVICE_UUID);
  lastSampleMs = millis();
  lastPurgeStartMs = millis();
}

// ============================================================================
//  Main loop
// ============================================================================
void loop() {
  unsigned long now = millis();
  if (now - lastSampleMs < SAMPLE_INTERVAL_MS) return;
  float dtSec = (now - lastSampleMs) / 1000.0f;
  lastSampleMs = now;

  // --- chamber temperature + heater PID (always runs, even when idle) ---
  float chamberT = readChamberTemp();
  updateHeater(chamberT, dtSec);

  // --- fan purge state machine; tells us if the gradient is trustworthy ---
  bool gradientValid = updateFan(now);

  // --- read the three SHT31s through the mux ---
  float rhLow = NAN, tLow = NAN, rhHigh = NAN, tHigh = NAN, rhAmb = NAN, tAmb = NAN;

  if (okLow)  { muxSelect(CH_CHAMBER_LOW);  rhLow  = shtLow.readHumidity();  tLow  = shtLow.readTemperature(); }
  if (okHigh) { muxSelect(CH_CHAMBER_HIGH); rhHigh = shtHigh.readHumidity(); tHigh = shtHigh.readTemperature(); }
  if (okAmb)  { muxSelect(CH_AMBIENT);      rhAmb  = shtAmb.readHumidity();  tAmb  = shtAmb.readTemperature(); }

  bool chamberOk = !isnan(rhLow) && !isnan(tLow) && !isnan(rhHigh) && !isnan(tHigh);

  // --- flux ---
  float tewl = lastGoodTewl;   // hold last good value if this sample is unusable
  bool  valid = false;

  if (chamberOk && gradientValid) {
    float ahLow  = absoluteHumidity(rhLow,  tLow);
    float ahHigh = absoluteHumidity(rhHigh, tHigh);

    // Ambient correction: if the near-skin sensor has fallen to ambient
    // humidity, outside air has flooded the chamber and the gradient is junk.
    bool contaminated = false;
    if (okAmb && !isnan(rhAmb) && !isnan(tAmb)) {
      float ahAmb = absoluteHumidity(rhAmb, tAmb);
      if ((ahLow - ahAmb) < AMBIENT_CONTAMINATION_MARGIN) contaminated = true;
    }

    if (!contaminated) {
      tewl = vapourFlux(ahLow, ahHigh);
      lastGoodTewl = tewl;
      valid = true;
    }
  }

  // --- report ---
  // IMPORTANT: this hardware has NO body-temperature sensor. The thermistor
  // measures the PID-heated chamber, and both in-chamber SHT31s measure that
  // same heated air (~CHAMBER_SETPOINT_C). Sending any of those as the
  // patient's temperature would make a healthy person read as hypothermic on
  // every sample, so we send the "unavailable" sentinel instead. The real
  // chamber temperature still goes out as the diagnostic field "chT".
  float reportTemp = TEMP_NOT_AVAILABLE;
  float hr = readHeartRate();

  if (deviceConnected) {
    char payload[128];
    snprintf(payload, sizeof(payload),
             "{\"hr\":%.0f,\"tewl\":%.2f,\"temp\":%.2f,\"amb\":%.1f,\"chT\":%.2f,\"ok\":%d}",
             hr, tewl, reportTemp, isnan(rhAmb) ? 0.0f : rhAmb, chamberT, valid ? 1 : 0);
    pCharacteristic->setValue((uint8_t *)payload, strlen(payload));
    pCharacteristic->notify();
    Serial.println(payload);
  } else {
    Serial.printf("(idle) chT=%.2f tewl=%.2f valid=%d\n", chamberT, tewl, valid);
  }
}
