import {
  Bell,
  BellOff,
  BellRing,
  CircleDot,
  Disc3,
  Droplet,
  ThermometerSnowflake,
  Wrench,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import type {
  PendingReminderWithVehicle,
  ServiceCategory,
} from '@/types/database';
import { sendTestNotificationNow } from '@/utils/notifications';

export interface RemindersModalProps {
  visible: boolean;
  onClose: () => void;
  reminders: PendingReminderWithVehicle[];
  activeVehicleName?: string | null;
}

const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatOdometer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatServiceDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) {
    return isoDate;
  }
  const [year, monthStr, dayStr] = parts;
  const monthNumber = Number.parseInt(monthStr, 10);
  const dayNumber = Number.parseInt(dayStr, 10);
  if (
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12 ||
    !Number.isInteger(dayNumber)
  ) {
    return isoDate;
  }
  const dayPadded = String(dayNumber).padStart(2, '0');
  return `${dayPadded} ${MONTH_NAMES_SHORT[monthNumber - 1]} ${year}`;
}

function CategoryIcon({ category }: { category: ServiceCategory }) {
  const iconProps = {
    color: Colors.textSecondary,
    size: 16,
    strokeWidth: 1.9,
  } as const;

  switch (category) {
    case 'oil':
      return <Droplet {...iconProps} />;
    case 'tires':
      return <CircleDot {...iconProps} />;
    case 'brakes':
      return <Disc3 {...iconProps} />;
    case 'coolant':
      return <ThermometerSnowflake {...iconProps} />;
    case 'other':
      return <Wrench {...iconProps} />;
  }
}

