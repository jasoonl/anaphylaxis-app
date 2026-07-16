import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RiskThresholds, DEFAULT_THRESHOLDS } from "./risk-calculator";

/**
 * Health Monitoring Context
 *
 * Manages app-wide state for:
 * - Real-time vital signs
 * - Risk assessment
 * - Device connection status
 * - Emergency contacts
 * - User profile
 */

export interface VitalSigns {
  heartRate: number; // BPM (Pulse Sensor)
  bloodPressureSystolic: number; // mmHg (Blood Pressure Sensor)
  bloodPressureDiastolic: number; // mmHg (Blood Pressure Sensor)
  skinHumidity: number; // g/m2/h - transepidermal water loss (TEWL), see Schuler et al. 2023
  temperature: number; // °C (Temperature Sensor)
  timestamp: number;
  // Legacy fields for backward compatibility
  gsr?: number; // Deprecated - use skinHumidity instead
}

export interface RiskState {
  level: "safe" | "warning" | "critical";
  score: number;
  trend: "stable" | "rising" | "falling";
  timestamp: number;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  notifyEnabled: boolean;
}

export interface UserProfile {
  name: string;
  allergies: string;
  severity: "mild" | "moderate" | "severe";
}

export interface HealthContextType {
  // Vital Signs
  vitalSigns: VitalSigns;
  updateVitalSigns: (signs: Partial<VitalSigns>) => void;

  // Risk State
  riskState: RiskState;
  updateRiskState: (state: Partial<RiskState>) => void;

  // Device Connection
  isDeviceConnected: boolean;
  setIsDeviceConnected: (connected: boolean) => void;
  deviceName: string;
  setDeviceName: (name: string) => void;

  // Emergency Contacts
  emergencyContacts: EmergencyContact[];
  addEmergencyContact: (contact: EmergencyContact) => void;
  removeEmergencyContact: (id: string) => void;
  updateEmergencyContact: (id: string, contact: Partial<EmergencyContact>) => void;

  // User Profile
  userProfile: UserProfile;
  updateUserProfile: (profile: Partial<UserProfile>) => void;

  // Alert History
  alertHistory: Array<{ timestamp: number; riskLevel: string; score: number }>;
  addAlertToHistory: (riskLevel: string, score: number) => void;
  clearAlertHistory: () => void;

  // Risk Thresholds (editable by user, e.g. per their doctor's guidance)
  riskThresholds: RiskThresholds;
  updateRiskThresholds: (thresholds: Partial<RiskThresholds>) => void;
  resetRiskThresholds: () => void;

  // Demo Mode
  isDemoMode: boolean;
  setIsDemoMode: (demo: boolean) => void;
}

const HealthContext = createContext<HealthContextType | undefined>(undefined);

