import * as SMS from "expo-sms";
import { EmergencyContact } from "./health-context";

/**
 * SMS Service
 *
 * Sends real text messages to emergency contacts using the device's native
 * Messages app via expo-sms. Apps cannot send SMS silently on iOS or Android -
 * this opens the native composer pre-filled with the message and recipients,
 * and the person must tap Send. That's a platform limitation, not a shortcut:
 * silent background SMS sending would require a paid third-party gateway
 * (e.g. Twilio) running on a backend server, which is out of scope for a
 * local-first prototype.
 *
 * Note: SMS is not available on the iOS Simulator (no cellular/Messages
 * capability) or on iPads without cellular. Test on a real iPhone or Android
 * device via Expo Go.
 */

export interface SendResult {
  sent: boolean;
  message: string;
  notifiedNames: string[];
}

/**
 * Opens the native SMS composer addressed to all enabled emergency contacts,
 * pre-filled with the given message.
 */
export async function sendEmergencyText(
  contacts: EmergencyContact[],
  bodyText: string
): Promise<SendResult> {
  const enabled = contacts.filter((c) => c.notifyEnabled);

  if (enabled.length === 0) {
    return { sent: false, message: "No emergency contacts are enabled for notifications.", notifiedNames: [] };
  }

  const isAvailable = await SMS.isAvailableAsync();
  if (!isAvailable) {
    return {
      sent: false,
      message:
        "SMS is not available on this device. The iOS Simulator can't send texts - try this on a real iPhone or Android device via Expo Go.",
      notifiedNames: [],
    };
  }

  const phoneNumbers = enabled.map((c) => c.phone);

  try {
    const { result } = await SMS.sendSMSAsync(phoneNumbers, bodyText);

    if (result === "sent") {
      return {
        sent: true,
        message: `Message sent to ${enabled.map((c) => c.name).join(", ")}.`,
        notifiedNames: enabled.map((c) => c.name),
      };
    }
    if (result === "cancelled") {
      return { sent: false, message: "Message composer was closed before sending.", notifiedNames: [] };
    }
    return { sent: false, message: `Message was not sent (${result}).`, notifiedNames: [] };
  } catch (error) {
    console.error("Failed to open SMS composer:", error);
    return { sent: false, message: "Could not open the messaging app.", notifiedNames: [] };
  }
}

/** Builds the standard emergency alert message body sent to contacts. */
export function buildEmergencyMessage(riskScore: number, userName: string): string {
  return `EMERGENCY ALERT from Anaphylaxis Guard: ${userName} may be experiencing a severe allergic reaction (risk score ${Math.round(riskScore)}/10). Please check on them immediately or call 911.`;
}
