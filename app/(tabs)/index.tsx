import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  ArrowRight,
  Bell,
  ChevronDown,
  CircleDot,
  Disc3,
  Droplet,
  Plus,
  ReceiptText,
  ThermometerSnowflake,
  TriangleAlert,
  Wrench,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import vwGolfThumbnail from '@/assets/images/vw-golf.png';
import { QuickLogServiceModal } from '@/components/QuickLogServiceModal';
import { Colors, Fonts } from '@/constants/theme';
import { useGarageData } from '@/hooks/useGarageData';
import type { Reminder, ServiceCategory, Vehicle } from '@/types/database';

const MONTH_NAMES_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

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

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function getMonthNameFromKey(yearMonthKey: string, short = false): string {
  const parts = yearMonthKey.split('-');
  const monthNumber = Number.parseInt(parts[1] ?? '1', 10);
  const index =
    Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12
      ? monthNumber - 1
      : 0;
  return short ? MONTH_NAMES_SHORT[index] : MONTH_NAMES_FULL[index];
}

function formatSpendComparison(
  difference: number,
  previousMonthKey: string
): string {
  const prevMonthLabel = getMonthNameFromKey(previousMonthKey, true);
  if (difference > 0) {
    return `+$${difference.toFixed(2)} vs ${prevMonthLabel}`;
  }
  if (difference < 0) {
    return `-$${Math.abs(difference).toFixed(2)} vs ${prevMonthLabel}`;
  }
  return `$0.00 vs ${prevMonthLabel}`;
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

function ServiceCategoryIcon({ category }: { category: ServiceCategory }) {
  const iconProps = {
    color: Colors.textSecondary,
    size: 17,
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

interface ReminderMetrics {
  dueOdometer: number;
  remainingDistance: number;
  progressPercent: number;
  progressWidth: `${number}%`;
  isOverdue: boolean;
}

function calculateReminderMetrics(
  vehicle: Vehicle,
  reminder: Reminder
): ReminderMetrics | null {
  if (reminder.due_odometer === null) {
    return null;
  }

  const dueOdometer = reminder.due_odometer;
  const remainingDistance = dueOdometer - vehicle.current_odometer;
  const totalInterval = dueOdometer - reminder.last_service_odometer;
  const elapsedDistance =
    vehicle.current_odometer - reminder.last_service_odometer;

  const rawRatio = totalInterval > 0 ? elapsedDistance / totalInterval : 1;
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(rawRatio * 100))
  );

  return {
    dueOdometer,
    remainingDistance,
    progressPercent,
    progressWidth: `${progressPercent}%`,
    isOverdue: remainingDistance <= 0,
  };
}

export default function GarageScreen() {
  const insets = useSafeAreaInsets();
  const {
    vehicle,
    pendingReminder,
    monthlySpend,
    serviceLogs,
    updateOdometer,
    logService,
  } = useGarageData();

  const reminderMetrics =
    vehicle && pendingReminder
      ? calculateReminderMetrics(vehicle, pendingReminder)
      : null;

  const currentMonthUpper = getMonthNameFromKey(
    monthlySpend.currentMonthKey,
    false
  ).toUpperCase();

  const serviceCountLabel = `${monthlySpend.currentMonthServiceCount} ${
    monthlySpend.currentMonthServiceCount === 1 ? 'service' : 'services'
  } this month`;

  const [isQuickLogOpen, setIsQuickLogOpen] = useState<boolean>(false);
  const [isOdometerModalOpen, setIsOdometerModalOpen] =
    useState<boolean>(false);
  const [odometerInput, setOdometerInput] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleOpenOdometerModal = (): void => {
    if (!vehicle) {
      return;
    }
    setOdometerInput(String(vehicle.current_odometer));
    setValidationError(null);
    setIsOdometerModalOpen(true);
  };

  const handleCloseOdometerModal = (): void => {
    setIsOdometerModalOpen(false);
    setValidationError(null);
  };

  const handleSaveOdometer = (): void => {
    const normalized = odometerInput.replace(/[,\s]/g, '');
    if (!/^\d+$/.test(normalized)) {
      setValidationError('Enter a valid whole-number odometer reading.');
      return;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      setValidationError('Enter a valid non-negative odometer reading.');
      return;
    }

    updateOdometer(parsed);
    setIsOdometerModalOpen(false);
    setValidationError(null);
  };

  const unitLabel = vehicle?.unit ?? 'km';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerEyebrow}>YOUR GARAGE</Text>
            <Text style={styles.headerTitle}>Ready for the road.</Text>
          </View>
          <Pressable
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.bellButton,
              pressed && styles.pressedOpacity,
            ]}
          >
            <Bell color={Colors.textSecondary} size={18} strokeWidth={2} />
          </Pressable>
        </View>

        {vehicle ? (
          <View style={styles.vehicleCard}>
            <View style={styles.vehicleInfo}>
              <View style={styles.vehicleNameRow}>
                <Text numberOfLines={1} style={styles.vehicleName}>
                  {vehicle.name}
                </Text>
                <ChevronDown
                  color={Colors.textSecondary}
                  size={16}
                  strokeWidth={2}
                />
              </View>

              <Pressable
                accessibilityHint="Opens prompt to update current mileage"
                accessibilityLabel={`Current odometer ${formatOdometer(vehicle.current_odometer)} ${vehicle.unit}`}
                accessibilityRole="button"
                hitSlop={6}
                onPress={handleOpenOdometerModal}
                style={({ pressed }) => [
                  styles.odometerButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Text style={styles.odometerValue}>
                  {formatOdometer(vehicle.current_odometer)}
                </Text>
                <Plus color={Colors.textSecondary} size={18} strokeWidth={2} />
              </Pressable>

              <Text numberOfLines={1} style={styles.vehicleMeta}>
                {vehicle.unit}
                {vehicle.subtitle ? `  ·  ${vehicle.subtitle}` : ''}
              </Text>
            </View>

            <Image
              contentFit="cover"
              source={
                vehicle.image_uri ? { uri: vehicle.image_uri } : vwGolfThumbnail
              }
              style={styles.vehicleThumbnail}
            />
          </View>
        ) : null}

        {vehicle && pendingReminder && reminderMetrics ? (
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeaderRow}>
              <View style={styles.reminderHeaderLeft}>
                <TriangleAlert
                  color={Colors.alertAccent}
                  size={15}
                  strokeWidth={2.2}
                />
                <Text style={styles.reminderEyebrow}>NEXT SERVICE DUE</Text>
              </View>

              <Text style={styles.dueSoonText}>
                {reminderMetrics.isOverdue ? 'OVERDUE' : 'DUE SOON'}
              </Text>
            </View>

            <View style={styles.reminderMainRow}>
              <View style={styles.reminderTitleColumn}>
                <Text numberOfLines={1} style={styles.reminderTitle}>
                  {pendingReminder.title}
                </Text>
                <Text style={styles.reminderTargetText}>
                  at {formatOdometer(reminderMetrics.dueOdometer)} {vehicle.unit}
                </Text>
              </View>

              <View style={styles.reminderRemainingColumn}>
                <Text style={styles.reminderRemainingValue}>
                  {formatOdometer(Math.abs(reminderMetrics.remainingDistance))}
                </Text>
                <Text style={styles.reminderRemainingUnit}>
                  {reminderMetrics.isOverdue
                    ? `${vehicle.unit} overdue`
                    : `${vehicle.unit} remaining`}
                </Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: reminderMetrics.progressWidth },
                ]}
              />
            </View>

            <View style={styles.reminderFooterRow}>
              <Text style={styles.reminderIntervalText}>
                {reminderMetrics.progressPercent}% of service interval
              </Text>

              <Pressable
                accessibilityRole="button"
                hitSlop={6}
                onPress={() => router.push('/history')}
                style={({ pressed }) => [
                  styles.viewScheduleButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Text style={styles.viewScheduleText}>View schedule</Text>
                <ArrowRight
                  color={Colors.alertAccent}
                  size={13}
                  strokeWidth={2.2}
                />
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.spendCard}>
          <View style={styles.spendLeftColumn}>
            <Text style={styles.spendEyebrow}>{currentMonthUpper} SPEND</Text>
            <Text style={styles.spendCountText}>{serviceCountLabel}</Text>
          </View>

          <View style={styles.spendRightColumn}>
            <Text style={styles.spendTotalValue}>
              {formatCurrency(monthlySpend.currentMonthTotal)}
            </Text>
            <Text style={styles.spendComparisonText}>
              {formatSpendComparison(
                monthlySpend.difference,
                monthlySpend.previousMonthKey
              )}
            </Text>
          </View>
        </View>

        <View style={styles.historySection}>
          <View style={styles.historyHeaderRow}>
            <Text style={styles.historySectionTitle}>Service history</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => router.push('/history')}
              style={({ pressed }) => [
                styles.viewAllButton,
                pressed && styles.pressedOpacity,
              ]}
            >
              <Text style={styles.viewAllText}>View all</Text>
              <ArrowRight
                color={Colors.textSecondary}
                size={13}
                strokeWidth={2}
              />
            </Pressable>
          </View>

          <View style={styles.timelineList}>
            {serviceLogs.map((log, index) => {
              const isLast = index === serviceLogs.length - 1;

              return (
                <View key={log.id} style={styles.timelineItem}>
                  <View style={styles.timelineRail}>
                    <View style={styles.timelineIconCircle}>
                      <ServiceCategoryIcon category={log.category} />
                    </View>
                    {!isLast ? <View style={styles.timelineConnector} /> : null}
                  </View>

                  <View
                    style={[
                      styles.timelineContent,
                      !isLast && styles.timelineContentSpacing,
                    ]}
                  >
                    <View style={styles.timelineTopRow}>
                      <Text numberOfLines={1} style={styles.timelineTitle}>
                        {log.title}
                      </Text>
                      <Text style={styles.timelinePrice}>
                        {formatCurrency(log.total_cost)}
                      </Text>
                    </View>

                    <Text style={styles.timelineMeta}>
                      {formatServiceDate(log.service_date)}
                      {'  ·  '}
                      {formatOdometer(log.odometer_at_service)} {unitLabel}
                    </Text>

                    {log.receipt_uri ? (
                      <View style={styles.receiptBadge}>
                        <ReceiptText
                          color={Colors.textSecondary}
                          size={12}
                          strokeWidth={2}
                        />
                        <Text style={styles.receiptBadgeText}>Receipt</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <Pressable
        accessibilityLabel="Log service"
        accessibilityRole="button"
        onPress={() => setIsQuickLogOpen(true)}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Plus color={Colors.background} size={20} strokeWidth={2.5} />
        <Text style={styles.fabLabel}>Log service</Text>
      </Pressable>

      <QuickLogServiceModal
        onClose={() => setIsQuickLogOpen(false)}
        onSaveService={(params) => {
          logService(params);
        }}
        vehicle={vehicle}
        visible={isQuickLogOpen}
      />

      <Modal
        animationType="fade"
        onRequestClose={handleCloseOdometerModal}
        transparent
        visible={isOdometerModalOpen}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <Pressable
            accessibilityLabel="Close odometer prompt"
            onPress={handleCloseOdometerModal}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Update odometer</Text>
            {vehicle ? (
              <Text style={styles.modalSubtitle}>
                {vehicle.name} · Current:{' '}
                {formatOdometer(vehicle.current_odometer)} {vehicle.unit}
              </Text>
            ) : null}

            <View style={styles.inputRow}>
              <TextInput
                autoFocus
                keyboardType="number-pad"
                maxLength={9}
                onChangeText={(text) => {
                  setOdometerInput(text);
                  if (validationError) {
                    setValidationError(null);
                  }
                }}
                onSubmitEditing={handleSaveOdometer}
                placeholder="48250"
                placeholderTextColor={Colors.textSecondary}
                returnKeyType="done"
                selectTextOnFocus
                style={styles.odometerInput}
                value={odometerInput}
              />
              <Text style={styles.inputUnit}>{unitLabel}</Text>
            </View>

            {validationError ? (
              <Text style={styles.errorText}>{validationError}</Text>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={handleCloseOdometerModal}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={handleSaveOdometer}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTextGroup: {
    flex: 1,
    paddingRight: 12,
  },
  headerEyebrow: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  vehicleInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  vehicleNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  vehicleName: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  odometerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: 6,
  },
  odometerValue: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  vehicleMeta: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '400',
  },
  vehicleThumbnail: {
    width: 124,
    height: 68,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRecessed,
  },
  reminderCard: {
    marginTop: 16,
    backgroundColor: Colors.alertBackground,
    borderWidth: 1,
    borderColor: Colors.alertBorder,
    borderRadius: 16,
    padding: 16,
  },
  reminderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reminderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  reminderEyebrow: {
    color: Colors.alertAccent,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  dueSoonText: {
    color: Colors.alertAccent,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  reminderMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  reminderTitleColumn: {
    flex: 1,
  },
  reminderTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: '600',
    marginBottom: 4,
  },
  reminderTargetText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  reminderRemainingColumn: {
    alignItems: 'flex-end',
  },
  reminderRemainingValue: {
    color: Colors.alertAccent,
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  reminderRemainingUnit: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.alertBorder,
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.alertAccent,
  },
  reminderFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderIntervalText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  viewScheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewScheduleText: {
    color: Colors.alertAccent,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
  },
  spendCard: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  spendLeftColumn: {
    flex: 1,
  },
  spendEyebrow: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  spendCountText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  spendRightColumn: {
    alignItems: 'flex-end',
  },
  spendTotalValue: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  spendComparisonText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  historySection: {
    marginTop: 24,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  historySectionTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '700',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  timelineList: {
    flexDirection: 'column',
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timelineRail: {
    width: 36,
    alignItems: 'center',
    marginRight: 12,
  },
  timelineIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineConnector: {
    flex: 1,
    width: 1,
    backgroundColor: Colors.border,
    minHeight: 16,
  },
  timelineContent: {
    flex: 1,
    paddingTop: 2,
  },
  timelineContentSpacing: {
    paddingBottom: 20,
  },
  timelineTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timelineTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },
  timelinePrice: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 15,
    fontWeight: '500',
  },
  timelineMeta: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 4,
  },
  receiptBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  receiptBadgeText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '500',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#090B0E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  fabLabel: {
    color: Colors.background,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
  },
  pressedOpacity: {
    opacity: 0.75,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 18, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceRecessed,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 16,
  },
  odometerInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontWeight: '600',
    paddingVertical: 0,
  },
  inputUnit: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 14,
    marginLeft: 8,
  },
  errorText: {
    color: Colors.primary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRecessed,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: Colors.background,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
  },
});
