# Anaphylaxis Guard — Design Document

## Overview

Anaphylaxis Guard is a health-monitoring companion app that estimates anaphylactic shock risk in real time from wearable sensor data (heart rate, galvanic skin response, skin temperature) and guides the user through emergency response. The app assumes mobile portrait orientation (9:16) and one-handed usage, following Apple Human Interface Guidelines so it feels like a first-party iOS health app. It currently runs in demo mode with simulated sensor data from a XIAO ESP32 C3 wearable simulator, with a clear path to real BLE integration.

## Screen List

| Screen | Route | Purpose |
|--------|-------|---------|
| Dashboard | `app/(tabs)/index.tsx` | Real-time risk score (0-100) with color-coded ring, live vital sign cards, device connection status, emergency button |
| Metrics | `app/(tabs)/metrics.tsx` | Detailed per-sensor view: heart rate, GSR, temperature with recent trends and threshold indicators |
| Contacts | `app/(tabs)/contacts.tsx` | Emergency contact management (add/edit/delete, toggle alert enablement, send test alert) |
| Settings | `app/(tabs)/settings.tsx` | User profile, device settings, notification preferences, risk threshold configuration |
| Emergency Alert | `app/emergency-alert.tsx` | Full-screen red modal with 911 dial button, epinephrine auto-injector guidance, contact notification, 30-second countdown |

## Primary Content and Functionality

The Dashboard is the app's heart: a large circular risk gauge colored by level (Safe green 0-39, Warning amber 40-69, Critical red 70-100), three compact vital cards beneath it, and a persistent emergency button. Metrics expands each sensor into a card with current value, unit, normal range, and status. Contacts is a FlatList of contact cards with name, phone, relationship, and an alert toggle. Settings groups rows into iOS-style sections (Profile, Device, Notifications, Thresholds, About). The Emergency Alert modal takes over the screen when risk turns critical, prioritizing the call-911 action.

## Key User Flows

1. Passive monitoring: App opens → BLE manager streams sensor data → risk calculator scores it → Dashboard updates every 1-2 seconds.
2. Critical event: Risk crosses 70 → full-screen Emergency Alert opens → user taps "Call 911" (phone dialer) or follows epinephrine steps → contacts are notified → alert auto-dismisses after 30 s countdown or manual dismissal.
3. Contact setup: Contacts tab → "Add Contact" → form sheet → save → contact persisted locally via AsyncStorage.
4. Threshold tuning: Settings → Thresholds → adjust heart-rate/GSR/temperature limits → risk calculator uses updated values.

## Color Choices

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary | #E11D48 (medical rose-red) | #FB7185 | Brand accent, emergency actions |
| success | #22C55E | #4ADE80 | Safe risk state |
| warning | #F59E0B | #FBBF24 | Warning risk state |
| error | #EF4444 | #F87171 | Critical risk state |
| background | #FFFFFF | #151718 | Screen background |
| surface | #F5F5F5 | #1E2022 | Cards |

Data persistence is local-first (AsyncStorage) for contacts, profile, and alert history. No authentication or cloud sync is required for the current scope.
