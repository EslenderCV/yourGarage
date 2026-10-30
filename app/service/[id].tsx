import { Image, type ImageSource } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Disc3,
  Droplet,
  Ellipsis,
  Maximize2,
  ReceiptText,
  Share2,
  ThermometerSnowflake,
  Trash2,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import receiptNorthsideAuto from '@/assets/images/receipt-northside-auto.png';
import { Colors, Fonts } from '@/constants/theme';
import {
  deleteServiceLog,
  getReminderForServiceLog,
  getServiceLogById,
  getVehicleById,
} from '@/db/repository';
import { notifyGarageDataChanged } from '@/hooks/useGarageData';
import type { OdometerUnit, Reminder, ServiceCategory } from '@/types/database';
import { shareReceiptImageAsync } from '@/utils/receiptStorage';

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

const INLINE_ZOOM_STEPS = [1, 1.5, 2] as const;
const LIGHTBOX_ZOOM_STEPS = [1, 1.5, 2, 2.5, 3] as const;

function formatOdometer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
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
  const dayFormatted = String(dayNumber).padStart(2, '0');
  return `${dayFormatted} ${MONTH_NAMES_SHORT[monthNumber - 1]} ${year}`;
}

function splitMechanicNotes(rawNotes: string | null): {
  body: string | null;
  attribution: string | null;
} {
  if (!rawNotes || !rawNotes.trim()) {
    return { body: null, attribution: null };
  }

  const lines = rawNotes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { body: null, attribution: null };
  }

  const lastLine = lines[lines.length - 1];
  if (lines.length > 1 && lastLine && /^serviced by\b/i.test(lastLine)) {
    return {
      body: lines.slice(0, -1).join('\n'),
      attribution: lastLine,
    };
  }

  return {
    body: lines.join('\n'),
    attribution: null,
  };
}

function getReminderHeading(category: ServiceCategory): string {
  switch (category) {
    case 'oil':
      return 'Next oil change reminder';
    case 'tires':
      return 'Next tire rotation reminder';
    case 'brakes':
      return 'Next brake inspection reminder';
    case 'coolant':
      return 'Next coolant flush reminder';
    case 'other':
      return 'Next maintenance reminder';
  }
}

function formatReminderTarget(reminder: Reminder, unit: OdometerUnit): string {
  const distancePart =
    reminder.due_odometer !== null
      ? `${formatOdometer(reminder.due_odometer)} ${unit}`
      : null;
  const datePart = reminder.due_date
    ? formatServiceDate(reminder.due_date)
    : null;

  if (distancePart && datePart) {
    return `${distancePart}  /  ${datePart}`;
  }
  if (distancePart) {
    return distancePart;
  }
  if (datePart) {
    return datePart;
  }
  return '';
}

function resolveReceiptSource(receiptUri: string): ImageSource | number {
  if (receiptUri.startsWith('seed://')) {
    return receiptNorthsideAuto;
  }
  return { uri: receiptUri };
}

