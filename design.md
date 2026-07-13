# Anaphylaxis Guard - Mobile App Design

## Overview
Anaphylaxis Guard is a companion mobile app for a wearable health monitoring device designed to detect early physiological indicators of anaphylactic shock. The app displays real-time sensor data, calculates risk scores, and triggers emergency alerts with automated contact notifications.

## Design Principles
- **Mobile-first**: Optimized for portrait orientation (9:16) and one-handed usage
- **Clarity under stress**: Large, readable text and clear visual indicators for emergency situations
- **Accessibility**: High contrast, intuitive navigation, and clear call-to-action buttons
- **iOS-native feel**: Follows Apple Human Interface Guidelines for a polished, first-party app experience

## Screen List

### 1. Onboarding / Welcome Screen
- **Purpose**: First-time user setup and device pairing introduction
- **Content**: 
  - App title and mission statement
  - Brief explanation of how the app works
  - "Get Started" button to proceed to device pairing
  - "Learn More" link to detailed information

### 2. Device Pairing Screen
- **Purpose**: Connect to the wearable device via Bluetooth
- **Content**:
  - "Scan for Devices" button
  - List of available Bluetooth devices
  - Connection status indicator
  - Instructions for manual pairing if needed
  - "Skip for Demo" option to use simulated data

### 3. Dashboard (Home Screen)
- **Purpose**: Primary interface showing real-time health status
- **Content**:
  - **Risk Status Card** (top, prominent): Large circular risk indicator (Green/Yellow/Red)
  - **Current Risk Score**: Numeric value (0-100) with trend indicator
  - **Vital Signs Grid**: Four metric cards showing:
    - Heart Rate (BPM)
    - Skin Conductance (GSR)
    - Temperature (°C/°F)
    - Status indicator (Connected/Disconnected)
  - **Recent Alerts**: Scrollable list of recent risk events
  - **Quick Actions**: 
    - "Emergency" button (red, prominent)
    - "View Details" button

### 4. Health Metrics Detail Screen
- **Purpose**: Detailed view of individual sensor readings and historical trends
- **Content**:
  - Metric selector (tabs or picker for Heart Rate, GSR, Temperature)
  - **Live Graph**: Real-time waveform or trend chart (last 5-10 minutes)
  - **Statistics Panel**:
    - Current value
    - Min/Max (last hour)
    - Average
    - Baseline comparison
  - **Threshold Indicators**: Visual markers showing normal vs. alert thresholds
  - Back button to Dashboard

### 5. Emergency Contacts Screen
- **Purpose**: Manage and configure emergency notification recipients
- **Content**:
  - **Contacts List**: 
    - Contact name, phone number, relationship
    - Toggle to enable/disable notifications
    - Edit/Delete buttons
  - **Add Contact Button**: Opens form to add new emergency contact
  - **Auto-Alert Settings**:
    - Toggle: "Send alerts automatically on high risk"
    - Alert threshold selector (Yellow / Red)
  - **Test Alert Button**: Send test notification to all enabled contacts

### 6. Emergency Contact Form (Modal)
- **Purpose**: Add or edit emergency contact information
- **Content**:
  - Name input field
  - Phone number input field
  - Relationship selector (Family, Friend, Doctor, Other)
  - Notification preference checkboxes
  - Save / Cancel buttons

### 7. Emergency Alert Screen (Full-Screen Modal)
- **Purpose**: Displayed when anaphylaxis risk is detected
- **Content**:
  - **Large "EMERGENCY" banner** (red background)
  - **Risk Status**: "HIGH RISK DETECTED - ANAPHYLAXIS SUSPECTED"
  - **Recommended Actions**:
    - "Call 911" button (prominent, red)
    - "Administer Epinephrine" button (secondary)
    - "Notify Contacts" button
  - **Sensor Data**: Current vital signs for reference
  - **Countdown Timer**: Time since alert triggered
  - **Dismiss" button (only after 10 seconds, to prevent accidental dismissal)

