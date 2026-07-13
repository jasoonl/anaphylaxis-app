import { View, Text, TouchableOpacity, ScrollView, Linking, Alert } from "react-native";
import { useState, useEffect } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useHealth } from "@/lib/health-context";
import { router } from "expo-router";

/**
 * Emergency Alert Screen
 *
 * Full-screen emergency response interface:
 * - Large "Call 911" button
 * - Epinephrine guidance
 * - Notify emergency contacts
 * - Countdown timer before auto-dismiss
 * - Alert history
 */

export default function EmergencyAlertScreen() {
  const colors = useColors();
  const health = useHealth();
  const [countdownSeconds, setCountdownSeconds] = useState(30);
  const [notifiedContacts, setNotifiedContacts] = useState<string[]>([]);

  // Auto-dismiss after 30 seconds if not dismissed manually
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Trigger haptic feedback continuously
  useEffect(() => {
    const hapticInterval = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }, 1500);

    return () => clearInterval(hapticInterval);
  }, []);

  const handleCall911 = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Emergency Call",
      "Opening phone dialer to call 911...",
      [
        {
          text: "Cancel",
          onPress: () => {},
        },
        {
          text: "Call 911",
          onPress: () => {
            Linking.openURL("tel:911");
          },
        },
      ]
    );
  };

  const handleNotifyContacts = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const enabledContacts = health.emergencyContacts.filter((c) => c.notifyEnabled);

    if (enabledContacts.length === 0) {
      Alert.alert("No Contacts", "No emergency contacts are enabled for notifications.");
      return;
    }

    // Simulate sending notifications
    const contactNames = enabledContacts.map((c) => c.name);
    setNotifiedContacts(contactNames);

    // Log alert to history
    enabledContacts.forEach((contact) => {
      console.log(`SMS Alert sent to ${contact.name} (${contact.phone})`);
    });

    Alert.alert(
      "Contacts Notified",
      `Emergency alert sent to:\n${contactNames.join("\n")}`,
      [{ text: "OK", onPress: () => {} }]
    );

    // Add to alert history
    health.addAlertToHistory("critical", health.riskState.score);
  };

  const handleAdministerEpinephrine = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Epinephrine Administration",
      "Epinephrine auto-injector (EpiPen) should be administered immediately:\n\n1. Remove from carrier tube\n2. Hold firmly with blue safety release facing you\n3. Remove blue safety release by pulling straight up\n4. Place orange tip against outer thigh (can be administered through clothing)\n5. Push down firmly until you hear a click\n6. Hold in place for 3-10 seconds\n7. Remove and massage injection site for 10 seconds\n8. Get emergency medical help immediately\n\nIf symptoms persist after 5-15 minutes, a second dose may be needed.",
      [{ text: "OK", onPress: () => {} }]
    );
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <ScreenContainer
      className="p-0"
      containerClassName="bg-error"
      edges={["top", "left", "right", "bottom"]}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 gap-6 p-6 justify-between">
          {/* Header */}
          <View className="gap-2 items-center">
            <Text className="text-6xl">🚨</Text>
            <Text className="text-4xl font-bold text-white text-center">EMERGENCY</Text>
            <Text className="text-xl text-white text-center">Critical Risk Detected</Text>
            <Text className="text-sm text-white text-center mt-2">
              Risk Score: {health.riskState.score}/100
            </Text>
          </View>

          {/* Vital Signs Alert */}
          <View className="bg-white bg-opacity-10 rounded-2xl p-4 gap-2 border border-white border-opacity-20">
            <Text className="text-sm font-semibold text-white mb-2">⚠️ Abnormal Readings:</Text>
            <View className="gap-1">
              {health.vitalSigns.heartRate > 120 && (
                <Text className="text-sm text-white">
                  • Heart Rate: {Math.round(health.vitalSigns.heartRate)} BPM (elevated)
                </Text>
              )}
              {health.vitalSigns.gsr > 30 && (
                <Text className="text-sm text-white">
                  • Skin Response: {Math.round(health.vitalSigns.gsr * 10) / 10} µS (high)
                </Text>
              )}
              {(health.vitalSigns.temperature > 38 || health.vitalSigns.temperature < 36) && (
                <Text className="text-sm text-white">
                  • Temperature: {Math.round(health.vitalSigns.temperature * 10) / 10}°C (abnormal)
                </Text>
              )}
            </View>
          </View>

          {/* Action Buttons */}
          <View className="gap-3">
            {/* Call 911 */}
            <TouchableOpacity
              onPress={handleCall911}
              className="bg-white rounded-2xl py-6 px-4 items-center active:opacity-80"
              activeOpacity={0.9}
            >
              <Text className="text-3xl mb-2">📞</Text>
              <Text className="text-2xl font-bold text-error">CALL 911</Text>
              <Text className="text-xs text-muted mt-1">Emergency Services</Text>
            </TouchableOpacity>

            {/* Administer Epinephrine */}
            <TouchableOpacity
              onPress={handleAdministerEpinephrine}
              className="bg-white bg-opacity-20 rounded-2xl py-4 px-4 items-center border border-white active:opacity-70"
              activeOpacity={0.8}
            >
              <Text className="text-2xl mb-1">💉</Text>
              <Text className="text-lg font-bold text-white">Administer Epinephrine</Text>
              <Text className="text-xs text-white text-opacity-80 mt-1">EpiPen Instructions</Text>
            </TouchableOpacity>

            {/* Notify Contacts */}
            <TouchableOpacity
              onPress={handleNotifyContacts}
              className="bg-white bg-opacity-20 rounded-2xl py-4 px-4 items-center border border-white active:opacity-70"
              activeOpacity={0.8}
            >
              <Text className="text-2xl mb-1">📧</Text>
              <Text className="text-lg font-bold text-white">Notify Contacts</Text>
              <Text className="text-xs text-white text-opacity-80 mt-1">
                {notifiedContacts.length > 0
                  ? `Notified: ${notifiedContacts.join(", ")}`
                  : `${health.emergencyContacts.filter((c) => c.notifyEnabled).length} contacts enabled`}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Countdown Timer */}
          <View className="items-center gap-2">
            <Text className="text-sm text-white text-opacity-80">Auto-dismiss in</Text>
            <View className="w-16 h-16 rounded-full bg-white bg-opacity-20 border-2 border-white items-center justify-center">
              <Text className="text-3xl font-bold text-white">{countdownSeconds}</Text>
            </View>
          </View>

          {/* Dismiss Button */}
          <TouchableOpacity
            onPress={handleDismiss}
            className="bg-white bg-opacity-20 rounded-2xl py-3 px-4 items-center border border-white active:opacity-70"
            activeOpacity={0.8}
          >
            <Text className="text-base font-semibold text-white">Dismiss Alert</Text>
          </TouchableOpacity>

          {/* Medical Disclaimer */}
          <View className="bg-white bg-opacity-10 rounded-2xl p-3 border border-white border-opacity-20">
            <Text className="text-xs text-white text-opacity-80 text-center leading-relaxed">
              This app is a prototype companion tool. Always call 911 for medical emergencies.
              Do not rely solely on this app for diagnosis or treatment decisions.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