function ServiceHeroIcon({ category }: { category: ServiceCategory }) {
  const iconProps = {
    color: Colors.primary,
    size: 22,
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

export default function ServiceDetailScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string | string[] }>();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const parsedId = rawId ? Number.parseInt(rawId, 10) : Number.NaN;
  const isValidId = Number.isInteger(parsedId) && parsedId > 0;

  const serviceLog = isValidId ? getServiceLogById(parsedId) : null;
  const vehicle = serviceLog ? getVehicleById(serviceLog.vehicle_id) : null;
  const reminder = serviceLog ? getReminderForServiceLog(serviceLog.id) : null;

  const [inlineZoomIndex, setInlineZoomIndex] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [lightboxZoomIndex, setLightboxZoomIndex] = useState<number>(0);

  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState<boolean>(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const handleGoBack = (): void => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  if (!serviceLog) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleGoBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressedOpacity,
            ]}
          >
            <ChevronLeft
              color={Colors.textPrimary}
              size={20}
              strokeWidth={2.1}
            />
            <Text style={styles.backButtonText}>History</Text>
          </Pressable>
          <Text style={styles.topBarTitle}>Service detail</Text>
          <View style={styles.topBarRightSpacer} />
        </View>

        <View style={styles.notFoundContainer}>
          <Text style={styles.notFoundTitle}>Service entry not found</Text>
          <Text style={styles.notFoundSubtitle}>
            This service record may have been deleted.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleGoBack}
            style={({ pressed }) => [
              styles.notFoundButton,
              pressed && styles.pressedOpacity,
            ]}
          >
            <Text style={styles.notFoundButtonText}>Return to Garage</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const unitLabel: OdometerUnit = vehicle?.unit ?? 'km';
  const { body: notesBody, attribution: notesAttribution } = splitMechanicNotes(
    serviceLog.notes
  );
  const hasReminderTarget =
    reminder !== null &&
    (reminder.due_odometer !== null || reminder.due_date !== null);
  const receiptUri = serviceLog.receipt_uri;
  const inlineScale = INLINE_ZOOM_STEPS[inlineZoomIndex] ?? 1;
  const lightboxScale = LIGHTBOX_ZOOM_STEPS[lightboxZoomIndex] ?? 1;

  const handleCycleInlineZoom = (): void => {
    setInlineZoomIndex((prev) => (prev + 1) % INLINE_ZOOM_STEPS.length);
  };

  const handleOpenLightbox = (): void => {
    setLightboxZoomIndex(0);
    setIsLightboxOpen(true);
  };

  const handleExportReceipt = async (): Promise<void> => {
    if (!receiptUri || isExporting) {
      return;
    }

    setIsExporting(true);
    setExportFeedback(null);

    try {
      const outcome = await shareReceiptImageAsync(
        receiptUri,
        receiptNorthsideAuto
      );
      if (!outcome.shared && outcome.message) {
        setExportFeedback(outcome.message);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to export receipt image.';
      setExportFeedback(message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenDeletePrompt = (): void => {
    setIsConfirmingDelete(true);
    setIsOptionsMenuOpen(true);
  };

  const handleConfirmDelete = (): void => {
    deleteServiceLog(serviceLog.id);
    notifyGarageDataChanged();
    setIsOptionsMenuOpen(false);
    setIsConfirmingDelete(false);
    handleGoBack();
  };

  const lightboxBaseWidth = Math.max(280, windowWidth - 32);
  const lightboxBaseHeight = Math.max(
    320,
    Math.min(windowHeight * 0.72, lightboxBaseWidth * 1.15)
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topBarSideLeft}>
          <Pressable
            accessibilityLabel="Back to History"
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleGoBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressedOpacity,
            ]}
          >
            <ChevronLeft
              color={Colors.textPrimary}
              size={20}
              strokeWidth={2.1}
            />
            <Text style={styles.backButtonText}>History</Text>
          </Pressable>
        </View>

        <Text numberOfLines={1} style={styles.topBarTitle}>
          Service detail
        </Text>

        <View style={styles.topBarSideRight}>
          <Pressable
            accessibilityLabel="Service options"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              setIsConfirmingDelete(false);
              setIsOptionsMenuOpen(true);
            }}
            style={({ pressed }) => [
              styles.optionsButton,
              pressed && styles.pressedOpacity,
            ]}
          >
            <Ellipsis color={Colors.textPrimary} size={20} strokeWidth={2.1} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <View style={styles.heroRow}>
          <View style={styles.heroIconBox}>
            <ServiceHeroIcon category={serviceLog.category} />
          </View>

          <View style={styles.heroTextColumn}>
            <Text style={styles.heroTitle}>{serviceLog.title}</Text>
            <Text numberOfLines={1} style={styles.heroSubtitle}>
              {formatServiceDate(serviceLog.service_date)}
              {vehicle ? `  ·  ${vehicle.name}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.metricsCard}>
          <View style={styles.metricColumnLeft}>
            <Text style={styles.metricEyebrow}>ODOMETER</Text>
            <View style={styles.odometerValueRow}>
              <Text style={styles.metricMonoValue}>
                {formatOdometer(serviceLog.odometer_at_service)}
              </Text>
              <Text style={styles.metricUnitText}>{unitLabel}</Text>
            </View>
          </View>

          <View style={styles.metricsDivider} />

          <View style={styles.metricColumnRight}>
            <Text style={styles.metricEyebrow}>TOTAL COST</Text>
            <Text style={styles.metricMonoValue}>
              {formatCurrency(serviceLog.total_cost)}
            </Text>
          </View>
        </View>

        <View style={styles.notesSection}>
          <View style={styles.notesHeaderRow}>
            <Text style={styles.sectionEyebrow}>MECHANIC NOTES</Text>
            {serviceLog.shop_name ? (
              <Text numberOfLines={1} style={styles.shopNameText}>
                {serviceLog.shop_name}
              </Text>
            ) : null}
          </View>

          {notesBody ? (
            <>
              <Text style={styles.notesBodyText}>{notesBody}</Text>
              {notesAttribution ? (
                <Text style={styles.notesAttributionText}>
                  {notesAttribution}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.notesEmptyText}>
              No mechanic notes recorded for this service.
            </Text>
          )}
        </View>

        {reminder && hasReminderTarget ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/history')}
            style={({ pressed }) => [
              styles.reminderCard,
              pressed && styles.pressedOpacity,
            ]}
          >
            <BellRing color={Colors.primary} size={19} strokeWidth={2} />

            <View style={styles.reminderTextColumn}>
              <Text numberOfLines={1} style={styles.reminderCardTitle}>
                {getReminderHeading(reminder.category)}
              </Text>
              <Text numberOfLines={1} style={styles.reminderCardTarget}>
                {formatReminderTarget(reminder, unitLabel)}
              </Text>
            </View>

            <ChevronRight
              color={Colors.textSecondary}
              size={17}
              strokeWidth={2}
            />
          </Pressable>
        ) : null}

        <View style={styles.receiptSection}>
          <View style={styles.receiptHeaderRow}>
            <Text style={styles.receiptSectionTitle}>Receipt</Text>

            {receiptUri ? (
              <Pressable
                accessibilityLabel="Export receipt"
                accessibilityRole="button"
                disabled={isExporting}
                hitSlop={8}
                onPress={() => {
                  void handleExportReceipt();
                }}
                style={({ pressed }) => [
                  styles.exportButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                {isExporting ? (
                  <ActivityIndicator
                    color={Colors.textSecondary}
                    size="small"
                  />
                ) : (
                  <Share2
                    color={Colors.textSecondary}
                    size={15}
                    strokeWidth={2}
                  />
                )}
                <Text style={styles.exportButtonText}>Export</Text>
              </Pressable>
            ) : null}
          </View>

          {exportFeedback ? (
            <Text style={styles.exportFeedbackText}>{exportFeedback}</Text>
          ) : null}

          {receiptUri ? (
            <View style={styles.receiptCard}>
              <Pressable
                accessibilityHint="Opens fullscreen zoomable receipt viewer"
                accessibilityLabel="Receipt image preview"
                accessibilityRole="imagebutton"
                onPress={handleOpenLightbox}
                style={styles.receiptImageViewport}
              >
                <Image
                  contentFit="cover"
                  source={resolveReceiptSource(receiptUri)}
                  style={[
                    styles.receiptImage,
                    inlineScale > 1 && {
                      transform: [{ scale: inlineScale }],
                    },
                  ]}
                />
              </Pressable>

              <View style={styles.receiptOverlayPill}>
                <Pressable
                  accessibilityLabel={`Zoom receipt preview, currently ${Math.round(inlineScale * 100)}%`}
                  accessibilityRole="button"
                  hitSlop={4}
                  onPress={handleCycleInlineZoom}
                  style={({ pressed }) => [
                    styles.receiptOverlayZoomBtn,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <ZoomIn
                    color={Colors.textPrimary}
                    size={15}
                    strokeWidth={2.1}
                  />
                  <Text style={styles.receiptOverlayZoomText}>
                    {Math.round(inlineScale * 100)}%
                  </Text>
                </Pressable>

                <View style={styles.receiptOverlayDivider} />

                <Pressable
                  accessibilityLabel="Open receipt in fullscreen lightbox"
                  accessibilityRole="button"
                  hitSlop={4}
                  onPress={handleOpenLightbox}
                  style={({ pressed }) => [
                    styles.receiptOverlayExpandBtn,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <Maximize2
                    color={Colors.textPrimary}
                    size={14}
                    strokeWidth={2.1}
                  />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.emptyReceiptBox}>
              <ReceiptText
                color={Colors.textSecondary}
                size={22}
                strokeWidth={1.8}
              />
              <Text style={styles.emptyReceiptText}>
                No receipt photo attached to this service.
              </Text>
            </View>
          )}
        </View>

        <Pressable
          accessibilityLabel="Delete service log"
          accessibilityRole="button"
          onPress={handleOpenDeletePrompt}
          style={({ pressed }) => [
            styles.bottomDeleteButton,
            pressed && styles.pressedOpacity,
          ]}
        >
          <Trash2 color="#EF4444" size={16} strokeWidth={2} />
          <Text style={styles.bottomDeleteText}>Delete service entry</Text>
        </Pressable>
      </ScrollView>

      {receiptUri ? (
        <Modal
          animationType="fade"
          navigationBarTranslucent
          onRequestClose={() => setIsLightboxOpen(false)}
          statusBarTranslucent
          transparent
          visible={isLightboxOpen}
        >
          <View style={styles.lightboxScreen}>
            <View
              style={[styles.lightboxTopBar, { paddingTop: insets.top + 12 }]}
            >
              <View style={styles.lightboxTitleGroup}>
                <Text numberOfLines={1} style={styles.lightboxTitle}>
                  {serviceLog.shop_name
                    ? `Receipt · ${serviceLog.shop_name}`
                    : 'Receipt'}
                </Text>
                <Text style={styles.lightboxSubtitle}>
                  {formatServiceDate(serviceLog.service_date)} ·{' '}
                  {formatCurrency(serviceLog.total_cost)}
                </Text>
              </View>

              <View style={styles.lightboxActionsRight}>
                <Pressable
                  accessibilityLabel="Export receipt"
                  accessibilityRole="button"
                  disabled={isExporting}
                  onPress={() => {
                    void handleExportReceipt();
                  }}
                  style={({ pressed }) => [
                    styles.lightboxActionCircle,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <Share2
                    color={Colors.textPrimary}
                    size={17}
                    strokeWidth={2}
                  />
                </Pressable>

                <Pressable
                  accessibilityLabel="Close receipt viewer"
                  accessibilityRole="button"
                  onPress={() => setIsLightboxOpen(false)}
                  style={({ pressed }) => [
                    styles.lightboxActionCircle,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <X color={Colors.textPrimary} size={18} strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              centerContent
              contentContainerStyle={styles.lightboxOuterScroll}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.scrollView}
            >
              <ScrollView
                centerContent
                contentContainerStyle={styles.lightboxInnerScroll}
                showsVerticalScrollIndicator={false}
                style={styles.lightboxInnerScrollView}
              >
                <Image
                  contentFit="contain"
                  source={resolveReceiptSource(receiptUri)}
                  style={{
                    width: lightboxBaseWidth * lightboxScale,
                    height: lightboxBaseHeight * lightboxScale,
                  }}
                />
              </ScrollView>
            </ScrollView>

            <View
              style={[
                styles.lightboxBottomBar,
                { paddingBottom: Math.max(insets.bottom, 16) + 8 },
              ]}
            >
              <View style={styles.lightboxControlsPill}>
                <Pressable
                  accessibilityLabel="Zoom out"
                  accessibilityRole="button"
                  disabled={lightboxZoomIndex === 0}
                  onPress={() =>
                    setLightboxZoomIndex((idx) => Math.max(0, idx - 1))
                  }
                  style={({ pressed }) => [
                    styles.lightboxZoomStepBtn,
                    lightboxZoomIndex === 0 && styles.disabledControl,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <ZoomOut
                    color={Colors.textPrimary}
                    size={17}
                    strokeWidth={2}
                  />
                </Pressable>

                <Pressable
                  accessibilityLabel="Reset zoom to 100%"
                  accessibilityRole="button"
                  onPress={() => setLightboxZoomIndex(0)}
                  style={styles.lightboxZoomReadoutBtn}
                >
                  <Text style={styles.lightboxZoomReadoutText}>
                    {Math.round(lightboxScale * 100)}%
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityLabel="Zoom in"
                  accessibilityRole="button"
                  disabled={lightboxZoomIndex === LIGHTBOX_ZOOM_STEPS.length - 1}
                  onPress={() =>
                    setLightboxZoomIndex((idx) =>
                      Math.min(LIGHTBOX_ZOOM_STEPS.length - 1, idx + 1)
                    )
                  }
                  style={({ pressed }) => [
                    styles.lightboxZoomStepBtn,
                    lightboxZoomIndex === LIGHTBOX_ZOOM_STEPS.length - 1 &&
                      styles.disabledControl,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <ZoomIn
                    color={Colors.textPrimary}
                    size={17}
                    strokeWidth={2}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      <Modal
        animationType="fade"
        navigationBarTranslucent
        onRequestClose={() => {
          setIsOptionsMenuOpen(false);
          setIsConfirmingDelete(false);
        }}
        statusBarTranslucent
        transparent
        visible={isOptionsMenuOpen}
      >
        <View style={styles.optionsBackdrop}>
          <Pressable
            accessibilityLabel="Close menu"
            onPress={() => {
              setIsOptionsMenuOpen(false);
              setIsConfirmingDelete(false);
            }}
            style={StyleSheet.absoluteFill}
          />

          <View
            style={[
              styles.optionsSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            ]}
          >
            {isConfirmingDelete ? (
              <>
                <Text style={styles.confirmTitle}>Delete service log?</Text>
                <Text style={styles.confirmSubtitle}>
                  This will permanently remove &ldquo;{serviceLog.title}&rdquo;
                  ({formatServiceDate(serviceLog.service_date)}) from your
                  garage history.
                </Text>

                <View style={styles.confirmActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setIsOptionsMenuOpen(false);
                      setIsConfirmingDelete(false);
                    }}
                    style={({ pressed }) => [
                      styles.confirmCancelBtn,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleConfirmDelete}
                    style={({ pressed }) => [
                      styles.confirmDeleteBtn,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <Trash2 color={Colors.textPrimary} size={16} strokeWidth={2.2} />
                    <Text style={styles.confirmDeleteText}>Delete</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.optionsSheetTitle}>Service options</Text>

                {receiptUri ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setIsOptionsMenuOpen(false);
                      void handleExportReceipt();
                    }}
                    style={({ pressed }) => [
                      styles.optionsMenuItem,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <Share2
                      color={Colors.textPrimary}
                      size={18}
                      strokeWidth={2}
                    />
                    <Text style={styles.optionsMenuItemText}>
                      Export receipt image
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsConfirmingDelete(true)}
                  style={({ pressed }) => [
                    styles.optionsMenuItem,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <Trash2 color="#EF4444" size={18} strokeWidth={2} />
                  <Text style={styles.optionsMenuDeleteText}>
                    Delete service entry
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsOptionsMenuOpen(false)}
                  style={({ pressed }) => [
                    styles.optionsCancelItem,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <Text style={styles.optionsCancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.background,
  },
  topBarSideLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  topBarSideRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  topBarRightSpacer: {
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: -4,
  },
  backButtonText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '500',
  },
  topBarTitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  optionsButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.alertBackground,
    borderWidth: 1,
    borderColor: Colors.alertBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextColumn: {
    flex: 1,
  },
  heroTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '400',
  },
  metricsCard: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  metricColumnLeft: {
    flex: 1,
    paddingRight: 14,
  },
  metricColumnRight: {
    flex: 1,
    paddingLeft: 18,
  },
  metricsDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  metricEyebrow: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  odometerValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  metricMonoValue: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  metricUnitText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '400',
  },
  notesSection: {
    marginTop: 22,
  },
  notesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  sectionEyebrow: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  shopNameText: {
    flexShrink: 1,
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '500',
  },
  notesBodyText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  notesAttributionText: {
    marginTop: 10,
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '400',
  },
  notesEmptyText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  reminderCard: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  reminderTextColumn: {
    flex: 1,
  },
  reminderCardTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  reminderCardTarget: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  receiptSection: {
    marginTop: 24,
  },
  receiptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  receiptSectionTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '700',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  exportButtonText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  exportFeedbackText: {
    marginBottom: 10,
    color: Colors.primary,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  receiptCard: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  receiptImageViewport: {
    width: '100%',
    height: 334,
    overflow: 'hidden',
    backgroundColor: Colors.cardSurface,
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  receiptOverlayPill: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(23, 26, 32, 0.92)',
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
  },
  receiptOverlayZoomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 9,
  },
  receiptOverlayZoomText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 12,
    fontWeight: '500',
  },
  receiptOverlayDivider: {
    width: 1,
    height: 15,
    backgroundColor: Colors.border,
  },
  receiptOverlayExpandBtn: {
    paddingLeft: 9,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyReceiptBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    backgroundColor: Colors.cardSurface,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyReceiptText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    textAlign: 'center',
  },
  bottomDeleteButton: {
    marginTop: 24,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bottomDeleteText: {
    color: '#EF4444',
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  lightboxScreen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  lightboxTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  lightboxTitleGroup: {
    flex: 1,
  },
  lightboxTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  lightboxSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  lightboxActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lightboxActionCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxOuterScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  lightboxInnerScrollView: {
    backgroundColor: Colors.background,
  },
  lightboxInnerScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  lightboxBottomBar: {
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  lightboxControlsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 999,
    height: 44,
    paddingHorizontal: 8,
  },
  lightboxZoomStepBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxZoomReadoutBtn: {
    minWidth: 72,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxZoomReadoutText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 14,
    fontWeight: '600',
  },
  disabledControl: {
    opacity: 0.35,
  },
  optionsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 18, 0.74)',
    justifyContent: 'flex-end',
  },
  optionsSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  optionsSheetTitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  optionsMenuItem: {
    height: 50,
    borderRadius: 12,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 10,
  },
  optionsMenuItemText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },
  optionsMenuDeleteText: {
    color: '#EF4444',
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },
  optionsCancelItem: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  optionsCancelText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 6,
  },
  confirmSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmDeleteBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmDeleteText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  notFoundTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  notFoundSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  notFoundButton: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundButtonText: {
    color: Colors.background,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
  },
  pressedOpacity: {
    opacity: 0.75,
  },
});