export function HealthProvider({ children }: { children: ReactNode }) {
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({
    heartRate: 72, // BPM
    bloodPressureSystolic: 120, // mmHg
    bloodPressureDiastolic: 80, // mmHg
    skinHumidity: 10, // g/m2/h - Schuler et al. cohort baseline mean
    temperature: 36.8, // °C
    timestamp: Date.now(),
    gsr: 15, // Legacy field
  });

  const [riskState, setRiskState] = useState<RiskState>({
    level: "safe",
    score: 0,
    trend: "stable",
    timestamp: Date.now(),
  });

  const [isDeviceConnected, setIsDeviceConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("XIAO ESP32 C3");
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [riskThresholds, setRiskThresholds] = useState<RiskThresholds>(DEFAULT_THRESHOLDS);

  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([
    {
      id: "1",
      name: "Jason Park",
      phone: "+1 (347) 593-4089",
      relationship: "Friend",
      notifyEnabled: true,
    },
    {
      id: "2",
      name: "Eshaan Nandy",
      phone: "+1 (856) 688-6190",
      relationship: "Friend",
      notifyEnabled: true,
    },
  ]);

  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: "User",
    allergies: "Peanuts, Tree nuts",
    severity: "severe",
  });

  const [alertHistory, setAlertHistory] = useState<
    Array<{ timestamp: number; riskLevel: string; score: number }>
  >([]);

  // Load persisted data on mount
  useEffect(() => {
    loadPersistedData();
  }, []);

  const loadPersistedData = async () => {
    try {
      const [contactsData, profileData, historyData, thresholdsData] = await Promise.all([
        AsyncStorage.getItem("emergencyContacts"),
        AsyncStorage.getItem("userProfile"),
        AsyncStorage.getItem("alertHistory"),
        AsyncStorage.getItem("riskThresholds"),
      ]);

      if (contactsData) {
        const storedContacts: EmergencyContact[] = JSON.parse(contactsData);
        // One-time migration: devices that ran the app before the real contacts
        // were added still have the old placeholder "Mom"/"Dr. Smith" entries
        // persisted in AsyncStorage, which otherwise silently override the new
        // in-code defaults on every load. Replace them automatically, once.
        const isStalePlaceholderSet =
          storedContacts.length === 2 &&
          storedContacts[0]?.name === "Mom" &&
          storedContacts[1]?.name === "Dr. Smith";

        if (isStalePlaceholderSet) {
          setEmergencyContacts(emergencyContacts);
          await AsyncStorage.setItem("emergencyContacts", JSON.stringify(emergencyContacts));
        } else {
          setEmergencyContacts(storedContacts);
        }
      }
      if (profileData) setUserProfile(JSON.parse(profileData));
      if (historyData) setAlertHistory(JSON.parse(historyData));
      if (thresholdsData) {
        // Merge over defaults so any threshold keys added in future app
        // versions still get a sensible value even if the saved object predates them.
        setRiskThresholds({ ...DEFAULT_THRESHOLDS, ...JSON.parse(thresholdsData) });
      }
    } catch (error) {
      console.error("Error loading persisted data:", error);
    }
  };

  const updateVitalSigns = (signs: Partial<VitalSigns>) => {
    setVitalSigns((prev) => ({
      ...prev,
      ...signs,
      timestamp: Date.now(),
    }));
  };

  const updateRiskState = (state: Partial<RiskState>) => {
    setRiskState((prev) => ({
      ...prev,
      ...state,
      timestamp: Date.now(),
    }));
  };

  const addEmergencyContact = async (contact: EmergencyContact) => {
    const updated = [...emergencyContacts, contact];
    setEmergencyContacts(updated);
    await AsyncStorage.setItem("emergencyContacts", JSON.stringify(updated));
  };

  const removeEmergencyContact = async (id: string) => {
    const updated = emergencyContacts.filter((c) => c.id !== id);
    setEmergencyContacts(updated);
    await AsyncStorage.setItem("emergencyContacts", JSON.stringify(updated));
  };

  const updateEmergencyContact = async (
    id: string,
    contact: Partial<EmergencyContact>
  ) => {
    const updated = emergencyContacts.map((c) =>
      c.id === id ? { ...c, ...contact } : c
    );
    setEmergencyContacts(updated);
    await AsyncStorage.setItem("emergencyContacts", JSON.stringify(updated));
  };

  const updateUserProfile = async (profile: Partial<UserProfile>) => {
    const updated = { ...userProfile, ...profile };
    setUserProfile(updated);
    await AsyncStorage.setItem("userProfile", JSON.stringify(updated));
  };

  const addAlertToHistory = async (riskLevel: string, score: number) => {
    const updated = [
      ...alertHistory,
      { timestamp: Date.now(), riskLevel, score },
    ].slice(-100); // Keep last 100 alerts
    setAlertHistory(updated);
    await AsyncStorage.setItem("alertHistory", JSON.stringify(updated));
  };

  const clearAlertHistory = async () => {
    setAlertHistory([]);
    await AsyncStorage.setItem("alertHistory", JSON.stringify([]));
  };

  const updateRiskThresholds = async (partial: Partial<RiskThresholds>) => {
    const updated = { ...riskThresholds, ...partial };
    setRiskThresholds(updated);
    await AsyncStorage.setItem("riskThresholds", JSON.stringify(updated));
  };

  const resetRiskThresholds = async () => {
    setRiskThresholds(DEFAULT_THRESHOLDS);
    await AsyncStorage.removeItem("riskThresholds");
  };

  const value: HealthContextType = {
    vitalSigns,
    updateVitalSigns,
    riskState,
    updateRiskState,
    isDeviceConnected,
    setIsDeviceConnected,
    deviceName,
    setDeviceName,
    emergencyContacts,
    addEmergencyContact,
    removeEmergencyContact,
    updateEmergencyContact,
    userProfile,
    updateUserProfile,
    alertHistory,
    addAlertToHistory,
    clearAlertHistory,

    riskThresholds,
    updateRiskThresholds,
    resetRiskThresholds,
    isDemoMode,
    setIsDemoMode,
  };

  return (
    <HealthContext.Provider value={value}>{children}</HealthContext.Provider>
  );
}

export function useHealth() {
  const context = useContext(HealthContext);
  if (!context) {
    throw new Error("useHealth must be used within HealthProvider");
  }
  return context;
}