### 8. Settings Screen
- **Purpose**: App configuration and user preferences
- **Content**:
  - **User Profile Section**:
    - Name input
    - Known allergies input
    - Allergy severity selector
  - **Device Settings**:
    - Connected device name
    - Reconnect button
    - Forget device button
  - **Notification Settings**:
    - Toggle push notifications
    - Sound preference
    - Vibration preference
  - **Risk Thresholds** (Advanced):
    - Heart rate threshold (BPM)
    - Skin conductance threshold (µS)
    - Temperature threshold (°C)
  - **About**:
    - App version
    - Help / Support link
    - Disclaimer about medical use

### 9. Settings - Edit Profile (Modal)
- **Purpose**: Update personal health information
- **Content**:
  - Name input
  - Allergies text area
  - Severity selector (Mild / Moderate / Severe)
  - Save / Cancel buttons

## Primary User Flows

### Flow 1: First-Time Setup
1. User launches app → Onboarding screen
2. Taps "Get Started"
3. Proceeds to Device Pairing screen
4. Scans for Bluetooth devices
5. Selects wearable device
6. Waits for connection confirmation
7. Proceeds to Dashboard
8. Optionally configures emergency contacts

### Flow 2: Monitoring Health
1. User is on Dashboard
2. App receives real-time sensor data from wearable
3. Risk score is calculated and displayed
4. If risk is normal (Green): Dashboard shows calm status
5. If risk is elevated (Yellow): Visual indicator changes, optional notification
6. If risk is critical (Red): Emergency alert screen appears

### Flow 3: Emergency Response
1. Emergency alert screen appears (automatic or manual trigger)
2. User sees "EMERGENCY" banner and recommended actions
3. User taps "Call 911" or "Administer Epinephrine"
4. User can tap "Notify Contacts" to send automated alerts
5. App sends SMS/push notifications to emergency contacts
6. User can dismiss alert after 10 seconds

### Flow 4: Managing Emergency Contacts
1. User navigates to Emergency Contacts screen
2. Views list of configured contacts
3. Taps "Add Contact" button
4. Enters contact details (name, phone, relationship)
5. Toggles notification preference
6. Saves contact
7. Contact appears in list and receives alerts when triggered

### Flow 5: Viewing Detailed Metrics
1. User is on Dashboard
2. Taps "View Details" button or specific metric card
3. Proceeds to Health Metrics Detail screen
4. Selects metric from tabs (Heart Rate, GSR, Temperature)
5. Views live graph and statistics
6. Compares current values to thresholds
7. Returns to Dashboard

## Color Choices (Anaphylaxis Guard Brand)

| Element | Color | Usage |
|---------|-------|-------|
| **Primary** | `#0066CC` (Medical Blue) | Buttons, links, primary actions |
| **Success** | `#22C55E` (Green) | Normal/safe status, low risk |
| **Warning** | `#F59E0B` (Amber) | Elevated risk, caution |
| **Danger** | `#EF4444` (Red) | Critical risk, emergency |
| **Background** | `#FFFFFF` (White) / `#151718` (Dark) | Screen background |
| **Surface** | `#F5F5F5` (Light Gray) / `#1E2022` (Dark Gray) | Cards, elevated surfaces |
| **Text** | `#11181C` (Dark) / `#ECEDEE` (Light) | Primary text |
| **Muted** | `#687076` (Gray) / `#9BA1A6` (Light Gray) | Secondary text |
| **Border** | `#E5E7EB` (Light) / `#334155` (Dark) | Dividers, borders |

## Key Interactions

- **Risk Status Card**: Tappable to view detailed risk breakdown
- **Metric Cards**: Tappable to navigate to detailed metric view
- **Emergency Button**: Always accessible, triggers emergency alert screen
- **Contacts List**: Swipe to delete, tap to edit
- **Settings**: All toggles provide immediate visual feedback

## Accessibility Considerations

- All text has minimum 16pt font size for readability
- Color is not the only indicator (use icons and text labels)
- High contrast ratios for dark mode and light mode
- Large tap targets (minimum 44x44 pt) for all interactive elements
- Clear focus indicators for keyboard navigation

## Notes for Implementation

- The app should work in **demo mode** (simulated sensor data) for testing without hardware
- BLE connection should gracefully handle disconnections and reconnections
- Risk calculation algorithm should be configurable for different sensitivity levels
- Emergency alerts should persist on screen until manually dismissed (after 10-second safety delay)
- All sensor data should be timestamped for historical analysis
