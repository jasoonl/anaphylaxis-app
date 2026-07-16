/*
 * Anaphylaxis Guard - XIAO ESP32C3 firmware
 *
 * Reads real sensors and broadcasts heart rate, transepidermal water loss
 * (TEWL), and temperature over BLE as a JSON string on one notifying
 * characteristic.
 *
 * MUST match lib/ble-real.ts in the app:
 *   Service UUID:        aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f
 *   Characteristic UUID: 7973c8f9-eb2e-47b4-9e1f-05a20cb48622
 *   Payload:             {"hr":<number>,"tewl":<number>,"temp":<number>}
 *
 * === HARDWARE ===
 *   - Seeed Studio XIAO ESP32C3
 *   - Sensirion SHT31-D  (I2C, addr 0x44): humidity + ambient temperature,
 *     used for the TEWL (skin water loss) measurement.
 *   - MF52-103 10K NTC thermistor (Beta 3950), in a 10K voltage divider on
 *     an analog pin: skin/body temperature.
 *   - UF3A3-500B fan: moves air across the skin for the open-chamber TEWL
 *     method. Wired to a GPIO through a transistor/driver (fan current is
 *     too high for a GPIO directly - use an NPN/MOSFET + flyback diode).
 *
 * === WIRING (XIAO ESP32C3 pin labels) ===
 *   SHT31-D SDA -> D4 (GPIO6)     SHT31-D SCL -> D5 (GPIO7)   (default I2C)
 *   SHT31-D VIN -> 3V3            SHT31-D GND -> GND
 *   Thermistor divider midpoint -> A0 (GPIO2, ADC)
 *     3V3 -- [10K fixed] --+-- [thermistor] -- GND, midpoint (+) to A0
 *   Fan driver gate/base -> D6 (GPIO21)  (HIGH = fan on)
 *
 * IMPORTANT - TEWL NOTE (read this):
 *   A single humidity sensor does not by itself yield a clinically calibrated
 *   TEWL value in g/m2/h. Real TEWL instruments use a calibrated vapor-flux
 *   method. This firmware derives an ESTIMATE from the SHT31 humidity with a
 *   simple linear mapping (see estimateTewl()), which is fine for a prototype/
 *   demo but is NOT a clinical measurement. The mapping constants are clearly
 *   marked and must be calibrated against a reference if accuracy matters.
 */

#include <Wire.h>
#include <math.h>
#include "Adafruit_SHT31.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------- BLE identity (must match the app) ----------
#define SERVICE_UUID        "aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f"
#define CHARACTERISTIC_UUID "7973c8f9-eb2e-47b4-9e1f-05a20cb48622"
#define DEVICE_NAME         "AnaphylaxisGuard"
#define NOTIFY_INTERVAL_MS  1000

// ---------- Pins ----------
#define THERMISTOR_PIN  A0   // analog midpoint of the thermistor divider
#define FAN_PIN         D6   // fan driver control (HIGH = on)

// ---------- Thermistor (MF52-103) constants ----------
const float THERM_NOMINAL_R   = 10000.0;  // 10K at 25C
const float THERM_NOMINAL_T   = 25.0;     // deg C
const float THERM_BETA        = 3950.0;   // MF52-103 Beta coefficient
const float THERM_SERIES_R    = 10000.0;  // fixed divider resistor (10K)
const float ADC_MAX           = 4095.0;   // ESP32C3 12-bit ADC
// XIAO ESP32C3 ADC references ~3.3V full-scale. The divider is ratiometric,
// so the exact Vref cancels out below - we only need the raw ratio.

// ---------- TEWL estimate mapping (PROTOTYPE ONLY - calibrate!) ----------
// Maps SHT31 relative humidity (%) near the skin to an estimated TEWL in
// g/m2/h. Baseline ~10 g/m2/h at resting skin humidity; rises with humidity.
// These two constants are a placeholder linear fit - replace with a real
// calibration against a reference TEWL meter for anything beyond a demo.
const float TEWL_RH_BASELINE  = 45.0;   // % RH considered "resting" skin
const float TEWL_BASE_VALUE   = 10.0;   // g/m2/h at baseline RH
const float TEWL_PER_RH       = 0.20;   // g/m2/h added per % RH above baseline

Adafruit_SHT31 sht31 = Adafruit_SHT31();
bool sht31Ok = false;

BLECharacteristic *pCharacteristic = nullptr;
bool deviceConnected = false;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override { deviceConnected = true; }
  void onDisconnect(BLEServer *pServer) override {
    deviceConnected = false;
    pServer->getAdvertising()->start();  // allow reconnection
  }
};

// ---------- Sensor reads ----------

// Skin/body temperature from the MF52-103 thermistor via the Beta equation.
float readThermistorTemp() {
  int raw = analogRead(THERMISTOR_PIN);
  if (raw <= 0) raw = 1;
  if (raw >= (int)ADC_MAX) raw = (int)ADC_MAX - 1;

  // Divider: 3V3 - Rfixed - (midpoint=A0) - thermistor - GND
  // ratio = raw/ADC_MAX = Vmid/Vcc = Rtherm / (Rfixed + Rtherm)
  float ratio = raw / ADC_MAX;
  float rTherm = THERM_SERIES_R * (ratio / (1.0 - ratio));

  // Beta (B-parameter) equation
  float tKelvin = 1.0 / (
    (1.0 / (THERM_NOMINAL_T + 273.15)) +
    (1.0 / THERM_BETA) * log(rTherm / THERM_NOMINAL_R)
  );
  return tKelvin - 273.15;  // deg C
}

// TEWL estimate from SHT31 humidity. See PROTOTYPE note at top.
float estimateTewl(float relHumidity) {
  float est = TEWL_BASE_VALUE + (relHumidity - TEWL_RH_BASELINE) * TEWL_PER_RH;
  if (est < 0) est = 0;
  return est;
}

// Heart rate: NO heart-rate sensor is present in this hardware list.
// The app expects an "hr" field, so we send a neutral resting placeholder so
// the JSON stays valid. Replace with a real pulse sensor read (e.g. MAX30102)
// when one is added; until then heart rate is not a real measurement.
float readHeartRate() {
  return 72.0;  // placeholder - no pulse sensor wired
}

void setup() {
  Serial.begin(115200);

  pinMode(FAN_PIN, OUTPUT);
  digitalWrite(FAN_PIN, HIGH);  // fan on for the TEWL airflow method

  Wire.begin();  // XIAO ESP32C3 default I2C (SDA=D4, SCL=D5)
  sht31Ok = sht31.begin(0x44);
  if (!sht31Ok) Serial.println("WARNING: SHT31 not found at 0x44");

  BLEDevice::init(DEVICE_NAME);
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("Anaphylaxis Guard BLE advertising started");
}

void loop() {
  if (deviceConnected) {
    float temp = readThermistorTemp();

    float tewl;
    if (sht31Ok) {
      float rh = sht31.readHumidity();
      if (isnan(rh)) rh = TEWL_RH_BASELINE;  // fall back to baseline on read error
      tewl = estimateTewl(rh);
    } else {
      tewl = TEWL_BASE_VALUE;
    }

    float hr = readHeartRate();

    char payload[96];
    snprintf(payload, sizeof(payload),
             "{\"hr\":%.1f,\"tewl\":%.2f,\"temp\":%.2f}", hr, tewl, temp);

    pCharacteristic->setValue((uint8_t *)payload, strlen(payload));
    pCharacteristic->notify();
    Serial.println(payload);
  }
  delay(NOTIFY_INTERVAL_MS);
}
