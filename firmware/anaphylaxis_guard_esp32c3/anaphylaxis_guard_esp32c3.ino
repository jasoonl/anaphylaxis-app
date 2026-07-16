/*
 * Anaphylaxis Guard - XIAO ESP32C3 firmware
 *
 * Broadcasts heart rate, transepidermal water loss (TEWL), and temperature
 * over BLE as a JSON string, on a single notifying characteristic.
 *
 * This MUST match lib/ble-real.ts in the app:
 *   Service UUID:        aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f
 *   Characteristic UUID: 7973c8f9-eb2e-47b4-9e1f-05a20cb48622
 *   Payload format:      {"hr":<number>,"tewl":<number>,"temp":<number>}
 *
 * The app filters its scan by the Service UUID, so the device name is just a
 * friendly label. It subscribes to notifications on the characteristic and
 * parses each JSON packet.
 *
 * Board: Seeed Studio XIAO ESP32C3
 * Library: ESP32 BLE Arduino (bundled with the esp32 Arduino core)
 *
 * === Wiring your real sensors ===
 * Replace the readHeartRate(), readTewl(), readTemperature() stubs below with
 * real reads from your pulse sensor, TEWL/humidity sensor, and temperature
 * sensor. Everything else (BLE setup, JSON formatting, notify loop) stays.
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define SERVICE_UUID        "aaf868e4-de2f-4d65-9801-ce8dc3ffcb8f"
#define CHARACTERISTIC_UUID "7973c8f9-eb2e-47b4-9e1f-05a20cb48622"
#define DEVICE_NAME         "AnaphylaxisGuard"

// How often to push a new reading (milliseconds). 1000ms = 1 Hz, matching
// the app's previous simulated tick rate.
#define NOTIFY_INTERVAL_MS  1000

BLECharacteristic *pCharacteristic = nullptr;
bool deviceConnected = false;

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    deviceConnected = true;
  }
  void onDisconnect(BLEServer *pServer) override {
    deviceConnected = false;
    // Restart advertising so the phone can reconnect.
    pServer->getAdvertising()->start();
  }
};

// ----- Replace these three stubs with real sensor reads -----

float readHeartRate() {
  // TODO: read from your pulse sensor. Returns beats per minute.
  return 72.0;
}

float readTewl() {
  // TODO: read from your TEWL / skin-humidity sensor. Returns g/m^2/h.
  return 10.0;
}

float readTemperature() {
  // TODO: read from your temperature sensor. Returns degrees Celsius.
  return 36.8;
}

// ------------------------------------------------------------

void setup() {
  Serial.begin(115200);

  BLEDevice::init(DEVICE_NAME);
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  // BLE2902 descriptor lets clients subscribe to notifications.
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
    float hr = readHeartRate();
    float tewl = readTewl();
    float temp = readTemperature();

    // Build the JSON payload the app expects. Two decimals is plenty and
    // keeps the packet small.
    char payload[96];
    snprintf(payload, sizeof(payload),
             "{\"hr\":%.1f,\"tewl\":%.2f,\"temp\":%.2f}", hr, tewl, temp);

    pCharacteristic->setValue((uint8_t *)payload, strlen(payload));
    pCharacteristic->notify();

    Serial.println(payload);
  }

  delay(NOTIFY_INTERVAL_MS);
}
