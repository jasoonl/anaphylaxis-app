import { ScrollView, Text, View, TouchableOpacity, Pressable } from "react-native";
import { useState, useEffect } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useHealth } from "@/lib/health-context";
import { calculateRisk } from "@/lib/risk-calculator";
import { bleManager } from "@/lib/ble-manager";
import { router } from "expo-router";
import { notificationService } from "@/lib/notification-service";

/**
 * Dashboard Screen - Anaphylaxis Guard
 *
 * Main monitoring interface showing:
 * - Real-time risk status (Green/Yellow/Red)
 * - Current vital signs (Heart Rate, GSR, Temperature, Connection)
 * - Recent alerts
 * - Quick action buttons
 */

interface VitalSigns {
  heartRate: number;
  gsr: number;
  temperature: number;
  connected: boolean;
}

interface RiskState {
  level: "safe" | "warning" | "critical";
  score: number;
  trend: "stable" | "rising" | "falling";
}

export default function DashboardScreen() {
  const colors = useColors();
  const health = useHealth();
  const [prevScore, setPrevScore] = useState(0);
  const [prevRiskLevel, setPrevRiskLevel] = useState<"safe" | "warning" | "critical">("safe");
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);

  // Initialize notifications
  useEffect(() => {
    notificationService.initialize();
  }, []);

  // Subscribe to sensor data from BLE device or demo mode
  useEffect(() => {
    const unsubscribe = bleManager.onSensorData((data) => {
      health.updateVitalSigns({
        heartRate: data.heartRate,
        skinHumidity: data.gsr,
        temperature: data.temperature,
      });
    });

    // Only fall back to a demo connection if the person hasn't paired a real
    // device via the Devices screen - otherwise this would silently override
    // their selection every time the dashboard mounts.
    (async () => {
      const activeId = await bleManager.getActiveDeviceId();
      if (!activeId && health.isDemoMode) {
        bleManager.connectToDevice("demo");
      }
    })();

    return () => {
      unsubscribe();
    };
  }, [health.isDemoMode]);

  // Keep the header's connection label in sync with the actual active device
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const activeId = await bleManager.getActiveDeviceId();
      if (cancelled) return;
      if (activeId) {
        const paired = await bleManager.getPairedDevices();
        const active = paired.find((d) => d.id === activeId);
        if (!cancelled) setConnectedDeviceName(active?.name ?? null);
      } else {
        setConnectedDeviceName(null);
      }
    };
    sync();
    const interval = setInterval(sync, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Calculate risk based on vital signs
  useEffect(() => {
    const riskFactors = calculateRisk(
      health.vitalSigns.heartRate,
      health.vitalSigns.skinHumidity,
      health.vitalSigns.temperature,
      health.riskThresholds
    );

    const trend =
      riskFactors.combinedScore > prevScore
        ? "rising"
        : riskFactors.combinedScore < prevScore
          ? "falling"
          : "stable";

    health.updateRiskState({
      level: riskFactors.riskLevel,
      score: riskFactors.combinedScore,
      trend,
    });

    setPrevScore(riskFactors.combinedScore);
  }, [health.vitalSigns.heartRate, health.vitalSigns.skinHumidity, health.vitalSigns.temperature, health.riskThresholds]);

  const getRiskColor = () => {
    switch (health.riskState.level) {
      case "critical":
        return colors.error;
      case "warning":
        return colors.warning;
      default:
        return colors.success;
    }
  };

  const getRiskLabel = () => {
    switch (health.riskState.level) {
      case "critical":
        return "CRITICAL RISK";
      case "warning":
        return "ELEVATED RISK";
      default:
        return "SAFE";
    }
  };

  const handleEmergencyPress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.push("/emergency-alert");
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="gap-6 pb-8">
          {/* Header */}
          <View className="gap-1">
            <Text className="text-3xl font-bold text-foreground">Anaphylaxis Guard</Text>
            <Text className="text-sm text-muted">
              {connectedDeviceName
                ? `Connected: ${connectedDeviceName}`
                : health.isDemoMode
                  ? "Demo Mode"
                  : "Disconnected"}
            </Text>
          </View>

          {/* Risk Status Card */}
          <Pressable
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            style={({ pressed }) => [
              {
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View
              className="rounded-3xl p-8 items-center justify-center gap-4"
              style={{ backgroundColor: getRiskColor() + "15" }}
            >
              {/* Risk Circle */}
              <View
                className="w-32 h-32 rounded-full items-center justify-center"
                style={{ backgroundColor: getRiskColor() }}
              >
                <Text className="text-5xl font-bold text-white">{Math.round(health.riskState.score)}</Text>
                <Text className="text-xs font-semibold text-white">/ 10</Text>
              </View>

              {/* Risk Label */}
              <Text
                className="text-xl font-bold text-center"
                style={{ color: getRiskColor() }}
              >
                {getRiskLabel()}
              </Text>

              {/* Trend Indicator */}
              <View className="flex-row items-center gap-2">
                <Text className="text-sm text-muted">
                  {health.riskState.trend === "rising" && "📈 Rising"}
                  {health.riskState.trend === "falling" && "📉 Falling"}
                  {health.riskState.trend === "stable" && "➡️ Stable"}
                </Text>
              </View>

              {/* Risk Range Legend */}
              <View className="flex-row gap-4 mt-1">
                <View className="items-center gap-1">
                  <View className="flex-row items-center gap-1">
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.success }} />
                    <Text className="text-xs font-semibold text-foreground">Safe</Text>
                  </View>
                  <Text className="text-xs text-muted">0-3</Text>
                </View>
                <View className="items-center gap-1">
                  <View className="flex-row items-center gap-1">
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.warning }} />
                    <Text className="text-xs font-semibold text-foreground">Cautious</Text>
                  </View>
                  <Text className="text-xs text-muted">4-6</Text>
                </View>
                <View className="items-center gap-1">
                  <View className="flex-row items-center gap-1">
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.error }} />
                    <Text className="text-xs font-semibold text-foreground">Danger</Text>
                  </View>
                  <Text className="text-xs text-muted">7-10</Text>
                </View>
              </View>
            </View>
          </Pressable>

          {/* Vital Signs Grid */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Vital Signs</Text>
            <View className="flex-row gap-3 flex-wrap">
              {/* Heart Rate */}
              <View className="flex-1 min-w-[48%] bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-xs text-muted mb-2">Heart Rate</Text>
                <Text className="text-2xl font-bold text-foreground">
                  {Math.round(health.vitalSigns.heartRate)}
                </Text>
                <Text className="text-xs text-muted mt-1">BPM</Text>
              </View>

              {/* Skin Water Loss (TEWL) */}
              <View className="flex-1 min-w-[48%] bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-xs text-muted mb-2">Skin Water Loss</Text>
                <Text className="text-2xl font-bold text-foreground">
                  {Math.round(health.vitalSigns.skinHumidity * 10) / 10}
                </Text>
                <Text className="text-xs text-muted mt-1">g/m²/h</Text>
              </View>

              {/* Temperature */}
              <View className="flex-1 min-w-[48%] bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-xs text-muted mb-2">Temperature</Text>
                <Text className="text-2xl font-bold text-foreground">
                  {Math.round(health.vitalSigns.temperature * 10) / 10}
                </Text>
                <Text className="text-xs text-muted mt-1">°C</Text>
              </View>

              {/* Connection Status */}
              <View className="flex-1 min-w-[48%] bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-xs text-muted mb-2">Device</Text>
                <Text
                  className="text-2xl font-bold"
                  style={{ color: health.isDeviceConnected ? colors.success : colors.error }}
                >
                  {health.isDeviceConnected ? "✓" : "✗"}
                </Text>
                <Text className="text-xs text-muted mt-1">
                  {health.isDeviceConnected ? "Connected" : "Demo Mode"}
                </Text>
              </View>
            </View>
          </View>

          {/* Recent Alerts */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Recent Activity</Text>
            <View className="bg-surface rounded-2xl p-4 border border-border">
              {health.alertHistory.length > 0 ? (
                <View className="gap-2">
                  {health.alertHistory.slice(-3).map((alert, idx) => (
                    <View key={idx} className="flex-row items-center justify-between pb-2 border-b border-border last:border-b-0">
                      <View>
                        <Text className="text-sm font-semibold text-foreground">
                          {alert.riskLevel === "critical" ? "🚨" : alert.riskLevel === "warning" ? "⚠️" : "✓"} {alert.riskLevel.toUpperCase()}
                        </Text>
                        <Text className="text-xs text-muted mt-1">
                          {new Date(alert.timestamp).toLocaleTimeString()}
                        </Text>
                      </View>
                      <Text className="text-lg font-bold text-foreground">{alert.score}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-sm text-muted">No alerts in the last 24 hours</Text>
              )}
            </View>
          </View>

          {/* Quick Actions */}
          <View className="gap-3 flex-row">
            {/* Emergency Button */}
            <TouchableOpacity
              onPress={handleEmergencyPress}
              className="flex-1 bg-error rounded-2xl py-4 px-4 items-center justify-center"
              activeOpacity={0.8}
            >
              <Text className="text-lg font-bold text-white">🚨 Emergency</Text>
            </TouchableOpacity>

            {/* View Details Button */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/(tabs)/metrics");
              }}
              className="flex-1 bg-primary rounded-2xl py-4 px-4 items-center justify-center"
              activeOpacity={0.8}
            >
              <Text className="text-lg font-bold text-white">Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