export function RemindersModal({
  visible,
  onClose,
  reminders,
  activeVehicleName,
}: RemindersModalProps) {
  const insets = useSafeAreaInsets();
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testStatusMessage, setTestStatusMessage] = useState<string | null>(
    null
  );
  const [isSuccess, setIsSuccess] = useState<boolean>(true);

  const handleClose = (): void => {
    setTestStatusMessage(null);
    onClose();
  };

  const handleSendTestNotification = async (): Promise<void> => {
    if (isSendingTest) {
      return;
    }
    setIsSendingTest(true);
    setTestStatusMessage(null);

    try {
      await sendTestNotificationNow({
        title: 'Vehicle Maintenance Reminder',
        vehicleName: activeVehicleName ?? '2021 VW Golf',
      });
      setIsSuccess(true);
      setTestStatusMessage(
        '✓ Test notification sent! Check your device notification bar.'
      );
    } catch (err: unknown) {
      setIsSuccess(false);
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to send test notification. Check permissions.';
      setTestStatusMessage(message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const bottomSheetPadding = Math.max(insets.bottom, 16) + 12;
  const countLabel = `${reminders.length} ${
    reminders.length === 1 ? 'active reminder' : 'active reminders'
  }`;

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={handleClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close reminders sheet"
          onPress={handleClose}
          style={styles.backdropDismissArea}
        />

        <View style={[styles.sheet, { paddingBottom: bottomSheetPadding }]}>
          <View style={styles.grabberRow}>
            <View style={styles.grabberHandle} />
          </View>

          <View style={styles.headerRow}>
            <View style={styles.headerTextGroup}>
              <Text style={styles.sheetTitle}>Upcoming reminders</Text>
              <Text style={styles.sheetSubtitle}>{countLabel}</Text>
            </View>

            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={8}
              onPress={handleClose}
              style={({ pressed }) => [
                styles.iconCircleButton,
                pressed && styles.pressedOpacity,
              ]}
            >
              <X color={Colors.textSecondary} size={17} strokeWidth={2.1} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.remindersListContent}
            showsVerticalScrollIndicator={false}
            style={styles.remindersListScroll}
          >
            {reminders.length > 0 ? (
              reminders.map((reminder) => {
                const hasDate = Boolean(reminder.due_date);
                const hasOdometer = typeof reminder.due_odometer === 'number';

                return (
                  <View key={reminder.id} style={styles.reminderCard}>
                    <View style={styles.reminderTopRow}>
                      <View style={styles.categoryIconCircle}>
                        <CategoryIcon category={reminder.category} />
                      </View>

                      <View style={styles.reminderInfo}>
                        <Text numberOfLines={1} style={styles.reminderTitle}>
                          {reminder.title}
                        </Text>
                        <Text numberOfLines={1} style={styles.vehicleNameTag}>
                          {reminder.vehicle_name}
                        </Text>
                      </View>

                      <View style={styles.pendingBadge}>
                        <Bell
                          color={Colors.alertAccent}
                          size={12}
                          strokeWidth={2.2}
                        />
                        <Text style={styles.pendingBadgeText}>Pending</Text>
                      </View>
                    </View>

                    <View style={styles.reminderDivider} />

                    <View style={styles.reminderTargetRow}>
                      {hasOdometer ? (
                        <View style={styles.targetCol}>
                          <Text style={styles.targetLabel}>TARGET MILEAGE</Text>
                          <Text style={styles.targetValueMono}>
                            {formatOdometer(reminder.due_odometer as number)}{' '}
                            {reminder.vehicle_unit}
                          </Text>
                        </View>
                      ) : null}

                      {hasDate ? (
                        <View style={styles.targetColRight}>
                          <Text style={styles.targetLabel}>DUE DATE</Text>
                          <Text style={styles.targetValueDate}>
                            {formatServiceDate(reminder.due_date as string)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyStateCard}>
                <View style={styles.emptyIconCircle}>
                  <BellOff color={Colors.textSecondary} size={24} />
                </View>
                <Text style={styles.emptyStateTitle}>No pending reminders</Text>
                <Text style={styles.emptyStateSubtitle}>
                  All scheduled maintenance items for your vehicles are up to
                  date.
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.actionsContainer}>
            <Pressable
              accessibilityLabel="Send test notification now"
              accessibilityRole="button"
              disabled={isSendingTest}
              onPress={handleSendTestNotification}
              style={({ pressed }) => [
                styles.testButton,
                pressed && styles.testButtonPressed,
                isSendingTest && styles.testButtonDisabled,
              ]}
            >
              {isSendingTest ? (
                <ActivityIndicator color={Colors.background} size="small" />
              ) : (
                <BellRing
                  color={Colors.background}
                  size={18}
                  strokeWidth={2.4}
                />
              )}
              <Text style={styles.testButtonText}>
                {isSendingTest
                  ? 'Sending notification...'
                  : 'Send test notification now'}
              </Text>
            </Pressable>

            {testStatusMessage ? (
              <Text
                style={[
                  styles.statusText,
                  isSuccess ? styles.statusSuccess : styles.statusError,
                ]}
              >
                {testStatusMessage}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 18, 0.74)',
    justifyContent: 'flex-end',
  },
  backdropDismissArea: {
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  grabberHandle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#646D7C',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 12,
  },
  headerTextGroup: {
    flex: 1,
  },
  sheetTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  sheetSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    marginTop: 2,
  },
  iconCircleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remindersListScroll: {
    marginTop: 16,
    maxHeight: 360,
    backgroundColor: Colors.background,
  },
  remindersListContent: {
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: 12,
  },
  reminderCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  reminderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceRecessed,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderInfo: {
    flex: 1,
  },
  reminderTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  vehicleNameTag: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.alertBackground,
    borderWidth: 1,
    borderColor: Colors.alertBorder,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingBadgeText: {
    color: Colors.alertAccent,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
  },
  reminderDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  reminderTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  targetCol: {
    flex: 1,
  },
  targetColRight: {
    alignItems: 'flex-end',
  },
  targetLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  targetValueMono: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: '600',
  },
  targetValueDate: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyStateCard: {
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceRecessed,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyStateTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    textAlign: 'center',
  },
  actionsContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  testButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  testButtonPressed: {
    opacity: 0.88,
  },
  testButtonDisabled: {
    opacity: 0.7,
  },
  testButtonText: {
    color: Colors.background,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
  },
  statusText: {
    marginTop: 10,
    fontFamily: Fonts.sans,
    fontSize: 12,
    textAlign: 'center',
  },
  statusSuccess: {
    color: Colors.primary,
    fontWeight: '600',
  },
  statusError: {
    color: '#EF4444',
    fontWeight: '500',
  },
  pressedOpacity: {
    opacity: 0.76,
  },
});
