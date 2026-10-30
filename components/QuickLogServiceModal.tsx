import {
  BellRing,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Disc3,
  Droplet,
  Minus,
  Plus,
  ThermometerSnowflake,
  Wrench,
  X,
} from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/theme';
import type { OdometerUnit, ServiceCategory, Vehicle } from '@/types/database';

export interface QuickLogServiceModalProps {
  visible: boolean;
  vehicle: Vehicle | null;
  onClose: () => void;
}

interface CategoryOption {
  key: ServiceCategory;
  label: string;
}

const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  { key: 'oil', label: 'Oil' },
  { key: 'brakes', label: 'Brakes' },
  { key: 'tires', label: 'Tires' },
  { key: 'coolant', label: 'Coolant' },
  { key: 'other', label: 'Other' },
] as const;

const DISTANCE_PRESETS: readonly number[] = [5000, 7500, 10000, 15000] as const;
const MONTH_PRESETS: readonly number[] = [3, 6, 12] as const;

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

const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDateParts(isoDate: string): {
  year: number;
  month: number;
  day: number;
} {
  const parts = isoDate.split('-');
  const year = Number.parseInt(parts[0] ?? '2026', 10);
  const month = Number.parseInt(parts[1] ?? '1', 10);
  const day = Number.parseInt(parts[2] ?? '1', 10);
  return {
    year: Number.isInteger(year) ? year : 2026,
    month:
      Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1,
    day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1,
  };
}

function formatDisplayDate(isoDate: string): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  return `${day} ${MONTH_NAMES_SHORT[month - 1]} ${year}`;
}

