/**
 * Notification Service
 *
 * Handles push notifications and emergency alerts
 * Integrates with expo-notifications for local and push notifications
 */

import * as Notifications from "expo-notifications";
import { EmergencyContact } from "./health-context";

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

class NotificationService {
  private isInitialized = false;

  /**
   * Initialize notification service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Request notification permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        console.warn("Notification permissions not granted");
      }

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize notifications:", error);
    }
  }

  /**
   * Send local notification
   */
  async sendLocalNotification(payload: NotificationPayload): Promise<string> {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
          sound: "default",
          badge: 1,
        },
        trigger: null, // Send immediately
      });

      return notificationId;
    } catch (error) {
      console.error("Failed to send local notification:", error);
      throw error;
    }
  }

  /**
   * Send emergency alert notification
   */
  async sendEmergencyAlert(riskScore: number, contacts: EmergencyContact[]): Promise<void> {
    const enabledContacts = contacts.filter((c) => c.notifyEnabled);

    if (enabledContacts.length === 0) {
      console.warn("No emergency contacts enabled");
      return;
    }

    // Send local notification
    await this.sendLocalNotification({
      title: "🚨 EMERGENCY ALERT",
      body: `Critical anaphylaxis risk detected (Score: ${riskScore}/100). Emergency contacts have been notified.`,
      data: {
        type: "emergency",
        riskScore: riskScore.toString(),
      },
    });

    // Simulate sending SMS to emergency contacts
    // In production, this would integrate with a backend service
    for (const contact of enabledContacts) {
      await this.sendEmergencyContactAlert(contact, riskScore);
    }
  }

  /**
   * Send alert to individual emergency contact
   * In production, this would call a backend API to send SMS
   */
  private async sendEmergencyContactAlert(
    contact: EmergencyContact,
    riskScore: number
  ): Promise<void> {
    try {
      // TODO: Integrate with backend API to send SMS
      // Example: POST /api/send-sms with contact phone and message
      console.log(
        `[SMS] Sending emergency alert to ${contact.name} (${contact.phone}): Risk Score ${riskScore}/100`
      );

      // For now, just log the action
      const message = `EMERGENCY ALERT: Anaphylaxis risk detected (${riskScore}/100). Please check on the user immediately.`;
      console.log(`Message: ${message}`);
    } catch (error) {
      console.error(`Failed to send alert to ${contact.name}:`, error);
    }
  }

  /**
   * Send warning notification
   */
  async sendWarningNotification(riskScore: number): Promise<void> {
    await this.sendLocalNotification({
      title: "⚠️ Elevated Risk",
      body: `Anaphylaxis risk is elevated (Score: ${riskScore}/100). Monitor closely and be prepared to take action.`,
      data: {
        type: "warning",
        riskScore: riskScore.toString(),
      },
    });
  }

  /**
   * Send info notification
   */
  async sendInfoNotification(title: string, body: string): Promise<void> {
    await this.sendLocalNotification({
      title,
      body,
      data: {
        type: "info",
      },
    });
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      console.error("Failed to cancel notifications:", error);
    }
  }

  /**
   * Get all scheduled notifications
   */
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error("Failed to get scheduled notifications:", error);
      return [];
    }
  }

  /**
   * Listen for notification responses
   */
  onNotificationResponse(
    callback: (response: Notifications.NotificationResponse) => void
  ): () => void {
    const subscription = Notifications.addNotificationResponseReceivedListener(callback);
    return () => subscription.remove();
  }

  /**
   * Listen for incoming notifications
   */
  onNotificationReceived(
    callback: (notification: Notifications.Notification) => void
  ): () => void {
    const subscription = Notifications.addNotificationReceivedListener(callback);
    return () => subscription.remove();
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
