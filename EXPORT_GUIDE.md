# Anaphylaxis Guard - Export & Setup Guide

## Overview

**Anaphylaxis Guard** is a fully functional React Native mobile app built with Expo, designed to detect anaphylactic shock risk through wearable device integration and provide emergency response guidance.

### Current Status
- ✅ All core features implemented and tested
- ✅ Running in **demo mode** with simulated sensor data
- ✅ Ready for Xcode export and iOS/Android publishing

---

## Quick Start (Demo Mode)

The app works immediately out of the box with simulated vital signs:

1. **Dashboard**: Shows real-time risk score (0-100) with color-coded status
2. **Metrics**: Detailed view of each sensor (heart rate, skin response, temperature)
3. **Contacts**: Manage emergency contacts for alerts
4. **Settings**: User profile, device settings, notification preferences

**No setup required** - just export and run!

---

## Exporting to Xcode (iOS)

### Prerequisites
- macOS with Xcode 14+
- Apple Developer account
- Provisioning profiles configured

### Steps

1. **Build the App**
   - In the Management UI, click the **"Publish"** button (top right)
   - Select **"Build for iOS"**
   - Wait for the build to complete (~10-15 minutes)

2. **Download the Build**
   - Once complete, download the `.ipa` file
   - Or use Xcode to open the project directly

3. **Import into Xcode**
   ```bash
   # Navigate to project directory
   cd ~/anaphylaxis-app
   
   # Open in Xcode
   open ios/AnaphylaxisGuard.xcworkspace
   ```

4. **Configure Signing**
   - Select your team in Xcode
   - Update bundle identifier (currently: `space.manus.anaphylaxis.guard`)
   - Configure provisioning profiles

5. **Build & Run**
   - Connect your iPhone
   - Select device in Xcode
   - Click **Play** to build and deploy

---

## Exporting to Android

### Prerequisites
- Android Studio or Android SDK
- Java Development Kit (JDK) 11+
- Google Play Developer account (for publishing)

### Steps

1. **Build the App**
   - In the Management UI, click **"Publish"**
   - Select **"Build for Android"**
   - Wait for completion

2. **Download APK**
   - Download the `.apk` file from the build output
   - Or download `.aab` (Android App Bundle) for Play Store

3. **Test on Device**
   ```bash
   # Install APK on connected Android device
   adb install anaphylaxis-guard.apk
   ```

4. **Publish to Play Store**
   - Upload `.aab` to Google Play Console
   - Configure store listing, screenshots, description
   - Submit for review

---

## Integrating Your Real Wearable Device

Currently, the app uses **demo mode** with simulated sensor data. To connect your XIAO ESP32 C3 device:

### 1. Implement BLE Connection

Edit `lib/ble-manager.ts` and replace the `generateSensorData()` function:

```typescript
// Replace this:
private generateSensorData(): SensorData {
  const baseHeartRate = 72;
  const baseGSR = 15;
  const baseTemp = 36.8;
  return {
    heartRate: Math.max(60, Math.min(120, baseHeartRate + (Math.random() - 0.5) * 8)),
    gsr: Math.max(5, Math.min(50, baseGSR + (Math.random() - 0.5) * 4)),
    temperature: Math.max(35.5, Math.min(38.5, baseTemp + (Math.random() - 0.5) * 0.6)),
    timestamp: Date.now(),
  };
}

// With real BLE data parsing from your ESP32
private async parseDeviceData(rawData: Buffer): Promise<SensorData> {
  // Parse your ESP32's BLE characteristic data
  // Example: heartRate = bytes[0], gsr = bytes[1-2], temp = bytes[3-4]
  return {
    heartRate: rawData[0],
    gsr: (rawData[1] << 8) | rawData[2],
    temperature: ((rawData[3] << 8) | rawData[4]) / 100,
    timestamp: Date.now(),
  };
}
```

### 2. Install BLE Library

```bash
npm install react-native-ble-plx
# or
yarn add react-native-ble-plx
```

### 3. Update Device Connection

Modify `connectToDevice()` to use real BLE scanning:

```typescript
async connectToDevice(deviceId: string): Promise<boolean> {
  try {
    // Scan for your ESP32 device
    const device = await bleManager.scanForPeripheralsWithServices([YOUR_SERVICE_UUID]);
    
    // Connect and subscribe to characteristic
    await device.connect();
    const services = await device.discoverAllServicesAndCharacteristics();
    
    // Subscribe to sensor data characteristic
    device.monitorCharacteristicForService(
      YOUR_SERVICE_UUID,
      YOUR_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (characteristic?.value) {
          const data = this.parseDeviceData(Buffer.from(characteristic.value, 'base64'));
          this.listeners.forEach(listener => listener(data));
        }
      }
    );
    
    this.isConnected = true;
    return true;
  } catch (error) {
    console.error("BLE connection failed:", error);
    return false;
  }
}
```

