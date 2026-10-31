import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SERVICE_REMINDER_CHANNEL_ID = 'service-reminders';

// Configure foreground notification presentation handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotificationChannelAsync(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(
        SERVICE_REMINDER_CHANNEL_ID,
        {
          name: 'Service Reminders',
          description:
            'Notifications for upcoming vehicle service and maintenance reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#F59E0B',
          sound: 'default',
        }
      );
    } catch {
      // In Expo Go or devices without native channel support, gracefully fallback
    }
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    if (
      existing.granted ||
      existing.ios?.status ===
        Notifications.IosAuthorizationStatus.PROVISIONAL ||
      existing.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    ) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return (
      requested.granted ||
      requested.ios?.status ===
        Notifications.IosAuthorizationStatus.PROVISIONAL ||
      requested.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    );
  } catch {
    return false;
  }
}

export interface ScheduleReminderNotificationParams {
  title: string;
  vehicleName: string;
  dueDate: string;
  dueOdometer?: number | null;
  reminderId?: number | null;
}

export function parseReminderTargetDate(dueDate: string): Date {
  const parts = dueDate.split('-');
  const year = Number.parseInt(parts[0] ?? '2026', 10);
  const month = Number.parseInt(parts[1] ?? '1', 10);
  const day = Number.parseInt(parts[2] ?? '1', 10);

  // Set target to 9:00 AM local time
  return new Date(year, month - 1, day, 9, 0, 0, 0);
}

export function getServiceReminderNotificationId(
  reminderIdOrKey: number | string
): string {
  return `service-reminder-${reminderIdOrKey}`;
}

export async function scheduleServiceReminderNotification(
  params: ScheduleReminderNotificationParams
): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    return null;
  }

  await setupNotificationChannelAsync();

  const targetDate = parseReminderTargetDate(params.dueDate);
  const now = Date.now();
  // If target date is in the past, schedule it 5 seconds from now so the user is alerted
  const triggerDate =
    targetDate.getTime() > now ? targetDate : new Date(now + 5000);

  const identifier = params.reminderId
    ? getServiceReminderNotificationId(params.reminderId)
    : undefined;

  const dueOdometerText =
    typeof params.dueOdometer === 'number' && params.dueOdometer > 0
      ? ` at ${Math.round(params.dueOdometer).toLocaleString('en-US')} km`
      : '';

  return await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `Service reminder: ${params.title}`,
      body: `${params.vehicleName} is due for ${params.title.toLowerCase()}${dueOdometerText}.`,
      sound: true,
      data: {
        vehicleName: params.vehicleName,
        title: params.title,
        dueDate: params.dueDate,
        dueOdometer: params.dueOdometer,
        reminderId: params.reminderId,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: SERVICE_REMINDER_CHANNEL_ID,
    },
  });
}

export async function cancelScheduledServiceNotification(
  identifier: string
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // Ignore cancellation errors
  }
}

export async function cancelServiceReminderNotification(
  reminderIdOrKey: number | string
): Promise<void> {
  const identifier = getServiceReminderNotificationId(reminderIdOrKey);
  await cancelScheduledServiceNotification(identifier);
}

export async function sendTestNotificationNow(options?: {
  title?: string;
  vehicleName?: string;
}): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Push notifications are not supported on web.');
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    throw new Error('Notification permission was not granted.');
  }

  await setupNotificationChannelAsync();

  const title = options?.title ?? 'Vehicle Maintenance Alert';
  const vehicleName = options?.vehicleName ?? '2021 VW Golf';

  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: `${vehicleName} has an upcoming maintenance reminder scheduled.`,
      sound: true,
      data: { type: 'test' },
    },
    trigger: null,
  });
}
