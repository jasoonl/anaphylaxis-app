import { ScrollView, Text, View, TouchableOpacity, Pressable, Alert, TextInput } from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Haptics from "expo-haptics";
import { useHealth } from "@/lib/health-context";
import { withOpacity } from "@/lib/utils";

/**
 * Emergency Contacts Screen
 *
 * Manage emergency contact information:
 * - View list of emergency contacts
 * - Add new contacts
 * - Edit/delete existing contacts
 * - Configure notification preferences
 */

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
    const contact = {
      id: Date.now().toString(),
      name: newContact.name,
      phone: newContact.phone,
      relationship: newContact.relationship,
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
        <View className="gap-4 pb-8">
          {/* Header */}
          <View className="gap-1">
            <Text className="text-3xl font-bold text-foreground">Emergency Contacts</Text>
            <Text className="text-sm text-muted">Manage your emergency notification list</Text>
          </View>

          {/* Add Contact Button */}
          <TouchableOpacity
            onPress={() => setShowAddForm(!showAddForm)}
            className="bg-primary rounded-lg py-3 px-4 items-center active:opacity-80"
            activeOpacity={0.8}
          >
            <Text className="text-base font-semibold text-white">
              {showAddForm ? "Cancel" : "+ Add New Contact"}
            </Text>
          </TouchableOpacity>

          {/* Add Contact Form */}
          {showAddForm && (
            <View className="bg-surface rounded-lg p-4 border border-border gap-3">
              <Text className="text-lg font-semibold text-foreground">Add New Contact</Text>

              {/* Name Input */}
              <View className="gap-1">
                <Text className="text-sm text-muted">Name</Text>
                <TextInput
                  placeholder="Enter contact name"
                  placeholderTextColor={colors.muted}
                  value={newContact.name}
                  onChangeText={(text) => setNewContact({ ...newContact, name: text })}
                  className="bg-background rounded-lg px-4 py-3 border border-border text-foreground"
                />
              </View>

              {/* Phone Input */}
              <View className="gap-1">
                <Text className="text-sm text-muted">Phone Number</Text>
                <TextInput
                  placeholder="Enter phone number"
                  placeholderTextColor={colors.muted}
                  value={newContact.phone}
                  onChangeText={(text) => setNewContact({ ...newContact, phone: text })}
                  keyboardType="phone-pad"
                  className="bg-background rounded-lg px-4 py-3 border border-border text-foreground"
                />
              </View>

              {/* Relationship Selector */}
              <View className="gap-1">
                <Text className="text-sm text-muted">Relationship</Text>
                <View className="flex-row gap-2 flex-wrap">
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

              {/* Add Button */}
              <TouchableOpacity
                onPress={handleAddContact}
                className="bg-success rounded-lg py-3 items-center mt-2 active:opacity-80"
                activeOpacity={0.8}
              >
                <Text className="text-base font-semibold text-white">Add Contact</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Contacts List */}
          <View className="gap-3">
            {health.emergencyContacts.length > 0 ? (
              health.emergencyContacts.map((contact) => (
                <View
                  key={contact.id}
                  className="bg-surface rounded-lg p-4 border border-border"
                >
                  <View className="flex-row items-start justify-between mb-3">
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground">{contact.name}</Text>
                      <Text className="text-sm text-muted mt-1">{contact.phone}</Text>
                      <Text className="text-xs text-muted mt-1">{contact.relationship}</Text>
                    </View>

                    {/* Delete Button */}
                    <Pressable
                      onPress={() => handleDeleteContact(contact.id)}
                      style={({ pressed }) => [
                        {
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View
                        className="w-10 h-10 rounded-lg items-center justify-center"
                        style={{ backgroundColor: withOpacity(colors.error, 0.1) }}
                      >
                        <Text className="text-lg">🗑️</Text>
                      </View>
                    </Pressable>
                  </View>

                  {/* Toggle Notification */}
                  <TouchableOpacity
                    onPress={() => handleToggleNotification(contact.id)}
                    className={`rounded-lg py-2 px-3 items-center ${
                      contact.notifyEnabled ? "bg-success" : "bg-muted"
                    }`}
                    activeOpacity={0.8}
                  >
                    <Text className="text-sm font-semibold text-white">
                      {contact.notifyEnabled ? "✓ Notifications Enabled" : "✗ Notifications Disabled"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <View className="bg-surface rounded-lg p-6 items-center justify-center border border-border">
                <Text className="text-base text-muted">No emergency contacts added yet</Text>
              </View>
            )}
          </View>

          {/* Test Alert Button */}
          <TouchableOpacity
            onPress={handleTestAlert}
            className="bg-primary rounded-lg py-3 px-4 items-center active:opacity-80"
            activeOpacity={0.8}
          >
            <Text className="text-base font-semibold text-white">Send Test Alert</Text>
          </TouchableOpacity>

          {/* Info Box */}
          <View
            className="rounded-lg p-3 border border-primary"
            style={{ backgroundColor: withOpacity(colors.primary, 0.1) }}
          >
            <Text className="text-xs text-primary leading-relaxed">
              ℹ️ Emergency contacts will be notified automatically when a critical anaphylaxis risk is detected.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
