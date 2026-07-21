import { View, Text, TouchableOpacity, ScrollView, Linking, Alert } from "react-native";
import { useState, useEffect, useRef } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useHealth } from "@/lib/health-context";
import { notifyEmergencyContacts, callContact, buildEmergencyMessage } from "@/lib/sms-service";
import { router } from "expo-router";

/**
 * Emergency Alert Screen
 *
 * Full-screen emergency response interface:
 * - Large "Call 911" button
 * - Administer epinephrine guidance
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
  const [calledContactName, setCalledContactName] = useState<string | null>(null);
  const [remainingCallContacts, setRemainingCallContacts] = useState<
    { id: string; name: string; phone: string }[]
  >([]);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 30 seconds if not dismissed manually
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Schedule dismiss to happen after render
          dismissTimeoutRef.current = setTimeout(() => {
            router.back();
          }, 100);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, []);

  // Trigger haptic feedback continuously
  useEffect(() => {
    const hapticInterval = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }, 1500);

    return () => clearInterval(hapticInterval);
  }, []);

  const handleCall911 = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Confirm before dialing so the button can't place an emergency call by
    // accident from a pocket tap on an alert screen that opens by itself.
    Alert.alert(
      "Call Emergency Services",
      "This will open your phone's dialer to call 911.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call 911",
          style: "destructive",
          onPress: () => {
            Linking.openURL("tel:911").catch(() =>
              Alert.alert("Could Not Call", "Unable to open the phone dialer on this device.")
            );
          },
        },
      ]
    );
  };

  const handleNotifyContacts = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const message = buildEmergencyMessage(health.riskState.score, health.userProfile.name);
    const result = await notifyEmergencyContacts(health.emergencyContacts, message);

    if (result.smsResult.sent) {
      setNotifiedContacts(result.smsResult.notifiedNames);
      health.addAlertToHistory("critical", health.riskState.score);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    if (result.calledContact) {
      setCalledContactName(result.calledContact.name);
    }
    setRemainingCallContacts(result.remainingContacts.map((c) => ({ id: c.id, name: c.name, phone: c.phone })));

    const callLine =
      result.remainingContacts.length > 0
        ? "\n\nTap a Call button below to phone each contact."
        : "";
    Alert.alert(
      result.smsResult.sent ? "Contacts Notified" : "Not Sent",
      result.smsResult.message + callLine,
      [{ text: "OK", onPress: () => {} }]
    );
  };

  const handleCallRemaining = async (phone: string, name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const opened = await callContact(phone);
    if (opened) {
      setCalledContactName(name);
      setRemainingCallContacts((prev) => prev.filter((c) => c.phone !== phone));
    } else {
      Alert.alert("Could Not Call", `Unable to open the dialer for ${name}.`);
    }
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
        <View className="flex-1 gap-4 p-4 justify-between">
          {/* Header */}
          <View className="gap-2 items-center">
            <Text className="text-6xl">🚨</Text>
            <Text className="text-3xl font-bold text-white text-center">EMERGENCY</Text>
            <Text className="text-base text-white text-center">
              {health.riskState.level === "critical"
                ? "Critical Risk Detected"
                : "Manually Triggered Alert"}
            </Text>
            <Text className="text-xs text-white text-center mt-1">
              Risk Score: {Math.round(health.riskState.score)}/10
            </Text>
          </View>

          {/* Vital Signs Alert */}
          <View
            className="rounded-xl p-3 gap-2 border"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <Text className="text-xs font-semibold text-white mb-1">⚠️ Abnormal Readings:</Text>
            <View className="gap-1">
              {health.vitalSigns.heartRate > health.riskThresholds.heartRateTachycardia && (
                <Text className="text-xs text-white">
                  • Heart Rate: {Math.round(health.vitalSigns.heartRate)} BPM (tachycardia)
                </Text>
              )}
              {health.vitalSigns.heartRate < health.riskThresholds.heartRateBradycardia && (
                <Text className="text-xs text-white">
                  • Heart Rate: {Math.round(health.vitalSigns.heartRate)} BPM (bradycardia)
                </Text>
              )}
              {health.vitalSigns.skinHumidity - health.riskThresholds.tewlBaseline > health.riskThresholds.tewlRiseThreshold && (
                <Text className="text-xs text-white">
                  • Skin Water Loss (TEWL): +
                  {Math.round((health.vitalSigns.skinHumidity - health.riskThresholds.tewlBaseline) * 10) / 10} g/m²/h from
                  baseline (rising)
                </Text>
              )}
              {health.vitalSigns.temperature > health.riskThresholds.temperatureFever && (
                <Text className="text-xs text-white">
                  • Temperature: {Math.round(health.vitalSigns.temperature * 10) / 10}°C (fever)
                </Text>
              )}
              {health.vitalSigns.temperature < health.riskThresholds.temperatureMildHypothermia && (
                <Text className="text-xs text-white">
                  • Temperature: {Math.round(health.vitalSigns.temperature * 10) / 10}°C (hypothermia)
                </Text>
              )}
            </View>
          </View>

          {/* Action Buttons - Stacked for mobile */}
          <View className="gap-2">
            {/* Call 911 */}
            <TouchableOpacity
              onPress={handleCall911}
              className="bg-white rounded-lg py-4 px-3 items-center active:opacity-80"
              activeOpacity={0.9}
            >
              <Text className="text-2xl mb-1">📞</Text>
              <Text className="text-lg font-bold text-error">CALL 911</Text>
              <Text className="text-xs text-muted mt-0.5">Emergency Services</Text>
            </TouchableOpacity>

            {/* Administer Epinephrine */}
            <TouchableOpacity
              onPress={handleAdministerEpinephrine}
              className="rounded-lg py-3 px-3 items-center border border-white active:opacity-70"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
              activeOpacity={0.8}
            >
              <Text className="text-xl mb-0.5">💉</Text>
              <Text className="text-sm font-bold text-white">Administer Epinephrine</Text>
              <Text className="text-xs mt-0.5" style={{ color: "rgba(255, 255, 255, 0.8)" }}>EpiPen Instructions</Text>
            </TouchableOpacity>

            {/* Notify Contacts */}
            <TouchableOpacity
              onPress={handleNotifyContacts}
              className="rounded-lg py-3 px-3 items-center border border-white active:opacity-70"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
              activeOpacity={0.8}
            >
              <Text className="text-xl mb-0.5">📧📞</Text>
              <Text className="text-sm font-bold text-white">Text &amp; Call Contacts</Text>
              <Text className="text-xs mt-0.5" style={{ color: "rgba(255, 255, 255, 0.8)" }}>
                {notifiedContacts.length > 0
                  ? `Texted: ${notifiedContacts.join(", ")}`
                  : `${health.emergencyContacts.filter((c) => c.notifyEnabled).length} contacts enabled`}
              </Text>
            </TouchableOpacity>

            {calledContactName && (
              <Text className="text-xs text-center" style={{ color: "rgba(255, 255, 255, 0.9)" }}>
                📞 Called {calledContactName}
              </Text>
            )}

            {remainingCallContacts.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => handleCallRemaining(c.phone, c.name)}
                className="rounded-lg py-2 px-3 items-center border border-white active:opacity-70"
                style={{ backgroundColor: "rgba(255, 255, 255, 0.15)" }}
                activeOpacity={0.8}
              >
                <Text className="text-xs font-semibold text-white">📞 Call {c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Countdown Timer */}
          <View className="items-center gap-2">
            <Text className="text-xs" style={{ color: "rgba(255, 255, 255, 0.8)" }}>Auto-dismiss in</Text>
            <View
              className="w-14 h-14 rounded-full border-2 border-white items-center justify-center"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
            >
              <Text className="text-2xl font-bold text-white">{countdownSeconds}</Text>
            </View>
          </View>

          {/* Dismiss Button */}
          <TouchableOpacity
            onPress={handleDismiss}
            className="rounded-lg py-3 px-3 items-center border border-white active:opacity-70"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.2)" }}
            activeOpacity={0.8}
          >
            <Text className="text-sm font-semibold text-white">Dismiss Alert</Text>
          </TouchableOpacity>

          {/* Medical Disclaimer */}
          <View
            className="rounded-lg p-2 border"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <Text className="text-xs text-center leading-relaxed" style={{ color: "rgba(255, 255, 255, 0.8)" }}>
              This app is a prototype companion tool. Always call 911 for medical emergencies.
              Do not rely solely on this app for diagnosis or treatment decisions.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
