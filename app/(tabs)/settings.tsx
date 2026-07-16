import { ScrollView, Text, View, TouchableOpacity, Pressable, Alert, TextInput } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
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

  const [editingThresholds, setEditingThresholds] = useState(false);
  const [tempThresholds, setTempThresholds] = useState(health.riskThresholds);

  const handleEditThresholds = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempThresholds(health.riskThresholds);
    setEditingThresholds(true);
  };

  const handleSaveThresholds = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    health.updateRiskThresholds(tempThresholds);
    setEditingThresholds(false);
  };

  const handleResetThresholds = () => {
    Alert.alert(
      "Reset to Defaults",
      "Restore all thresholds to the general research-based defaults? This will discard your doctor's custom values.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            health.resetRiskThresholds();
            setTempThresholds(DEFAULT_THRESHOLDS);
            setEditingThresholds(false);
          },
        },
      ]
    );
  };

  const setThreshold = (key: keyof typeof tempThresholds, text: string) => {
    const num = parseFloat(text);
    setTempThresholds((prev) => ({ ...prev, [key]: isNaN(num) ? 0 : num }));
  };

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

          {/* Device Section */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Device</Text>
            <TouchableOpacity
              onPress={() => router.push("/device-management")}
              className="bg-surface rounded-2xl p-4 border border-border flex-row items-center justify-between"
            >
              <View className="flex-row items-center gap-3">
                <Text className="text-xl">⌚</Text>
                <Text className="text-base font-semibold text-foreground">Manage Devices</Text>
              </View>
              <Text className="text-lg text-muted">›</Text>
            </TouchableOpacity>
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
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-foreground">Risk Thresholds</Text>
              {!editingThresholds ? (
                <TouchableOpacity onPress={handleEditThresholds}>
                  <Text className="text-sm font-semibold" style={{ color: colors.primary }}>Edit</Text>
                </TouchableOpacity>
              ) : (
                <View className="flex-row gap-4">
                  <TouchableOpacity onPress={() => setEditingThresholds(false)}>
                    <Text className="text-sm text-muted">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSaveThresholds}>
                    <Text className="text-sm font-semibold" style={{ color: colors.primary }}>Save</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text className="text-xs text-muted leading-relaxed">
              These start at general research-based defaults. If your doctor gives you personalized
              values (for example, your own resting TEWL baseline or a heart-rate range specific to
              you), tap Edit to enter them. Reference-only figures below are descriptive study
              statistics and aren't used in scoring, so they can't be edited.
            </Text>

            <View className="bg-surface rounded-2xl p-4 border border-border gap-3">
              {editingThresholds ? (
                <>
                  <ThresholdEditRow label="Tachycardia (Heart Rate High)" unit="BPM" value={tempThresholds.heartRateTachycardia} onChange={(t) => setThreshold("heartRateTachycardia", t)} colors={colors} />
                  <ThresholdEditRow label="Shock-Level Tachycardia" unit="BPM" value={tempThresholds.heartRateSevere} onChange={(t) => setThreshold("heartRateSevere", t)} colors={colors} />
                  <ThresholdEditRow label="Bradycardia (Heart Rate Low)" unit="BPM" value={tempThresholds.heartRateBradycardia} onChange={(t) => setThreshold("heartRateBradycardia", t)} colors={colors} />
                  <ThresholdEditRow label="Severe Bradycardia" unit="BPM" value={tempThresholds.heartRateSevereBradycardia} onChange={(t) => setThreshold("heartRateSevereBradycardia", t)} colors={colors} />
                  <ThresholdEditRow label="TEWL Baseline" unit="g/m²/h" value={tempThresholds.tewlBaseline} onChange={(t) => setThreshold("tewlBaseline", t)} colors={colors} />
                  <ThresholdEditRow label="TEWL Rise Threshold" unit="g/m²/h" value={tempThresholds.tewlRiseThreshold} onChange={(t) => setThreshold("tewlRiseThreshold", t)} colors={colors} />
                  <ThresholdEditRow label="Fever" unit="°C" value={tempThresholds.temperatureFever} onChange={(t) => setThreshold("temperatureFever", t)} colors={colors} />
                  <ThresholdEditRow label="High Fever" unit="°C" value={tempThresholds.temperatureHighFever} onChange={(t) => setThreshold("temperatureHighFever", t)} colors={colors} />
                  <ThresholdEditRow label="Mild Hypothermia" unit="°C" value={tempThresholds.temperatureMildHypothermia} onChange={(t) => setThreshold("temperatureMildHypothermia", t)} colors={colors} />
                  <ThresholdEditRow label="Severe Hypothermia" unit="°C" value={tempThresholds.temperatureSevereHypothermia} onChange={(t) => setThreshold("temperatureSevereHypothermia", t)} colors={colors} />

                  <TouchableOpacity
                    onPress={handleResetThresholds}
                    className="rounded-lg py-2 items-center mt-1"
                    style={{ backgroundColor: withOpacity(colors.error, 0.1) }}
                  >
                    <Text className="text-sm font-semibold" style={{ color: colors.error }}>
                      Reset to Research Defaults
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <ThresholdViewRow label="Tachycardia (Heart Rate High)" value={`${health.riskThresholds.heartRateTachycardia} BPM`} />
                  <ThresholdViewRow label="Shock-Level Tachycardia" value={`${health.riskThresholds.heartRateSevere} BPM`} />
                  <ThresholdViewRow label="Bradycardia (Heart Rate Low)" value={`${health.riskThresholds.heartRateBradycardia} BPM`} />
                  <ThresholdViewRow label="Severe Bradycardia" value={`${health.riskThresholds.heartRateSevereBradycardia} BPM`} />
                  <ThresholdViewRow label="TEWL Baseline" value={`${health.riskThresholds.tewlBaseline} g/m²/h`} />
                  <ThresholdViewRow label="TEWL Rise Threshold (validated rule)" value={`+${health.riskThresholds.tewlRiseThreshold} g/m²/h + corroborating sign`} />
                  <ThresholdViewRow label="Reactor Mean Rise (reference only)" value={`+${health.riskThresholds.tewlReactionMeanReference} g/m²/h`} />
                  <ThresholdViewRow label="Epi-Requiring Reaction Mean (reference only)" value={`+${health.riskThresholds.tewlSevereReactionMeanReference} g/m²/h`} />
                  <ThresholdViewRow label="Fever" value={`${health.riskThresholds.temperatureFever}°C`} />
                  <ThresholdViewRow label="High Fever" value={`${health.riskThresholds.temperatureHighFever}°C`} />
                  <ThresholdViewRow label="Mild Hypothermia" value={`${health.riskThresholds.temperatureMildHypothermia}°C`} />
                  <ThresholdViewRow label="Severe Hypothermia" value={`${health.riskThresholds.temperatureSevereHypothermia}°C`} />
                </>
              )}
              <Text className="text-xs text-muted leading-relaxed mt-1">
                Default heart rate thresholds sourced from NIAID/FAAN (Sampson 2006) and Brown
                (2004) anaphylaxis severity grading. Default TEWL rule sourced from Schuler et al.,
                J Clin Invest 2023: a rise of +1 g/m²/h from personal baseline PLUS a corroborating
                sign together gave 100% sensitivity and 96% specificity (~38 min median warning).
                Custom values you enter here override these defaults. This app is not a medical
                device - always follow your doctor's guidance.
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

interface ThemeColors {
  primary: string;
  muted: string;
  border: string;
  foreground: string;
}

function ThresholdViewRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs text-muted mb-1">{label}</Text>
      <Text className="text-lg font-semibold text-foreground">{value}</Text>
    </View>
  );
}

function ThresholdEditRow({
  label,
  unit,
  value,
  onChange,
  colors,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (text: string) => void;
  colors: ThemeColors;
}) {
  return (
    <View>
      <Text className="text-xs text-muted mb-1">
        {label} ({unit})
      </Text>
      <TextInput
        value={String(value)}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.muted}
        className="bg-background rounded-lg px-4 py-2.5 border border-border text-foreground text-base"
      />
    </View>
  );
}
