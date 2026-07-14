import { ScrollView, Text, View, Pressable } from "react-native";
import { useState, useEffect } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useHealth } from "@/lib/health-context";

/**
 * Health Metrics Screen
 *
 * Displays detailed sensor readings with:
 * - Metric selector (tabs)
 * - Real-time waveform/trend display
 * - Statistics (current, min, max, average)
 * - Threshold indicators
 */

type MetricType = "heartRate" | "skinHumidity" | "temperature";

interface MetricData {
  current: number;
  min: number;
  max: number;
  average: number;
  baseline: number;
  unit: string;
  normalRange: { min: number; max: number };
}

export default function MetricsScreen() {
  const colors = useColors();
  const health = useHealth();
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("heartRate");
  const [history, setHistory] = useState<number[]>([]);

  const metricsConfig: Record<MetricType, MetricData> = {
    heartRate: {
      current: health.vitalSigns.heartRate,
      min: 68,
      max: 95,
      average: 78,
      baseline: 72,
      unit: "BPM",
      normalRange: { min: 60, max: 100 },
    },
    skinHumidity: {
      current: health.vitalSigns.skinHumidity,
      min: 30,
      max: 70,
      average: 45,
      baseline: 45,
      unit: "%",
      normalRange: { min: 20, max: 70 },
    },
    temperature: {
      current: health.vitalSigns.temperature,
      min: 36.5,
      max: 37.2,
      average: 36.9,
      baseline: 36.8,
      unit: "°C",
      normalRange: { min: 36.5, max: 37.5 },
    },
  };

  const currentMetric = metricsConfig[selectedMetric];

  // Simulate historical data
  useEffect(() => {
    const interval = setInterval(() => {
      setHistory((prev) => {
        const newValue =
          currentMetric.current + (Math.random() - 0.5) * (currentMetric.unit === "BPM" ? 4 : 1);
        return [...prev.slice(-59), newValue];
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentMetric.current, currentMetric.unit]);

  const isAbnormal = (value: number, range: { min: number; max: number }) => {
    return value < range.min || value > range.max;
  };

  const getStatusColor = (value: number, range: { min: number; max: number }) => {
    if (isAbnormal(value, range)) {
      return colors.error;
    }
    return colors.success;
  };

  const handleMetricPress = (metric: MetricType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMetric(metric);
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="gap-6 pb-8">
          {/* Header */}
          <View className="gap-1">
            <Text className="text-3xl font-bold text-foreground">Health Metrics</Text>
            <Text className="text-sm text-muted">Real-time sensor readings</Text>
          </View>

          {/* Metric Selector Tabs */}
          <View className="flex-row gap-2">
            {(["heartRate", "skinHumidity", "temperature"] as MetricType[]).map((metric) => (
              <Pressable
                key={metric}
                onPress={() => handleMetricPress(metric)}
                style={({ pressed }) => [
                  {
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View
                  className={`flex-1 rounded-lg py-3 px-4 items-center ${
                    selectedMetric === metric ? "bg-primary" : "bg-surface border border-border"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      selectedMetric === metric ? "text-white" : "text-foreground"
                    }`}
                  >
                    {metric === "heartRate" && "Heart Rate"}
                    {metric === "skinHumidity" && "Skin Humidity"}
                    {metric === "temperature" && "Temperature"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>

          {/* Current Value Display */}
          <View className="bg-surface rounded-3xl p-8 items-center gap-4 border border-border">
            <Text className="text-sm text-muted">Current Value</Text>
            <View className="flex-row items-baseline gap-2">
              <Text
                className="text-5xl font-bold"
                style={{
                  color: getStatusColor(currentMetric.current, currentMetric.normalRange),
                }}
              >
                {typeof currentMetric.current === "number"
                  ? currentMetric.current % 1 === 0
                    ? currentMetric.current
                    : currentMetric.current.toFixed(1)
                  : currentMetric.current}
              </Text>
              <Text className="text-2xl text-muted">{currentMetric.unit}</Text>
            </View>

            {/* Status Indicator */}
            <View className="flex-row items-center gap-2">
              <View
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor: getStatusColor(
                    currentMetric.current,
                    currentMetric.normalRange
                  ),
                }}
              />
              <Text className="text-sm text-muted">
                {isAbnormal(currentMetric.current, currentMetric.normalRange)
                  ? "⚠️ Outside normal range"
                  : "✓ Normal range"}
              </Text>
            </View>
          </View>

          {/* Statistics Grid */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Statistics (Last Hour)</Text>
            <View className="flex-row gap-3 flex-wrap">
              {/* Min */}
              <View className="flex-1 min-w-[48%] bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-xs text-muted mb-2">Minimum</Text>
                <Text className="text-2xl font-bold text-foreground">
                  {typeof currentMetric.min === "number"
                    ? currentMetric.min % 1 === 0
                      ? currentMetric.min
                      : currentMetric.min.toFixed(1)
                    : currentMetric.min}
                </Text>
                <Text className="text-xs text-muted mt-1">{currentMetric.unit}</Text>
              </View>

              {/* Max */}
              <View className="flex-1 min-w-[48%] bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-xs text-muted mb-2">Maximum</Text>
                <Text className="text-2xl font-bold text-foreground">
                  {typeof currentMetric.max === "number"
                    ? currentMetric.max % 1 === 0
                      ? currentMetric.max
                      : currentMetric.max.toFixed(1)
                    : currentMetric.max}
                </Text>
                <Text className="text-xs text-muted mt-1">{currentMetric.unit}</Text>
              </View>

              {/* Average */}
              <View className="flex-1 min-w-[48%] bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-xs text-muted mb-2">Average</Text>
                <Text className="text-2xl font-bold text-foreground">
                  {typeof currentMetric.average === "number"
                    ? currentMetric.average % 1 === 0
                      ? currentMetric.average
                      : currentMetric.average.toFixed(1)
                    : currentMetric.average}
                </Text>
                <Text className="text-xs text-muted mt-1">{currentMetric.unit}</Text>
              </View>

              {/* Baseline */}
              <View className="flex-1 min-w-[48%] bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-xs text-muted mb-2">Baseline</Text>
                <Text className="text-2xl font-bold text-foreground">
                  {typeof currentMetric.baseline === "number"
                    ? currentMetric.baseline % 1 === 0
                      ? currentMetric.baseline
                      : currentMetric.baseline.toFixed(1)
                    : currentMetric.baseline}
                </Text>
                <Text className="text-xs text-muted mt-1">{currentMetric.unit}</Text>
              </View>
            </View>
          </View>

          {/* Normal Range Card */}
          <View className="bg-surface rounded-2xl p-4 border border-border">
            <Text className="text-sm font-semibold text-foreground mb-2">Normal Range</Text>
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <View
                  className="h-2 rounded-full"
                  style={{
                    backgroundColor: colors.border,
                  }}
                >
                  <View
                    className="h-2 rounded-full bg-success"
                    style={{
                      width: "60%",
                    }}
                  />
                </View>
              </View>
              <Text className="text-sm text-muted">
                {currentMetric.normalRange.min} - {currentMetric.normalRange.max}{" "}
                {currentMetric.unit}
              </Text>
            </View>
          </View>

          {/* Threshold Alert */}
          {isAbnormal(currentMetric.current, currentMetric.normalRange) && (
            <View className="bg-warning bg-opacity-10 rounded-2xl p-4 border border-warning">
              <Text className="text-sm font-semibold text-warning">⚠️ Threshold Alert</Text>
              <Text className="text-xs text-warning mt-1">
                Your {selectedMetric === "heartRate" ? "heart rate" : selectedMetric === "skinHumidity" ? "skin humidity" : "temperature"} is outside the normal range.
                Consider monitoring closely.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
