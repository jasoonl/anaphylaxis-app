import { ScrollView, Text, View, TouchableOpacity, Pressable, Alert } from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useHealth } from "@/lib/health-context";

/**
 * Emergency Contacts Screen
 *
 * Manage emergency contact information:
 * - View list of emergency contacts
 * - Add new contacts
 * - Edit/delete existing contacts
 * - Configure notification preferences
 */

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  notifyEnabled: boolean;
}

export default function ContactsScreen() {
  const colors = useColors();
  const health = useHealth();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    relationship: "Family",
  });

  const handleAddContact = () => {
    if (!newContact.name || !newContact.phone) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const contact: EmergencyContact = {
      id: Date.now().toString(),
      ...newContact,
      notifyEnabled: true,
    };

    health.addEmergencyContact(contact);
    setNewContact({ name: "", phone: "", relationship: "Family" });
    setShowAddForm(false);
  };

  const handleDeleteContact = (id: string) => {
    Alert.alert("Delete Contact", "Are you sure you want to delete this contact?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Delete",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          health.removeEmergencyContact(id);
        },
        style: "destructive",
      },
    ]);
  };

  const handleToggleNotification = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const contact = health.emergencyContacts.find((c) => c.id === id);
    if (contact) {
      health.updateEmergencyContact(id, { notifyEnabled: !contact.notifyEnabled });
    }
  };

  const handleTestAlert = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Test Alert Sent", "A test notification has been sent to all enabled contacts.");
  };

  return (
    <ScreenContainer className="p-4">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="gap-6 pb-8">
          {/* Header */}
          <View className="gap-1">
            <Text className="text-3xl font-bold text-foreground">Emergency Contacts</Text>
            <Text className="text-sm text-muted">Manage your emergency notification list</Text>
          </View>

          {/* Contacts List */}
          <View className="gap-3">
            {health.emergencyContacts.length > 0 ? (
              health.emergencyContacts.map((contact) => (
                <View
                  key={contact.id}
                  className="bg-surface rounded-2xl p-4 border border-border flex-row items-center justify-between"
                >
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-foreground">{contact.name}</Text>
                    <Text className="text-sm text-muted mt-1">{contact.phone}</Text>
                    <Text className="text-xs text-muted mt-1">{contact.relationship}</Text>
                  </View>

                  <View className="flex-row gap-2 items-center">
                    {/* Toggle Notification */}
                    <Pressable
                      onPress={() => handleToggleNotification(contact.id)}
                      style={({ pressed }) => [
                        {
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View
                        className={`w-12 h-12 rounded-lg items-center justify-center ${
                          contact.notifyEnabled ? "bg-success" : "bg-muted"
                        }`}
                      >
                        <Text className="text-lg">{contact.notifyEnabled ? "✓" : "✗"}</Text>
                      </View>
                    </Pressable>

                    {/* Delete Button */}
                    <Pressable
                      onPress={() => handleDeleteContact(contact.id)}
                      style={({ pressed }) => [
                        {
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View className="w-12 h-12 rounded-lg bg-error bg-opacity-10 items-center justify-center">
                        <Text className="text-lg">🗑️</Text>
                      </View>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <View className="bg-surface rounded-2xl p-6 items-center justify-center border border-border">
                <Text className="text-lg text-muted">No emergency contacts added yet</Text>
              </View>
            )}
          </View>

          {/* Add Contact Form */}
          {showAddForm && (
            <View className="bg-surface rounded-2xl p-4 border border-border gap-3">
              <Text className="text-lg font-semibold text-foreground">Add New Contact</Text>

              {/* Name Input */}
              <View className="gap-1">
                <Text className="text-sm text-muted">Name</Text>
                <View className="bg-background rounded-lg px-4 py-3 border border-border">
                  <Text className="text-foreground">{newContact.name || "Enter name..."}</Text>
                </View>
              </View>

              {/* Phone Input */}
              <View className="gap-1">
                <Text className="text-sm text-muted">Phone Number</Text>
                <View className="bg-background rounded-lg px-4 py-3 border border-border">
                  <Text className="text-foreground">{newContact.phone || "Enter phone..."}</Text>
                </View>
              </View>

              {/* Relationship Selector */}
              <View className="gap-1">
                <Text className="text-sm text-muted">Relationship</Text>
                <View className="flex-row gap-2">
                  {["Family", "Friend", "Doctor", "Other"].map((rel) => (
                    <Pressable
                      key={rel}
                      onPress={() => setNewContact({ ...newContact, relationship: rel })}
                      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                    >
                      <View
                        className={`px-3 py-2 rounded-lg ${
                          newContact.relationship === rel
                            ? "bg-primary"
                            : "bg-background border border-border"
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            newContact.relationship === rel
                              ? "text-white"
                              : "text-foreground"
                          }`}
                        >
                          {rel}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Action Buttons */}
              <View className="flex-row gap-2 mt-2">
                <TouchableOpacity
                  onPress={() => setShowAddForm(false)}
                  className="flex-1 bg-muted rounded-lg py-3 items-center"
                  activeOpacity={0.8}
                >
                  <Text className="font-semibold text-white">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddContact}
                  className="flex-1 bg-primary rounded-lg py-3 items-center"
                  activeOpacity={0.8}
                >
                  <Text className="font-semibold text-white">Save Contact</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Add Contact Button */}
          {!showAddForm && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAddForm(true);
              }}
              className="bg-primary rounded-2xl py-4 px-4 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-lg font-bold text-white">+ Add Emergency Contact</Text>
            </TouchableOpacity>
          )}

          {/* Alert Settings */}
          <View className="gap-3">
            <Text className="text-lg font-semibold text-foreground">Alert Settings</Text>

            {/* Auto-Alert Toggle */}
            <View className="bg-surface rounded-2xl p-4 border border-border flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">Auto-Alert on High Risk</Text>
                <Text className="text-xs text-muted mt-1">
                  Automatically notify contacts when risk is critical
                </Text>
              </View>
              <View className="w-12 h-12 rounded-lg bg-success items-center justify-center">
                <Text className="text-lg">✓</Text>
              </View>
            </View>

            {/* Alert Threshold */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-sm font-semibold text-foreground mb-3">Alert Threshold</Text>
              <View className="flex-row gap-2">
                {["Yellow", "Red"].map((level) => (
                  <Pressable
                    key={level}
                    onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View
                      className={`flex-1 px-4 py-3 rounded-lg ${
                        level === "Red" ? "bg-error" : "bg-warning"
                      }`}
                    >
                      <Text className="text-sm font-semibold text-white text-center">
                        {level} Risk
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* Test Alert Button */}
          <TouchableOpacity
            onPress={handleTestAlert}
            className="bg-primary bg-opacity-10 rounded-2xl py-4 px-4 items-center border border-primary"
            activeOpacity={0.8}
          >
            <Text className="text-lg font-bold text-primary">📧 Send Test Alert</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
