import { Image } from 'expo-image';
import {
  Bike,
  Camera,
  CarFront,
  Check,
  ChevronLeft,
  Image as ImageIcon,
  Trash2,
  X,
} from 'lucide-react-native';
import { type ComponentRef, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { Colors, Fonts } from '@/constants/theme';
import type {
  CreateVehicleInput,
  OdometerUnit,
  Vehicle,
  VehicleType,
} from '@/types/database';
import {
  deletePersistedVehicleImageIfOwned,
  pickAndPersistVehicleImageAsync,
  type ReceiptCaptureSource,
} from '@/utils/receiptStorage';

export interface SwitchVehicleModalProps {
  visible: boolean;
  vehicles: Vehicle[];
  activeVehicleId: number | null;
  onClose: () => void;
  onSelectVehicle: (vehicleId: number) => void;
  onAddVehicle: (input: CreateVehicleInput) => Vehicle;
}

type SheetMode = 'list' | 'add';
type FocusedField = 'name' | 'odometer' | 'subtitle' | null;

const VEHICLE_TYPE_OPTIONS: readonly {
  key: VehicleType;
  label: string;
}[] = [
  { key: 'car', label: 'Car' },
  { key: 'motorcycle', label: 'Motorcycle' },
] as const;

const UNIT_OPTIONS: readonly OdometerUnit[] = ['km', 'mi'] as const;

function formatOdometer(value: number): string {
  return Math.round(value).toLocaleString('en-US');
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

export function SwitchVehicleModal({
  visible,
  vehicles,
  activeVehicleId,
  onClose,
  onSelectVehicle,
  onAddVehicle,
}: SwitchVehicleModalProps) {
  const insets = useSafeAreaInsets();
  const odometerInputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const [mode, setMode] = useState<SheetMode>('list');
  const [focusedField, setFocusedField] = useState<FocusedField>(null);

  const [vehicleName, setVehicleName] = useState<string>('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [odometerDigits, setOdometerDigits] = useState<string>('');
  const [unit, setUnit] = useState<OdometerUnit>('km');
  const [subtitle, setSubtitle] = useState<string>('');
  const [imageUri, setImageUri] = useState<string | null>(null);

  const [isPhotoMenuOpen, setIsPhotoMenuOpen] = useState<boolean>(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetAddForm = (cleanupUnsavedPhoto: boolean): void => {
    if (cleanupUnsavedPhoto && imageUri) {
      deletePersistedVehicleImageIfOwned(imageUri);
    }
    setVehicleName('');
    setVehicleType('car');
    setOdometerDigits('');
    setUnit('km');
    setSubtitle('');
    setImageUri(null);
    setIsPhotoMenuOpen(false);
    setIsPickingPhoto(false);
    setFocusedField(null);
    setFormError(null);
  };

  const handleModalShow = (): void => {
    setMode('list');
    setFocusedField(null);
    setFormError(null);
    setIsPhotoMenuOpen(false);
  };

  const handleClose = (): void => {
    resetAddForm(true);
    setMode('list');
    onClose();
  };

  const handleBackToList = (): void => {
    resetAddForm(true);
    setMode('list');
  };

  const handleSelectVehicle = (vehicleId: number): void => {
    onSelectVehicle(vehicleId);
    resetAddForm(true);
    setMode('list');
    onClose();
  };

  const handlePickPhotoSource = async (
    source: ReceiptCaptureSource
  ): Promise<void> => {
    if (isPickingPhoto) {
      return;
    }

    setIsPickingPhoto(true);
    setFormError(null);

    try {
      const outcome = await pickAndPersistVehicleImageAsync(source);
      if (outcome.status === 'permission_denied') {
        setFormError(
          outcome.message ?? 'Permission is required to attach a vehicle photo.'
        );
        return;
      }

      if (outcome.status === 'picked' && outcome.uri) {
        if (imageUri && imageUri !== outcome.uri) {
          deletePersistedVehicleImageIfOwned(imageUri);
        }
        setImageUri(outcome.uri);
        setIsPhotoMenuOpen(false);
      }
    } catch {
      setFormError('Unable to attach vehicle photo. Please try again.');
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const handleRemovePhoto = (): void => {
    if (imageUri) {
      deletePersistedVehicleImageIfOwned(imageUri);
    }
    setImageUri(null);
    setIsPhotoMenuOpen(false);
  };

  const handleSaveVehicle = (): void => {
    const trimmedName = vehicleName.trim();
    if (!trimmedName) {
      setFormError('Enter a vehicle name (e.g. 2022 Honda Civic).');
      return;
    }

    const cleanedDigits = odometerDigits.replace(/[^0-9]/g, '');
    if (!cleanedDigits) {
      setFormError('Enter the current odometer reading.');
      return;
    }

    const parsedOdometer = Number.parseInt(cleanedDigits, 10);
    if (!Number.isSafeInteger(parsedOdometer) || parsedOdometer < 0) {
      setFormError('Enter a valid non-negative odometer reading.');
      return;
    }

    try {
      onAddVehicle({
        name: trimmedName,
        type: vehicleType,
        current_odometer: parsedOdometer,
        unit,
        subtitle: subtitle.trim() ? subtitle.trim() : null,
        image_uri: imageUri,
      });

      resetAddForm(false);
      setMode('list');
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to save vehicle. Please try again.';
      setFormError(message);
    }
  };

  const bottomSheetPadding = Math.max(insets.bottom, 16) + 12;

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={handleClose}
      onShow={handleModalShow}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <Pressable
          accessibilityLabel="Close garage sheet"
          onPress={handleClose}
          style={styles.backdropDismissArea}
        />

        <View
          style={[styles.sheet, { paddingBottom: bottomSheetPadding }]}
        >
          <View style={styles.grabberRow}>
            <View style={styles.grabberHandle} />
          </View>

          {mode === 'list' ? (
            <View style={styles.listContainer}>
              <View style={styles.headerRow}>
                <Text style={styles.sheetTitle}>Your garage</Text>
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
                  <X
                    color={Colors.textSecondary}
                    size={17}
                    strokeWidth={2.1}
                  />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.vehicleListContent}
                showsVerticalScrollIndicator={false}
                style={styles.vehicleListScroll}
              >
                {vehicles.map((item) => {
                  const isActive = item.id === activeVehicleId;

                  return (
                    <Pressable
                      accessibilityLabel={`${item.name}, ${formatOdometer(item.current_odometer)} ${item.unit}${item.subtitle ? `, ${item.subtitle}` : ''}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      key={item.id}
                      onPress={() => handleSelectVehicle(item.id)}
                      style={({ pressed }) => [
                        styles.vehicleCard,
                        isActive
                          ? styles.vehicleCardActive
                          : styles.vehicleCardInactive,
                        pressed && styles.pressedOpacity,
                      ]}
                    >
                      <View style={styles.vehicleCardTextColumn}>
                        <Text numberOfLines={1} style={styles.vehicleCardName}>
                          {item.name}
                        </Text>
                        <Text numberOfLines={1} style={styles.vehicleCardMeta}>
                          <Text style={styles.vehicleCardOdometerMono}>
                            {formatOdometer(item.current_odometer)} {item.unit}
                          </Text>
                          {item.subtitle ? ` · ${item.subtitle}` : ''}
                        </Text>
                      </View>

                      {isActive ? (
                        <View style={styles.activeCheckBadge}>
                          <Check
                            color={Colors.primary}
                            size={14}
                            strokeWidth={2.5}
                          />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Pressable
                accessibilityLabel="Add new vehicle"
                accessibilityRole="button"
                onPress={() => {
                  setFormError(null);
                  setMode('add');
                }}
                style={({ pressed }) => [
                  styles.primaryCtaButton,
                  pressed && styles.primaryCtaPressed,
                ]}
              >
                <Text style={styles.primaryCtaText}>+ Add new vehicle</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.addFormScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.addFormScroll}
            >
              <View style={styles.headerRow}>
                <View style={styles.addHeaderLeft}>
                  <Pressable
                    accessibilityLabel="Back to garage list"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={handleBackToList}
                    style={({ pressed }) => [
                      styles.iconCircleButton,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <ChevronLeft
                      color={Colors.textSecondary}
                      size={18}
                      strokeWidth={2.2}
                    />
                  </Pressable>
                  <Text style={styles.addSheetTitle}>Add new vehicle</Text>
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
                  <X
                    color={Colors.textSecondary}
                    size={17}
                    strokeWidth={2.1}
                  />
                </Pressable>
              </View>

              <Text style={styles.fieldLabel}>VEHICLE NAME</Text>
              <TextInput
                accessibilityLabel="Vehicle name"
                autoCapitalize="words"
                maxLength={60}
                onBlur={() =>
                  setFocusedField((prev) => (prev === 'name' ? null : prev))
                }
                onChangeText={(text) => {
                  setVehicleName(text);
                  if (formError) {
                    setFormError(null);
                  }
                }}
                onFocus={() => setFocusedField('name')}
                placeholder="e.g. 2022 Honda Civic"
                placeholderTextColor={Colors.textSecondary}
                returnKeyType="next"
                style={[
                  styles.textInput,
                  focusedField === 'name' && styles.inputFocused,
                ]}
                value={vehicleName}
              />

              <Text style={styles.fieldLabel}>VEHICLE TYPE</Text>
              <View style={styles.typeSelectorRow}>
                {VEHICLE_TYPE_OPTIONS.map((option) => {
                  const isSelected = vehicleType === option.key;
                  const iconColor = isSelected
                    ? Colors.primary
                    : Colors.textSecondary;

                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      key={option.key}
                      onPress={() => setVehicleType(option.key)}
                      style={({ pressed }) => [
                        styles.typeOptionPill,
                        isSelected
                          ? styles.typeOptionPillActive
                          : styles.typeOptionPillInactive,
                        pressed && styles.pressedOpacity,
                      ]}
                    >
                      {option.key === 'car' ? (
                        <CarFront
                          color={iconColor}
                          size={17}
                          strokeWidth={1.9}
                        />
                      ) : (
                        <Bike color={iconColor} size={17} strokeWidth={1.9} />
                      )}
                      <Text
                        style={[
                          styles.typeOptionLabel,
                          isSelected
                            ? styles.typeOptionLabelActive
                            : styles.typeOptionLabelInactive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>CURRENT ODOMETER</Text>
              <Pressable
                accessible={false}
                onPress={() => odometerInputRef.current?.focus()}
                style={[
                  styles.odometerInputBox,
                  focusedField === 'odometer' && styles.inputFocused,
                ]}
              >
                <TextInput
                  accessibilityLabel="Current odometer"
                  keyboardType="number-pad"
                  maxLength={9}
                  onBlur={() =>
                    setFocusedField((prev) =>
                      prev === 'odometer' ? null : prev
                    )
                  }
                  onChangeText={(text) => {
                    const digits = text.replace(/[^0-9]/g, '').slice(0, 7);
                    setOdometerDigits(digits);
                    if (formError) {
                      setFormError(null);
                    }
                  }}
                  onFocus={() => setFocusedField('odometer')}
                  placeholder="0"
                  placeholderTextColor={Colors.textSecondary}
                  ref={odometerInputRef}
                  returnKeyType="done"
                  style={styles.odometerMonoInput}
                  value={formatIntegerWithCommas(odometerDigits)}
                />

                <View style={styles.unitToggleGroup}>
                  {UNIT_OPTIONS.map((unitOption) => {
                    const isUnitActive = unit === unitOption;
                    return (
                      <Pressable
                        accessibilityLabel={`Unit ${unitOption}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isUnitActive }}
                        key={unitOption}
                        onPress={() => setUnit(unitOption)}
                        style={({ pressed }) => [
                          styles.unitChip,
                          isUnitActive
                            ? styles.unitChipActive
                            : styles.unitChipInactive,
                          pressed && styles.pressedOpacity,
                        ]}
                      >
                        <Text
                          style={[
                            styles.unitChipText,
                            isUnitActive
                              ? styles.unitChipTextActive
                              : styles.unitChipTextInactive,
                          ]}
                        >
                          {unitOption}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Pressable>

              <Text style={styles.fieldLabel}>SUBTITLE (OPTIONAL)</Text>
              <TextInput
                accessibilityLabel="Vehicle subtitle"
                autoCapitalize="sentences"
                maxLength={50}
                onBlur={() =>
                  setFocusedField((prev) => (prev === 'subtitle' ? null : prev))
                }
                onChangeText={setSubtitle}
                onFocus={() => setFocusedField('subtitle')}
                placeholder="e.g. Daily driver or Weekend ride"
                placeholderTextColor={Colors.textSecondary}
                returnKeyType="done"
                style={[
                  styles.textInput,
                  focusedField === 'subtitle' && styles.inputFocused,
                ]}
                value={subtitle}
              />

              <Text style={styles.fieldLabel}>VEHICLE PHOTO (OPTIONAL)</Text>
              <Pressable
                accessibilityLabel={
                  imageUri
                    ? 'Vehicle photo attached. Tap to replace or remove'
                    : 'Attach vehicle photo'
                }
                accessibilityRole="button"
                disabled={isPickingPhoto}
                onPress={() => setIsPhotoMenuOpen((prev) => !prev)}
                style={({ pressed }) => [
                  styles.photoBox,
                  imageUri && styles.photoBoxAttached,
                  pressed && styles.pressedOpacity,
                ]}
              >
                {imageUri ? (
                  <Image
                    contentFit="cover"
                    source={{ uri: imageUri }}
                    style={styles.photoPreviewThumb}
                  />
                ) : (
                  <View style={styles.photoIconSquare}>
                    {isPickingPhoto ? (
                      <ActivityIndicator color={Colors.primary} size="small" />
                    ) : (
                      <Camera
                        color={Colors.textPrimary}
                        size={18}
                        strokeWidth={1.9}
                      />
                    )}
                  </View>
                )}

                <View style={styles.photoTextColumn}>
                  <Text style={styles.photoTitle}>
                    {imageUri ? 'Vehicle photo attached' : 'Add vehicle photo'}
                  </Text>
                  <Text style={styles.photoSubtitle}>
                    {imageUri
                      ? '1 photo · Tap to replace or remove'
                      : 'Camera or photo library'}
                  </Text>
                </View>

                {imageUri ? (
                  <View style={styles.activeCheckBadge}>
                    <Check
                      color={Colors.primary}
                      size={14}
                      strokeWidth={2.5}
                    />
                  </View>
                ) : null}
              </Pressable>

              {isPhotoMenuOpen ? (
                <View style={styles.photoActionsRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isPickingPhoto}
                    onPress={() => {
                      void handlePickPhotoSource('camera');
                    }}
                    style={({ pressed }) => [
                      styles.photoActionChip,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <Camera
                      color={Colors.textPrimary}
                      size={14}
                      strokeWidth={2}
                    />
                    <Text style={styles.photoActionText}>Take photo</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={isPickingPhoto}
                    onPress={() => {
                      void handlePickPhotoSource('library');
                    }}
                    style={({ pressed }) => [
                      styles.photoActionChip,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    <ImageIcon
                      color={Colors.textPrimary}
                      size={14}
                      strokeWidth={2}
                    />
                    <Text style={styles.photoActionText}>Library</Text>
                  </Pressable>

                  {imageUri ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={isPickingPhoto}
                      onPress={handleRemovePhoto}
                      style={({ pressed }) => [
                        styles.photoActionChip,
                        pressed && styles.pressedOpacity,
                      ]}
                    >
                      <Trash2
                        color={Colors.textSecondary}
                        size={14}
                        strokeWidth={2}
                      />
                      <Text style={styles.photoRemoveText}>Remove</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {formError ? (
                <Text style={styles.formErrorText}>{formError}</Text>
              ) : null}

              <Pressable
                accessibilityLabel="Save vehicle"
                accessibilityRole="button"
                onPress={handleSaveVehicle}
                style={({ pressed }) => [
                  styles.saveVehicleButton,
                  pressed && styles.primaryCtaPressed,
                ]}
              >
                <Check
                  color={Colors.background}
                  size={17}
                  strokeWidth={2.6}
                />
                <Text style={styles.primaryCtaText}>Save vehicle</Text>
              </Pressable>
            </ScrollView>
          )}
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
  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
  headerRow: {
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
  vehicleListScroll: {
    marginTop: 20,
    maxHeight: 340,
    backgroundColor: Colors.background,
  },
  vehicleListContent: {
    gap: 12,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  vehicleCardActive: {
    borderColor: Colors.primary,
  },
  vehicleCardInactive: {
    borderColor: Colors.border,
  },
  vehicleCardTextColumn: {
    flex: 1,
  },
  vehicleCardName: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  vehicleCardMeta: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '400',
  },
  vehicleCardOdometerMono: {
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
  },
  activeCheckBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.alertBackground,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaButton: {
    marginTop: 18,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryCtaPressed: {
    opacity: 0.88,
  },
  primaryCtaText: {
    color: Colors.background,
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
  },
  addFormScroll: {
    backgroundColor: Colors.background,
  },
  addFormScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 6,
  },
  addHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addSheetTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  fieldLabel: {
    marginTop: 16,
    marginBottom: 8,
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  textInput: {
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRecessed,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  inputFocused: {
    borderColor: Colors.primary,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeOptionPill: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  typeOptionPillActive: {
    backgroundColor: Colors.alertBackground,
    borderColor: Colors.primary,
  },
  typeOptionPillInactive: {
    backgroundColor: Colors.surfaceRecessed,
    borderColor: Colors.border,
  },
  typeOptionLabel: {
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  typeOptionLabelActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  typeOptionLabelInactive: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  odometerInputBox: {
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRecessed,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: 14,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  odometerMonoInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 18,
    fontWeight: '600',
    paddingVertical: 0,
  },
  unitToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unitChip: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipActive: {
    backgroundColor: Colors.alertBackground,
    borderColor: Colors.primary,
  },
  unitChipInactive: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.border,
  },
  unitChipText: {
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  unitChipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  unitChipTextInactive: {
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  photoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    backgroundColor: Colors.surfaceRecessed,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    padding: 14,
  },
  photoBoxAttached: {
    borderColor: Colors.alertBorder,
  },
  photoIconSquare: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPreviewThumb: {
    width: 54,
    height: 40,
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
  },
  photoTextColumn: {
    flex: 1,
  },
  photoTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  photoSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  photoActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoActionChip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  photoActionText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
  },
  photoRemoveText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
  },
  formErrorText: {
    marginTop: 12,
    color: Colors.primary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '500',
  },
  saveVehicleButton: {
    marginTop: 20,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressedOpacity: {
    opacity: 0.76,
  },
});