function addMonthsToIsoDate(isoDate: string, monthsToAdd: number): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const totalMonths = year * 12 + (month - 1) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12;
  const targetMonth = targetMonthIndex + 1;
  const maxDaysInMonth = new Date(targetYear, targetMonth, 0).getDate();
  const targetDay = Math.min(day, maxDaysInMonth);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(
    targetDay
  ).padStart(2, '0')}`;
}

function formatIntegerWithCommas(digitsOnly: string): string {
  if (!digitsOnly) {
    return '';
  }
  const parsed = Number.parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return parsed.toLocaleString('en-US');
}

function sanitizeCostInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex === -1) {
    return cleaned.slice(0, 7);
  }
  const integerPart = cleaned.slice(0, firstDotIndex).slice(0, 7);
  const decimalPart = cleaned
    .slice(firstDotIndex + 1)
    .replace(/\./g, '')
    .slice(0, 2);
  return `${integerPart}.${decimalPart}`;
}

function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstWeekdayJs = new Date(year, month - 1, 1).getDay();
  const mondayBasedOffset = (firstWeekdayJs + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const slots: (number | null)[] = [];
  for (let i = 0; i < mondayBasedOffset; i += 1) {
    slots.push(null);
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    slots.push(d);
  }
  return slots;
}

function CategoryGlyph({
  category,
  selected,
}: {
  category: ServiceCategory;
  selected: boolean;
}) {
  const color = selected ? Colors.primary : Colors.textSecondary;
  const props = { color, size: 20, strokeWidth: 1.9 } as const;

  switch (category) {
    case 'oil':
      return <Droplet {...props} />;
    case 'brakes':
      return <Disc3 {...props} />;
    case 'tires':
      return <CircleDot {...props} />;
    case 'coolant':
      return <ThermometerSnowflake {...props} />;
    case 'other':
      return <Wrench {...props} />;
  }
}

function buildReminderSummary({
  odometerDigits,
  unit,
  serviceDate,
  isDistanceReminderEnabled,
  distanceInterval,
  isMonthReminderEnabled,
  monthInterval,
}: {
  odometerDigits: string;
  unit: OdometerUnit;
  serviceDate: string;
  isDistanceReminderEnabled: boolean;
  distanceInterval: number;
  isMonthReminderEnabled: boolean;
  monthInterval: number;
}): string {
  const baseOdometer = odometerDigits
    ? Number.parseInt(odometerDigits, 10)
    : 0;
  const targetOdometerLabel = Number.isFinite(baseOdometer)
    ? `${(baseOdometer + distanceInterval).toLocaleString('en-US')} ${unit}`
    : null;
  const targetDateLabel = formatDisplayDate(
    addMonthsToIsoDate(serviceDate, monthInterval)
  );

  if (
    isDistanceReminderEnabled &&
    targetOdometerLabel &&
    isMonthReminderEnabled
  ) {
    return `At ${targetOdometerLabel} or ${targetDateLabel}, whichever comes first.`;
  }
  if (isDistanceReminderEnabled && targetOdometerLabel) {
    return `At ${targetOdometerLabel}.`;
  }
  if (isMonthReminderEnabled) {
    return `On ${targetDateLabel}.`;
  }
  return 'No reminder scheduled for this service.';
}

export function QuickLogServiceModal({
  visible,
  vehicle,
  onClose,
}: QuickLogServiceModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const categoryPillWidth = Math.max(
    74,
    Math.floor((windowWidth - 40 - 10 * 3) / 4)
  );
  const odometerInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const costInputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const unitLabel: OdometerUnit = vehicle?.unit ?? 'km';
  const defaultOdometerDigits = String(vehicle?.current_odometer ?? 48250);

  const [selectedCategory, setSelectedCategory] =
    useState<ServiceCategory>('oil');
  const [serviceDate, setServiceDate] = useState<string>(() =>
    getTodayIsoDate()
  );
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);
  const [calendarMonthCursor, setCalendarMonthCursor] = useState<{
    year: number;
    month: number;
  }>(() => {
    const { year, month } = parseIsoDateParts(getTodayIsoDate());
    return { year, month };
  });

  const [odometerDigits, setOdometerDigits] = useState<string>(
    defaultOdometerDigits
  );
  const [focusedField, setFocusedField] = useState<
    'odometer' | 'cost' | 'shop' | 'notes' | null
  >(null);
  const [costInput, setCostInput] = useState<string>('');

  const [isNotesExpanded, setIsNotesExpanded] = useState<boolean>(false);
  const [shopName, setShopName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isReceiptAttached, setIsReceiptAttached] = useState<boolean>(true);

  const [isDistanceReminderEnabled, setIsDistanceReminderEnabled] =
    useState<boolean>(true);
  const [distanceInterval, setDistanceInterval] = useState<number>(5000);
  const [isMonthReminderEnabled, setIsMonthReminderEnabled] =
    useState<boolean>(true);
  const [monthInterval, setMonthInterval] = useState<number>(6);
  const [isIntervalPickerOpen, setIsIntervalPickerOpen] =
    useState<boolean>(false);

  const handleModalShow = (): void => {
    const freshOdometer = String(vehicle?.current_odometer ?? 48250);
    setOdometerDigits(freshOdometer);
    setFocusedField(null);
    setIsDatePickerOpen(false);
    setIsIntervalPickerOpen(false);
  };

  const handleToggleDatePicker = (): void => {
    if (!isDatePickerOpen) {
      const { year, month } = parseIsoDateParts(serviceDate);
      setCalendarMonthCursor({ year, month });
    }
    setIsDatePickerOpen((prev) => !prev);
  };

  const handleStepCalendarMonth = (delta: -1 | 1): void => {
    setCalendarMonthCursor((prev) => {
      const nextTotal = prev.year * 12 + (prev.month - 1) + delta;
      return {
        year: Math.floor(nextTotal / 12),
        month: (((nextTotal % 12) + 12) % 12) + 1,
      };
    });
  };

  const handleSelectCalendarDay = (day: number): void => {
    const nextIso = `${calendarMonthCursor.year}-${String(
      calendarMonthCursor.month
    ).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setServiceDate(nextIso);
    setIsDatePickerOpen(false);
  };

  const handleSelectToday = (): void => {
    const todayIso = getTodayIsoDate();
    const { year, month } = parseIsoDateParts(todayIso);
    setServiceDate(todayIso);
    setCalendarMonthCursor({ year, month });
    setIsDatePickerOpen(false);
  };

  const selectedDateParts = parseIsoDateParts(serviceDate);
  const calendarSlots = buildCalendarDays(
    calendarMonthCursor.year,
    calendarMonthCursor.month
  );

  const reminderSummary = buildReminderSummary({
    odometerDigits,
    unit: unitLabel,
    serviceDate,
    isDistanceReminderEnabled,
    distanceInterval,
    isMonthReminderEnabled,
    monthInterval,
  });

  const receiptSubtitle = isReceiptAttached
    ? shopName.trim()
      ? `${shopName.trim()} · 1 photo · Tap to replace`
      : '1 photo · Tap to replace'
    : 'Take a photo or choose from library';

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={handleModalShow}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable
          accessibilityLabel="Close quick log modal"
          onPress={onClose}
          style={styles.backdropDismissArea}
        />

        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <View style={styles.grabberRow}>
            <View style={styles.grabberHandle} />
          </View>

          <ScrollView
            bounces={false}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerTopRow}>
              <Text style={styles.sheetTitle}>Quick log service</Text>
              <Pressable
                accessibilityLabel="Close"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <X color={Colors.textSecondary} size={16} strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={styles.headerMetaRow}>
              <Text numberOfLines={1} style={styles.vehicleSubtitle}>
                {vehicle?.name ?? '2021 VW Golf'}
              </Text>

              <Pressable
                accessibilityLabel={`Service date ${formatDisplayDate(serviceDate)}`}
                accessibilityRole="button"
                hitSlop={6}
                onPress={handleToggleDatePicker}
                style={({ pressed }) => [
                  styles.datePillButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Calendar
                  color={Colors.textSecondary}
                  size={14}
                  strokeWidth={2}
                />
                <Text style={styles.datePillText}>
                  {formatDisplayDate(serviceDate)}
                </Text>
                <ChevronDown
                  color={Colors.textSecondary}
                  size={14}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            {isDatePickerOpen ? (
              <View style={styles.calendarCard}>
                <View style={styles.calendarHeader}>
                  <Pressable
                    accessibilityLabel="Previous month"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => handleStepCalendarMonth(-1)}
                    style={styles.calendarNavButton}
                  >
                    <ChevronLeft
                      color={Colors.textPrimary}
                      size={16}
                      strokeWidth={2}
                    />
                  </Pressable>

                  <View style={styles.calendarMonthGroup}>
                    <Text style={styles.calendarMonthTitle}>
                      {MONTH_NAMES_FULL[calendarMonthCursor.month - 1]}{' '}
                      {calendarMonthCursor.year}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={handleSelectToday}
                      style={styles.todayChip}
                    >
                      <Text style={styles.todayChipText}>Today</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    accessibilityLabel="Next month"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => handleStepCalendarMonth(1)}
                    style={styles.calendarNavButton}
                  >
                    <ChevronRight
                      color={Colors.textPrimary}
                      size={16}
                      strokeWidth={2}
                    />
                  </Pressable>
                </View>

                <View style={styles.calendarWeekRow}>
                  {WEEKDAY_LABELS.map((weekday) => (
                    <Text key={weekday} style={styles.calendarWeekdayText}>
                      {weekday}
                    </Text>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {calendarSlots.map((day, idx) => {
                    if (day === null) {
                      return (
                        <View
                          key={`empty-${idx}`}
                          style={styles.calendarDayCell}
                        />
                      );
                    }

                    const isSelectedDay =
                      selectedDateParts.year === calendarMonthCursor.year &&
                      selectedDateParts.month === calendarMonthCursor.month &&
                      selectedDateParts.day === day;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelectedDay }}
                        key={`day-${day}`}
                        onPress={() => handleSelectCalendarDay(day)}
                        style={[
                          styles.calendarDayCell,
                          isSelectedDay && styles.calendarDayCellSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            isSelectedDay && styles.calendarDayTextSelected,
                          ]}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>WHAT WAS DONE?</Text>

            <ScrollView
              contentContainerStyle={styles.categoryRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {CATEGORY_OPTIONS.map((option) => {
                const isSelected = selectedCategory === option.key;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={option.key}
                    onPress={() => setSelectedCategory(option.key)}
                    style={({ pressed }) => [
                      styles.categoryPill,
                      { width: categoryPillWidth },
                      isSelected
                        ? styles.categoryPillSelected
                        : styles.categoryPillUnselected,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <CategoryGlyph
                      category={option.key}
                      selected={isSelected}
                    />
                    <Text
                      style={[
                        styles.categoryPillLabel,
                        isSelected
                          ? styles.categoryPillLabelSelected
                          : styles.categoryPillLabelUnselected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.metricsRow}>
              <Pressable
                accessibilityRole="none"
                onPress={() => odometerInputRef.current?.focus()}
                style={[
                  styles.metricBox,
                  focusedField === 'odometer' && styles.metricBoxFocused,
                ]}
              >
                <Text style={styles.metricLabel}>ODOMETER</Text>
                <TextInput
                  keyboardType="number-pad"
                  maxLength={9}
                  onBlur={() =>
                    setFocusedField((curr) =>
                      curr === 'odometer' ? null : curr
                    )
                  }
                  onChangeText={(text) => {
                    const digits = text.replace(/\D/g, '').slice(0, 7);
                    setOdometerDigits(digits);
                  }}
                  onFocus={() => setFocusedField('odometer')}
                  placeholder="0"
                  placeholderTextColor="rgba(150, 157, 170, 0.5)"
                  ref={odometerInputRef}
                  returnKeyType="next"
                  onSubmitEditing={() => costInputRef.current?.focus()}
                  style={styles.metricValueInput}
                  value={formatIntegerWithCommas(odometerDigits)}
                />
                <Text style={styles.metricSubLabel}>{unitLabel}</Text>
              </Pressable>

              <Pressable
                accessibilityRole="none"
                onPress={() => costInputRef.current?.focus()}
                style={[
                  styles.metricBox,
                  focusedField === 'cost' && styles.metricBoxFocused,
                ]}
              >
                <Text style={styles.metricLabel}>TOTAL COST</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  maxLength={10}
                  onBlur={() =>
                    setFocusedField((curr) => (curr === 'cost' ? null : curr))
                  }
                  onChangeText={(text) => setCostInput(sanitizeCostInput(text))}
                  onFocus={() => setFocusedField('cost')}
                  placeholder="0.00"
                  placeholderTextColor="rgba(150, 157, 170, 0.5)"
                  ref={costInputRef}
                  returnKeyType="done"
                  style={styles.metricValueInput}
                  value={costInput}
                />
                <Text style={styles.metricSubLabel}>USD $</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => setIsNotesExpanded((prev) => !prev)}
              style={({ pressed }) => [
                styles.notesToggleRow,
                pressed && styles.pressedOpacity,
              ]}
            >
              {isNotesExpanded ? (
                <Minus
                  color={Colors.textSecondary}
                  size={14}
                  strokeWidth={2.2}
                />
              ) : (
                <Plus
                  color={Colors.textSecondary}
                  size={14}
                  strokeWidth={2.2}
                />
              )}
              <Text style={styles.notesToggleText}>
                {isNotesExpanded
                  ? 'Hide notes or shop name'
                  : shopName.trim() || notes.trim()
                    ? `Notes added${shopName.trim() ? ` · ${shopName.trim()}` : ''}`
                    : 'Add notes or shop name'}
              </Text>
            </Pressable>

            {isNotesExpanded ? (
              <View style={styles.notesExpandedContainer}>
                <TextInput
                  maxLength={80}
                  onBlur={() =>
                    setFocusedField((curr) => (curr === 'shop' ? null : curr))
                  }
                  onChangeText={setShopName}
                  onFocus={() => setFocusedField('shop')}
                  placeholder="Shop or mechanic (e.g. Northside Auto)"
                  placeholderTextColor="rgba(150, 157, 170, 0.55)"
                  returnKeyType="next"
                  style={[
                    styles.notesInput,
                    focusedField === 'shop' && styles.metricBoxFocused,
                  ]}
                  value={shopName}
                />
                <TextInput
                  maxLength={400}
                  multiline
                  numberOfLines={3}
                  onBlur={() =>
                    setFocusedField((curr) => (curr === 'notes' ? null : curr))
                  }
                  onChangeText={setNotes}
                  onFocus={() => setFocusedField('notes')}
                  placeholder="Parts used, oil grade, or inspection notes..."
                  placeholderTextColor="rgba(150, 157, 170, 0.55)"
                  style={[
                    styles.notesInput,
                    styles.notesMultilineInput,
                    focusedField === 'notes' && styles.metricBoxFocused,
                  ]}
                  textAlignVertical="top"
                  value={notes}
                />
              </View>
            ) : null}

            <Pressable
              accessibilityLabel={
                isReceiptAttached
                  ? 'Receipt photo attached, tap to replace'
                  : 'Attach receipt photo'
              }
              accessibilityRole="button"
              onPress={() => setIsReceiptAttached((prev) => !prev)}
              style={({ pressed }) => [
                styles.receiptBox,
                pressed && styles.pressedOpacity,
              ]}
            >
              <View style={styles.receiptIconSquare}>
                <Camera
                  color={Colors.textPrimary}
                  size={20}
                  strokeWidth={1.9}
                />
              </View>

              <View style={styles.receiptTextColumn}>
                <Text style={styles.receiptTitle}>
                  {isReceiptAttached
                    ? 'Receipt photo attached'
                    : 'Attach receipt photo'}
                </Text>
                <Text numberOfLines={1} style={styles.receiptSubtitle}>
                  {receiptSubtitle}
                </Text>
              </View>

              {isReceiptAttached ? (
                <View style={styles.receiptCheckCircle}>
                  <Check color={Colors.primary} size={12} strokeWidth={2.8} />
                </View>
              ) : (
                <View style={styles.receiptAddCircle}>
                  <Plus
                    color={Colors.textSecondary}
                    size={12}
                    strokeWidth={2.2}
                  />
                </View>
              )}
            </Pressable>

            <View style={styles.reminderHeaderRow}>
              <Text style={styles.reminderSectionLabel}>
                REMIND ME AGAIN IN
              </Text>
              <BellRing
                color={Colors.textSecondary}
                size={15}
                strokeWidth={1.9}
              />
            </View>

            <View style={styles.reminderChipsRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isDistanceReminderEnabled }}
                onPress={() =>
                  setIsDistanceReminderEnabled((prev) => !prev)
                }
                style={({ pressed }) => [
                  styles.reminderChip,
                  isDistanceReminderEnabled
                    ? styles.reminderChipActive
                    : styles.reminderChipInactive,
                  pressed && styles.pressedOpacity,
                ]}
              >
                {isDistanceReminderEnabled ? (
                  <Check color={Colors.primary} size={13} strokeWidth={2.5} />
                ) : null}
                <Text
                  style={[
                    styles.reminderChipText,
                    isDistanceReminderEnabled
                      ? styles.reminderChipTextActive
                      : styles.reminderChipTextInactive,
                  ]}
                >
                  +{distanceInterval.toLocaleString('en-US')} {unitLabel}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isMonthReminderEnabled }}
                onPress={() => setIsMonthReminderEnabled((prev) => !prev)}
                style={({ pressed }) => [
                  styles.reminderChip,
                  isMonthReminderEnabled
                    ? styles.reminderChipActive
                    : styles.reminderChipInactive,
                  pressed && styles.pressedOpacity,
                ]}
              >
                {isMonthReminderEnabled ? (
                  <Check color={Colors.primary} size={13} strokeWidth={2.5} />
                ) : null}
                <Text
                  style={[
                    styles.reminderChipText,
                    isMonthReminderEnabled
                      ? styles.reminderChipTextActive
                      : styles.reminderChipTextInactive,
                  ]}
                >
                  {monthInterval} {monthInterval === 1 ? 'month' : 'months'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel="Customize reminder intervals"
                accessibilityRole="button"
                onPress={() => setIsIntervalPickerOpen((prev) => !prev)}
                style={({ pressed }) => [
                  styles.reminderPlusButton,
                  isIntervalPickerOpen && styles.reminderPlusButtonActive,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Plus
                  color={
                    isIntervalPickerOpen ? Colors.primary : Colors.textSecondary
                  }
                  size={16}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            {isIntervalPickerOpen ? (
              <View style={styles.intervalPickerCard}>
                <Text style={styles.intervalPickerGroupLabel}>
                  Distance interval
                </Text>
                <View style={styles.intervalOptionsRow}>
                  {DISTANCE_PRESETS.map((preset) => {
                    const active =
                      isDistanceReminderEnabled && distanceInterval === preset;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={preset}
                        onPress={() => {
                          setDistanceInterval(preset);
                          setIsDistanceReminderEnabled(true);
                        }}
                        style={[
                          styles.intervalOptionPill,
                          active && styles.intervalOptionPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.intervalOptionText,
                            active && styles.intervalOptionTextActive,
                          ]}
                        >
                          +{preset.toLocaleString('en-US')} {unitLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text
                  style={[styles.intervalPickerGroupLabel, { marginTop: 10 }]}
                >
                  Time interval
                </Text>
                <View style={styles.intervalOptionsRow}>
                  {MONTH_PRESETS.map((months) => {
                    const active =
                      isMonthReminderEnabled && monthInterval === months;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={months}
                        onPress={() => {
                          setMonthInterval(months);
                          setIsMonthReminderEnabled(true);
                        }}
                        style={[
                          styles.intervalOptionPill,
                          active && styles.intervalOptionPillActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.intervalOptionText,
                            active && styles.intervalOptionTextActive,
                          ]}
                        >
                          {months} months
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Text style={styles.reminderSummaryText}>{reminderSummary}</Text>

            <Pressable
              accessibilityLabel="Save service"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.saveCtaButton,
                pressed && styles.saveCtaPressed,
              ]}
            >
              <Check color={Colors.background} size={18} strokeWidth={2.5} />
              <Text style={styles.saveCtaText}>Save service</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: '92%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  grabberRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  grabberHandle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#646D7C',
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  vehicleSubtitle: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  datePillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  datePillText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  calendarCard: {
    marginTop: 12,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 12,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarNavButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarMonthTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  todayChip: {
    backgroundColor: Colors.alertBackground,
    borderWidth: 1,
    borderColor: Colors.alertHighlight,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todayChipText: {
    color: Colors.primary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '600',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarWeekdayText: {
    width: '14.2857%',
    textAlign: 'center',
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayCell: {
    width: '14.2857%',
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calendarDayCellSelected: {
    backgroundColor: Colors.primary,
  },
  calendarDayText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  calendarDayTextSelected: {
    color: Colors.background,
    fontWeight: '700',
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 10,
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 4,
  },
  categoryPill: {
    width: 84,
    height: 70,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  categoryPillSelected: {
    backgroundColor: Colors.alertBackground,
    borderColor: Colors.primary,
  },
  categoryPillUnselected: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.border,
  },
  categoryPillLabel: {
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  categoryPillLabelSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  categoryPillLabelUnselected: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  metricsRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#14171E',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 16,
  },
  metricBoxFocused: {
    borderColor: Colors.primary,
  },
  metricLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  metricValueInput: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: -0.5,
    paddingVertical: 0,
    paddingHorizontal: 0,
    includeFontPadding: false,
    marginBottom: 10,
  },
  metricSubLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '400',
  },
  notesToggleRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
  },
  notesToggleText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  notesExpandedContainer: {
    marginTop: 10,
    gap: 10,
  },
  notesInput: {
    backgroundColor: '#14171E',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  notesMultilineInput: {
    minHeight: 74,
  },
  receiptBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#4B5362',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  receiptIconSquare: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.cardSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptTextColumn: {
    flex: 1,
  },
  receiptTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  receiptSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '400',
  },
  receiptCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.75,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptAddCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderHeaderRow: {
    marginTop: 20,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderSectionLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  reminderChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  reminderChip: {
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reminderChipActive: {
    backgroundColor: Colors.alertBackground,
    borderColor: Colors.alertHighlight,
  },
  reminderChipInactive: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.border,
  },
  reminderChipText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
  },
  reminderChipTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  reminderChipTextInactive: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  reminderPlusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderPlusButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.alertBackground,
  },
  intervalPickerCard: {
    marginTop: 10,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 12,
  },
  intervalPickerGroupLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  intervalOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  intervalOptionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  intervalOptionPillActive: {
    backgroundColor: Colors.alertBackground,
    borderColor: Colors.primary,
  },
  intervalOptionText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '500',
  },
  intervalOptionTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  reminderSummaryText: {
    marginTop: 10,
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '400',
  },
  saveCtaButton: {
    marginTop: 20,
    height: 54,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveCtaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  saveCtaText: {
    color: Colors.background,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
  },
  pressedOpacity: {
    opacity: 0.75,
  },
});