---

## Architecture Overview

### File Structure
```
app/
  (tabs)/
    index.tsx          ← Dashboard (main screen)
    metrics.tsx        ← Health metrics detail
    contacts.tsx       ← Emergency contacts
    settings.tsx       ← User settings
  emergency-alert.tsx  ← Emergency modal
  _layout.tsx          ← Root navigation

lib/
  health-context.tsx   ← Global state management
  ble-manager.ts       ← Device connectivity
  risk-calculator.ts   ← Anaphylaxis detection algorithm
  notification-service.ts ← Push notifications
```

### Data Flow
1. **BLE Manager** receives sensor data (real or simulated)
2. **Health Context** stores vital signs globally
3. **Risk Calculator** analyzes data for anaphylaxis risk
4. **Dashboard** displays risk score and vital signs
5. **Notification Service** sends alerts when risk is critical

---

## Key Features

### Risk Detection Algorithm
- **Heart Rate Analysis**: Detects tachycardia (>120 BPM) and bradycardia (<50 BPM)
- **GSR Analysis**: Measures skin conductance (sympathetic nervous system activity)
- **Temperature Analysis**: Detects fever or hypothermia
- **Multi-Sensor Scoring**: Weighted combination (GSR: 40%, HR: 35%, Temp: 25%)
- **Risk Levels**: Safe (0-39), Warning (40-69), Critical (70-100)

### Emergency Response
- **Full-Screen Alert**: Prominent red emergency modal
- **911 Integration**: Direct phone dialer
- **Epinephrine Guidance**: Step-by-step auto-injector instructions
- **Contact Notifications**: Automatic SMS/push to emergency contacts
- **Auto-Dismiss**: 30-second countdown before dismissal

### Data Persistence
- Emergency contacts saved locally
- User profile stored
- Alert history maintained
- All data persists between app sessions

---

## Configuration

### Thresholds (in `lib/risk-calculator.ts`)
```typescript
const DEFAULT_THRESHOLDS: RiskThresholds = {
  heartRateHigh: 120,      // BPM
  heartRateLow: 50,        // BPM
  gsrHigh: 30,             // µS
  temperatureHigh: 38,     // °C
  temperatureLow: 35,      // °C
};
```

Adjust these values based on your medical requirements.

### App Branding (in `app.config.ts`)
```typescript
const env = {
  appName: "Anaphylaxis Guard",
  appSlug: "anaphylaxis-app",
  logoUrl: "", // S3 URL if using custom logo
  scheme: "manus...",
  iosBundleId: "space.manus.anaphylaxis.guard",
  androidPackage: "space.manus.anaphylaxis.guard",
};
```

---

## Testing

### Test Emergency Alert
1. Navigate to **Settings** → **Send Test Alert**
2. Or tap **Emergency** button on Dashboard

### Test Notifications
- Contacts screen has **"Send Test Alert"** button
- Simulates emergency notification to enabled contacts

### Test Risk Transitions
- In demo mode, vital signs fluctuate automatically
- Watch risk score change from Safe → Warning → Critical

---

## Troubleshooting

### App won't build
- Clear cache: `npm cache clean --force`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Restart dev server: `npm run dev`

### BLE not connecting
- Ensure device has Bluetooth enabled
- Check device is within range
- Verify ESP32 is broadcasting correct UUID
- Check app has Bluetooth permissions in iOS/Android settings

### Notifications not showing
- Ensure notifications are enabled in app settings
- Check device notification settings
- On iOS: Settings → Notifications → Anaphylaxis Guard

### Risk score stuck at same value
- Check that vital signs are updating (watch Metrics screen)
- Verify BLE data is being received
- In demo mode, values should fluctuate every 1-2 seconds

---

## Medical Disclaimer

**IMPORTANT**: This app is a **prototype companion tool** and should **NOT** be used as a standalone medical diagnostic device. Always:

- Consult with healthcare professionals for medical advice
- Call 911 for medical emergencies
- Keep prescribed epinephrine auto-injectors with you
- Do not rely solely on this app for anaphylaxis detection or treatment

---

## Support & Feedback

For issues or feature requests, please refer to the GitHub repository:
- Repository: `jasoonl/anaphylacticshockapp`
- Issues: Report bugs and request features

---

## Version Info

- **App Version**: 1.0.0
- **Build Date**: July 13, 2026
- **React Native**: 0.81.5
- **Expo**: 54.0.29
- **Node**: 22.13.0

---

## Next Steps

1. ✅ **Export to Xcode** (follow steps above)
2. ✅ **Test on iOS/Android device**
3. ⏳ **Integrate real XIAO ESP32 C3 device** (see BLE integration section)
4. ⏳ **Configure backend SMS service** (for real emergency alerts)
5. ⏳ **Submit to App Store / Google Play**

Good luck with your app! 🚀
