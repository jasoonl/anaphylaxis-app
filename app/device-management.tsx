import { ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useState, useEffect, useCallback } from "react";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { withOpacity } from "@/lib/utils";
import { bleManager, BLEDevice, PairedDevice } from "@/lib/ble-manager";

/**
 * Device Management Screen
 *
 * IMPORTANT: Real BLE radio scanning/pairing requires a native module that
 * cannot run inside Expo Go (see the note at the top of lib/ble-manager.ts).
 * This screen provides a fully real, working device PAIRING/MANAGEMENT layer
 * - persisted list of paired devices, add/remove/reconnect, only one device
 * active at a time - on top of simulated sensor data, since there's no real
 * wearable hardware available in this environment.
 *
 * - Scan for and add new devices
 * - View paired devices and which one is currently active
 * - Reconnect to a previously paired device
 * - Remove (unpair) a device
 */

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "Never connected";
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export default function DeviceManagementScreen() {
  const colors = useColors();

  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<BLEDevice[]>([]);
  const [pairingId, setPairingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [devices, activeId] = await Promise.all([
      bleManager.getPairedDevices(),
      bleManager.getActiveDeviceId(),
    ]);
    setPairedDevices(devices);
    setActiveDeviceId(activeId);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleScan = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsScanning(true);
    setDiscoveredDevices([]);
    try {
      // Simulated scan delay - there's no real radio to wait on, but a brief
      // delay makes the flow read honestly as "searching" rather than instant
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const found = await bleManager.scanForDevices();
      setDiscoveredDevices(found);
      if (found.length === 0) {
        Alert.alert("No New Devices", "All available demo devices are already paired.");
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handlePair = async (device: BLEDevice) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPairingId(device.id);
    try {
      await bleManager.pairDevice(device);
      setDiscoveredDevices((prev) => prev.filter((d) => d.id !== device.id));
      await refresh();
      Alert.alert("Device Paired", `${device.name} is now connected and streaming.`);
    } catch (error) {
      Alert.alert("Pairing Failed", "Could not pair with this device.");
    } finally {
      setPairingId(null);
    }
  };

  const handleReconnect = async (device: PairedDevice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusyId(device.id);
    try {
      const ok = await bleManager.reconnectDevice(device.id);
      await refresh();
      if (!ok) Alert.alert("Reconnect Failed", `Could not reconnect to ${device.name}.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await bleManager.disconnectActive();
    await refresh();
  };

  const handleRemove = (device: PairedDevice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Remove Device", `Remove "${device.name}" from your paired devices?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setBusyId(device.id);
          await bleManager.removeDevice(device.id);
          await refresh();
          setBusyId(null);
        },
      },
    ]);
  };

  const activeDevice = pairedDevices.find((d) => d.id === activeDeviceId);

  return (
    <ScreenContainer className="p-4">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="gap-6 pb-8">
          {/* Header */}
          <View className="flex-row items-center gap-3">
            <TouchableOpacity onPress={() => router.back()} className="p-1">
              <Text className="text-2xl text-foreground">‹</Text>
            </TouchableOpacity>
            <Text className="text-2xl font-bold text-foreground">Devices</Text>
          </View>

          <Text className="text-xs text-muted leading-relaxed">
            Real Bluetooth scanning can't run inside Expo Go - it requires a custom native
            build. This screen manages paired devices and streams simulated sensor data, the
            same demo mode used throughout the app.
          </Text>

          {/* Active Device Status */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Active Device</Text>
            <View className="bg-surface rounded-2xl p-4 border border-border gap-2">
              {activeDevice ? (
                <>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: colors.success }}
                      />
                      <Text className="text-base font-semibold text-foreground">
                        {activeDevice.name}
                      </Text>
                    </View>
                    <Text className="text-xs text-muted">Streaming</Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleDisconnect}
                    className="rounded-lg py-2 items-center mt-2"
                    style={{ backgroundColor: withOpacity(colors.error, 0.1) }}
                  >
                    <Text className="text-sm font-semibold" style={{ color: colors.error }}>
                      Disconnect
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View className="flex-row items-center gap-2">
                  <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.muted }} />
                  <Text className="text-base text-muted">No device connected</Text>
                </View>
              )}
            </View>
          </View>

          {/* Add New Device */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Add a Device</Text>
            <TouchableOpacity
              onPress={handleScan}
              disabled={isScanning}
              className="rounded-2xl p-4 border border-primary items-center flex-row justify-center gap-2"
              style={{ backgroundColor: withOpacity(colors.primary, 0.08) }}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text className="text-base">🔍</Text>
              )}
              <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                {isScanning ? "Scanning..." : "Scan for Devices"}
              </Text>
            </TouchableOpacity>

            {discoveredDevices.map((device) => (
              <View
                key={device.id}
                className="bg-surface rounded-2xl p-4 border border-border flex-row items-center justify-between"
              >
                <View>
                  <Text className="text-base font-semibold text-foreground">{device.name}</Text>
                  <Text className="text-xs text-muted mt-0.5">Available to pair</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handlePair(device)}
                  disabled={pairingId === device.id}
                  className="rounded-lg px-4 py-2"
                  style={{ backgroundColor: colors.primary }}
                >
                  {pairingId === device.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-sm font-semibold text-white">Pair</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Paired Devices List */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">My Devices</Text>
            {pairedDevices.length === 0 ? (
              <View className="bg-surface rounded-2xl p-4 border border-border">
                <Text className="text-sm text-muted text-center">
                  No paired devices yet. Scan above to add one.
                </Text>
              </View>
            ) : (
              pairedDevices.map((device) => {
                const isActive = device.id === activeDeviceId;
                return (
                  <View
                    key={device.id}
                    className="bg-surface rounded-2xl p-4 border border-border gap-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <View
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: isActive ? colors.success : colors.muted }}
                          />
                          <Text className="text-base font-semibold text-foreground">
                            {device.name}
                          </Text>
                        </View>
                        <Text className="text-xs text-muted mt-1">
                          {isActive ? "Connected now" : formatRelativeTime(device.lastConnectedAt)}
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row gap-2">
                      {!isActive && (
                        <TouchableOpacity
                          onPress={() => handleReconnect(device)}
                          disabled={busyId === device.id}
                          className="flex-1 rounded-lg py-2 items-center"
                          style={{ backgroundColor: withOpacity(colors.primary, 0.1) }}
                        >
                          {busyId === device.id ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                              Reconnect
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={() => handleRemove(device)}
                        disabled={busyId === device.id}
                        className="flex-1 rounded-lg py-2 items-center"
                        style={{ backgroundColor: withOpacity(colors.error, 0.1) }}
                      >
                        <Text className="text-sm font-semibold" style={{ color: colors.error }}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
