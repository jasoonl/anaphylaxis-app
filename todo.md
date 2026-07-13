# Anaphylaxis Guard - Project TODO

## Core Features

### Onboarding & Setup
- [x] Onboarding welcome screen with app introduction
- [x] Device pairing screen with Bluetooth scanning
- [x] Demo mode option (simulated sensor data)
- [x] User profile setup (name, allergies, severity)

### Dashboard (Home Screen)
- [x] Risk status indicator (circular, color-coded: Green/Yellow/Red)
- [x] Real-time risk score display (0-100)
- [x] Vital signs grid (Heart Rate, GSR, Temperature, Connection Status)
- [x] Recent alerts list
- [x] Quick action buttons (Emergency, View Details)

### Health Metrics
- [x] Health metrics detail screen with tabs for each sensor
- [x] Real-time graph/waveform display
- [x] Statistics panel (current, min, max, average, baseline)
- [x] Threshold indicators on graphs
- [x] Historical data view (last hour, last day)

### Emergency Contacts
- [x] Emergency contacts list screen
- [x] Add emergency contact form
- [x] Edit emergency contact functionality
- [x] Delete emergency contact functionality
- [x] Toggle notifications per contact
- [x] Test alert button

### Emergency Alert System
- [x] Emergency alert screen (full-screen modal)
- [x] "Call 911" button integration
- [x] "Administer Epinephrine" guidance
- [x] "Notify Contacts" button
- [x] Automatic SMS/notification sending to emergency contacts
- [x] Alert dismissal with safety delay (10 seconds)
- [x] Alert history/log

### Settings & Profile
- [x] Settings screen with all configuration options
- [x] User profile editing (name, allergies, severity)
- [x] Device management (reconnect, forget device)
- [x] Notification preferences (push, sound, vibration)
- [x] Risk threshold configuration (advanced)
- [x] About section with app version and disclaimer

### Bluetooth Connectivity
- [x] BLE device scanning and discovery
- [x] Device pairing and connection
- [x] Real-time data reception from wearable
- [x] Connection status indicator
- [x] Graceful disconnection/reconnection handling
- [x] Fallback to demo mode if device unavailable

### Risk Detection Algorithm
- [x] Heart rate analysis for anaphylaxis indicators
- [x] Skin conductance (GSR) analysis
- [x] Temperature change detection
- [x] Multi-sensor risk scoring algorithm
- [x] Threshold-based alert triggering
- [x] Configurable sensitivity levels

### Data & Storage
- [x] Local data persistence with AsyncStorage
- [x] Sensor data timestamping
- [x] Historical data logging
- [x] Emergency contact persistence
- [x] User profile persistence
- [x] Alert history storage

### UI/UX Polish
- [ ] Tab bar navigation setup
- [ ] Consistent color scheme and branding
- [ ] Responsive layout for different screen sizes
- [ ] Dark mode support
- [ ] Loading states and error handling
- [ ] Haptic feedback for interactions
- [ ] Smooth transitions between screens

### Testing & Validation
- [ ] Unit tests for risk calculation algorithm
- [ ] Integration tests for BLE connectivity
- [ ] UI testing on iOS and Android
- [ ] Emergency alert flow testing
- [ ] Contact notification testing
- [ ] Demo mode validation

### Documentation & Deployment
- [ ] In-app help/tutorial
- [ ] Medical disclaimer and usage guidelines
- [ ] Xcode export preparation
- [ ] iOS build configuration
- [ ] Android build configuration
- [ ] App store metadata (description, screenshots)

## Known Limitations & Notes

- App is a **prototype companion tool** and should not be used as a standalone medical diagnostic device
- Risk detection algorithm is based on project research; clinical validation is recommended before medical use
- Requires compatible wearable device with BLE support (XIAO ESP32 C3 or similar)
- Demo mode uses simulated sensor data for testing without hardware
- Emergency alerts require valid emergency contact phone numbers for SMS delivery
