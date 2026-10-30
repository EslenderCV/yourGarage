import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  ArrowRight,
  Bell,
  ChevronDown,
  Plus,
  TriangleAlert,
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
import { Colors, Fonts } from '@/constants/theme';
import { useGarageData } from '@/hooks/useGarageData';
import type { Reminder, Vehicle } from '@/types/database';

function formatOdometer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
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
  const { vehicle, pendingReminder, updateOdometer } = useGarageData();

  const reminderMetrics =
    vehicle && pendingReminder
      ? calculateReminderMetrics(vehicle, pendingReminder)
      : null;

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
      </ScrollView>

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
              <Text style={styles.inputUnit}>{vehicle?.unit ?? 'km'}</Text>
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
    paddingBottom: 24,
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
