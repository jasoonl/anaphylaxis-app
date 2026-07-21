import * as SMS from "expo-sms";
import { Linking } from "react-native";
import { EmergencyContact } from "./health-context";

/**
 * Emergency Contact Notification Service
 *
 * Sends real text messages via expo-sms and places real phone calls via the
 * native dialer to emergency contacts. Both are genuinely real actions, not
 * simulations - but both are also subject to the same platform-level
 * restriction: neither iOS nor Android allows an app to silently send an SMS
 * or place a phone call without the person confirming with one tap. That's
 * not a shortcut this app is taking - it's an OS-level anti-fraud/anti-spam
 * protection that applies to every app, including this one. A fully silent,
 * automatic version would require a paid backend call/SMS gateway (e.g.
 * Twilio) running server-side, which is out of scope for a local-first app.
 *
 * Calling has an additional real-world constraint SMS doesn't: a phone can
 * only have one active call at a time, so contacts can't all be called
 * simultaneously the way they can all be texted at once. This service opens
 * the dialer for the first enabled contact automatically when notifying, and
 * the emergency screen surfaces a Call button for every other enabled
 * contact so each one can still be reached with a single tap if needed.
 *
 * Note: SMS is not available on the iOS Simulator (no Messages capability).
 * Calling opens the Phone app UI even on Simulator, but won't complete a real
 * call there either. Test both on a real device via Expo Go.
 */

export interface SendResult {
  sent: boolean;
  message: string;
  notifiedNames: string[];
}

export interface NotifyResult {
  smsResult: SendResult;
  calledContact: EmergencyContact | null;
  remainingContacts: EmergencyContact[];
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

/**
 * Opens the native phone dialer pre-filled with the given contact's number.
 * The person still has to tap the call button in the Phone app - no app can
 * silently place a call.
 */
export async function callContact(phone: string): Promise<boolean> {
  const dialUrl = `tel:${phone.replace(/[^0-9+]/g, "")}`;
  try {
    const canOpen = await Linking.canOpenURL(dialUrl);
    if (!canOpen) return false;
    await Linking.openURL(dialUrl);
    return true;
  } catch (error) {
    console.error("Failed to open dialer:", error);
    return false;
  }
}

/**
 * Full emergency notification: texts every enabled contact and opens the
 * dialer for the first one. Returns the rest so the UI can offer one-tap
 * Call buttons for each, since they can't all be called simultaneously.
 */
export async function notifyEmergencyContacts(
  contacts: EmergencyContact[],
  message: string
): Promise<NotifyResult> {
  const enabled = contacts.filter((c) => c.notifyEnabled);
  const smsResult = await sendEmergencyText(contacts, message);

  // Deliberately do NOT auto-launch the dialer here. The SMS composer is a
  // native modal; opening the phone dialer in the same tick races with it on
  // real devices (they fight over the foreground). Instead we return every
  // enabled contact so the UI can present one-tap Call buttons, letting the
  // person place calls after the text composer closes. A phone can only hold
  // one call at a time anyway, so sequential manual calls is the correct model.
  return {
    smsResult,
    calledContact: null,
    remainingContacts: enabled,
  };
}

/** Builds the standard emergency alert message body sent to contacts. */
export function buildEmergencyMessage(riskScore: number, userName: string): string {
  return `EMERGENCY ALERT from EpiLink: ${userName} may be experiencing a severe allergic reaction (risk score ${Math.round(riskScore)}/10). Please check on them immediately or call 911.`;
}
