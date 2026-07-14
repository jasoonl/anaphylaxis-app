import { ScrollView, Text, View, TouchableOpacity, Pressable, Alert, TextInput } from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useHealth } from "@/lib/health-context";
import { DEFAULT_THRESHOLDS } from "@/lib/risk-calculator";
import { withOpacity } from "@/lib/utils";

/**
 * Settings Screen
 *
 * App configuration and user preferences:
 * - User profile (name, allergies, severity)
 * - Device management
 * - Notification preferences
 * - Risk thresholds
 * - About section
 */

interface UserProfile {
  name: string;
  allergies: string;
  severity: "mild" | "moderate" | "severe";
}

export default function SettingsScreen() {
  const colors = useColors();
  const health = useHealth();
  const [editingProfile, setEditingProfile] = useState(false);
  const [tempProfile, setTempProfile] = useState(health.userProfile);

  const [notificationSettings, setNotificationSettings] = useState({
    pushEnabled: true,
    soundEnabled: true,
    vibrationEnabled: true,
  });

  const handleSaveProfile = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    health.updateUserProfile(tempProfile);
    setEditingProfile(false);
  };

  const handleToggleSetting = (setting: keyof typeof notificationSettings) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotificationSettings((prev) => ({
      ...prev,
      [setting]: !prev[setting],
    }));
  };

  const handleConnectDevice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Connect Device", "Scanning for Bluetooth devices...");
  };

  const handleDisconnectDevice = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Disconnect Device",
      "Are you sure you want to disconnect the paired device?",
      [
        { text: "Cancel", onPress: () => {} },
        {
          text: "Disconnect",
          onPress: () => {
            Alert.alert("Device Disconnected", "The device has been disconnected.");
          },
          style: "destructive",
        },
      ]
    );
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "mild":
        return colors.warning;
      case "moderate":
        return colors.warning;
      case "severe":
        return colors.error;
      default:
        return colors.success;
    }
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="gap-6 pb-8">
          {/* Header */}
          <View className="gap-1">
            <Text className="text-3xl font-bold text-foreground">Settings</Text>
            <Text className="text-sm text-muted">Manage your preferences</Text>
          </View>

          {/* User Profile Section */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">User Profile</Text>

            {!editingProfile ? (
              <View className="bg-surface rounded-2xl p-4 border border-border gap-3">
                <View>
                  <Text className="text-xs text-muted mb-1">Name</Text>
                  <Text className="text-lg font-semibold text-foreground">{health.userProfile.name}</Text>
                </View>
                <View>
                  <Text className="text-xs text-muted mb-1">Known Allergies</Text>
                  <Text className="text-sm text-foreground">{health.userProfile.allergies}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className="text-xs text-muted mb-1">Severity</Text>
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: getSeverityColor(health.userProfile.severity) }}
                    >
                      {health.userProfile.severity.charAt(0).toUpperCase() + health.userProfile.severity.slice(1)}
                    </Text>
                  </View>
                    <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setEditingProfile(true);
                      setTempProfile(health.userProfile);
                    }}
                    className="px-4 py-2 rounded-lg bg-primary"
                    activeOpacity={0.8}
                  >
                    <Text className="text-sm font-semibold text-white">Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="bg-surface rounded-2xl p-4 border border-border gap-3">
                <View className="gap-1">
                  <Text className="text-sm text-muted">Name</Text>
                  <TextInput
                    value={tempProfile.name}
                    onChangeText={(text) => setTempProfile({ ...tempProfile, name: text })}
                    placeholder="Enter your name"
                    placeholderTextColor={colors.muted}
                    className="bg-background rounded-lg px-4 py-3 border border-border text-foreground"
                  />
                </View>

                <View className="gap-1">
                  <Text className="text-sm text-muted">Known Allergies</Text>
                  <TextInput
                    value={tempProfile.allergies}
                    onChangeText={(text) => setTempProfile({ ...tempProfile, allergies: text })}
                    placeholder="e.g. Peanuts, Tree nuts"
                    placeholderTextColor={colors.muted}
                    multiline
                    className="bg-background rounded-lg px-4 py-3 border border-border text-foreground"
                  />
                </View>

                <View className="gap-1">
                  <Text className="text-sm text-muted">Severity</Text>
                  <View className="flex-row gap-2">
                    {(["mild", "moderate", "severe"] as const).map((sev) => (
                      <Pressable
                        key={sev}
                        onPress={() => setTempProfile({ ...tempProfile, severity: sev })}
                        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                      >
                        <View
                          className={`flex-1 px-3 py-2 rounded-lg ${
                            tempProfile.severity === sev
                              ? "bg-primary"
                              : "bg-background border border-border"
                          }`}
                        >
                          <Text
                            className={`text-sm font-semibold text-center ${
                              tempProfile.severity === sev
                                ? "text-white"
                                : "text-foreground"
                            }`}
                          >
                            {sev.charAt(0).toUpperCase() + sev.slice(1)}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View className="flex-row gap-2 mt-2">
                  <TouchableOpacity
                    onPress={() => setEditingProfile(false)}
                    className="flex-1 bg-muted rounded-lg py-3 items-center"
                    activeOpacity={0.8}
                  >
                    <Text className="font-semibold text-white">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveProfile}
                    className="flex-1 bg-primary rounded-lg py-3 items-center"
                    activeOpacity={0.8}
                  >
                    <Text className="font-semibold text-white">Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Device Settings */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Device Settings</Text>

            <View className="bg-surface rounded-2xl p-4 border border-border gap-3">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-sm font-semibold text-foreground">Connected Device</Text>
                  <Text className="text-xs text-muted mt-1">XIAO ESP32 C3</Text>
                </View>
                <View className="w-3 h-3 rounded-full bg-success" />
              </View>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={handleConnectDevice}
                  className="flex-1 bg-primary rounded-lg py-3 items-center"
                  activeOpacity={0.8}
                >
                  <Text className="text-sm font-semibold text-white">Connect</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDisconnectDevice}
                  className="flex-1 bg-error rounded-lg py-3 items-center"
                  activeOpacity={0.8}
                >
                  <Text className="text-sm font-semibold text-white">Disconnect</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Notification Settings */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Notifications</Text>

            {[
              { key: "pushEnabled", label: "Push Notifications", icon: "🔔" },
              { key: "soundEnabled", label: "Sound", icon: "🔊" },
              { key: "vibrationEnabled", label: "Vibration", icon: "📳" },
            ].map(({ key, label, icon }) => (
              <Pressable
                key={key}
                onPress={() => handleToggleSetting(key as keyof typeof notificationSettings)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <View className="bg-surface rounded-2xl p-4 border border-border flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3 flex-1">
                    <Text className="text-2xl">{icon}</Text>
                    <Text className="text-sm font-semibold text-foreground">{label}</Text>
                  </View>
                  <View
                    className={`w-12 h-12 rounded-lg items-center justify-center ${
                      notificationSettings[key as keyof typeof notificationSettings]
                        ? "bg-success"
                        : "bg-muted"
                    }`}
                  >
                    <Text className="text-lg">
                      {notificationSettings[key as keyof typeof notificationSettings]
                        ? "✓"
                        : "✗"}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>

          {/* Risk Thresholds (Advanced) */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Risk Thresholds (Advanced)</Text>

            <View className="bg-surface rounded-2xl p-4 border border-border gap-3">
              <View>
                <Text className="text-xs text-muted mb-1">Tachycardia (Heart Rate High)</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.heartRateTachycardia} BPM
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">Shock-Level Tachycardia</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.heartRateSevere} BPM
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">Bradycardia (Heart Rate Low)</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.heartRateBradycardia} BPM
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">Severe Bradycardia</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.heartRateSevereBradycardia} BPM
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">TEWL Baseline</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.tewlBaseline} g/m²/h
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">TEWL Rise Threshold</Text>
                <Text className="text-lg font-semibold text-foreground">
                  +{DEFAULT_THRESHOLDS.tewlRiseThreshold} g/m²/h
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">TEWL Reaction Mean Rise</Text>
                <Text className="text-lg font-semibold text-foreground">
                  +{DEFAULT_THRESHOLDS.tewlReactionMean} g/m²/h
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">TEWL Severe Reaction Mean Rise</Text>
                <Text className="text-lg font-semibold text-foreground">
                  +{DEFAULT_THRESHOLDS.tewlSevereReactionMean} g/m²/h
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">Fever</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.temperatureFever}°C
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">High Fever</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.temperatureHighFever}°C
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">Mild Hypothermia</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.temperatureMildHypothermia}°C
                </Text>
              </View>
              <View>
                <Text className="text-xs text-muted mb-1">Severe Hypothermia</Text>
                <Text className="text-lg font-semibold text-foreground">
                  {DEFAULT_THRESHOLDS.temperatureSevereHypothermia}°C
                </Text>
              </View>
              <Text className="text-xs text-muted leading-relaxed mt-1">
                Heart rate thresholds sourced from NIAID/FAAN (Sampson 2006) and Brown (2004)
                anaphylaxis severity grading - formal diagnostic criteria. TEWL thresholds
                sourced from Schuler et al., J Clin Invest 2023 (rise from personal baseline
                predicts anaphylaxis: 100% sensitive at +1 g/m²/h, but the study is explicit
                this is not specific without a corroborating sign - not yet a formal
                diagnostic criterion). Temperature is not part of any anaphylaxis criteria and
                is weighted lightest.
              </Text>
            </View>
          </View>

          {/* About Section */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">About</Text>

            <View className="bg-surface rounded-2xl p-4 border border-border gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-muted">App Version</Text>
                <Text className="text-sm font-semibold text-foreground">1.0.0</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-muted">Build</Text>
                <Text className="text-sm font-semibold text-foreground">2026.07.13</Text>
              </View>
            </View>

            {/* Medical Disclaimer */}
            <View
              className="rounded-lg p-3 border border-warning"
              style={{ backgroundColor: withOpacity(colors.warning, 0.1) }}
            >
              <Text className="text-xs font-semibold text-warning mb-2">⚠️ Medical Disclaimer</Text>
              <Text className="text-xs text-warning leading-relaxed">
                This app is a prototype companion tool and should not be used as a standalone medical diagnostic device. Always consult with healthcare professionals for medical advice.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
