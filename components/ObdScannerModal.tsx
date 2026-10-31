import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  Bluetooth,
  Cpu,
  Play,
  Radio,
  RefreshCw,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';

import { Colors, Fonts } from '@/constants/theme';
import { getDtcLogs } from '@/db/repository';
import {
  addConsoleListener,
  clearConsoleHistory,
  type DiscoveredDevice,
  getConsoleHistory,
  type BleConsoleMessage,
  scanForBleDongles,
  syncVehicleWithDongle,
} from '@/services/bleObdService';
import type { DtcLog, Vehicle } from '@/types/database';

interface ObdScannerModalProps {
  visible: boolean;
  vehicle: Vehicle | null;
  onClose: () => void;
}

export function ObdScannerModal({
  visible,
  vehicle,
  onClose,
}: ObdScannerModalProps) {
  const insets = useSafeAreaInsets();
  const [isScanning, setIsScanning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<BleConsoleMessage[]>(getConsoleHistory);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);

  const consoleScrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const activeDtcLogs: DtcLog[] = visible && vehicle ? getDtcLogs(vehicle.id) : [];

  useEffect(() => {
    const unsubscribe = addConsoleListener((newMsg) => {
      setConsoleLogs((prev) => [...prev.slice(-150), newMsg]);
      setTimeout(() => {
        consoleScrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });
    return unsubscribe;
  }, []);

  const handleStartScan = async () => {
    if (isScanning || isSyncing) {
      return;
    }
    setIsScanning(true);
    setDiscoveredDevices([]);
    setSyncStatusText('Scanning for BLE dongles...');

    try {
      await scanForBleDongles((device) => {
        setDiscoveredDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) {
            return prev;
          }
          return [...prev, device];
        });
      }, 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncStatusText(`Scan failed: ${msg}`);
    } finally {
      setIsScanning(false);
      setSyncStatusText(null);
    }
  };

  const handleConnectAndSync = async (device: DiscoveredDevice) => {
    if (!vehicle || isSyncing) {
      return;
    }
    setIsSyncing(true);
    setSyncStatusText(`Connecting to ${device.name}...`);

    try {
      const result = await syncVehicleWithDongle(
        device,
        vehicle.id,
        vehicle.current_odometer
      );

      setSyncStatusText(
        `Synced! Odo: ${result.odometer?.toLocaleString()} km · Batt: ${result.batteryVoltage}V`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Sync Failed', msg);
      setSyncStatusText(`Error: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSimulateSync = async () => {
    if (!vehicle || isSyncing) {
      return;
    }
    const simDevice: DiscoveredDevice = {
      id: 'SIM-ESP32-DEMO',
      name: 'ESP32-Garage-OBD (Custom BLE)',
      rssi: -55,
      dongleType: 'esp32_custom',
      isSimulated: true,
    };
    await handleConnectAndSync(simDevice);
  };

  const handleClearLogs = () => {
    clearConsoleHistory();
    setConsoleLogs([]);
  };

  if (!vehicle) {
    return null;
  }

  const unresolvedDtcs = activeDtcLogs.filter((d) => d.resolved === 0);

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close OBD scanner"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <View style={styles.dragHandleContainer}>
            <View style={styles.dragHandle} />
          </View>

          <View style={styles.headerRow}>
            <View style={styles.headerTextColumn}>
              <Text style={styles.headerTitle}>OBD-II Telemetry</Text>
              <Text style={styles.headerSubtitle}>
                {vehicle.name} · Auto Sync
              </Text>
            </View>

            <Pressable
              accessibilityLabel="Close modal"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressedOpacity,
              ]}
            >
              <X color={Colors.textSecondary} size={20} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Live Metrics Row */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>ODOMETER</Text>
                <Text style={styles.metricValue}>
                  {Math.round(vehicle.current_odometer).toLocaleString()}
                </Text>
                <Text style={styles.metricUnit}>{vehicle.unit}</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>VOLTAGE</Text>
                <Text style={styles.metricValue}>
                  {vehicle.battery_voltage !== null
                    ? `${vehicle.battery_voltage.toFixed(1)}`
                    : '--.-'}
                </Text>
                <Text style={styles.metricUnit}>
                  {vehicle.battery_voltage !== null
                    ? vehicle.battery_voltage > 13.5
                      ? 'Alternator ON'
                      : 'Battery OK'
                    : 'Not synced'}
                </Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>DTC CODES</Text>
                <Text
                  style={[
                    styles.metricValue,
                    unresolvedDtcs.length > 0 && styles.errorText,
                  ]}
                >
                  {unresolvedDtcs.length}
                </Text>
                <Text style={styles.metricUnit}>
                  {unresolvedDtcs.length === 0 ? 'Clean' : 'Detected'}
                </Text>
              </View>
            </View>

            {/* DTC Codes Warning Banner if active */}
            {unresolvedDtcs.length > 0 ? (
              <View style={styles.dtcBanner}>
                <AlertTriangle color="#EF4444" size={18} strokeWidth={2.2} />
                <View style={styles.dtcBannerContent}>
                  <Text style={styles.dtcBannerTitle}>Diagnostic Trouble Codes</Text>
                  {unresolvedDtcs.map((dtc) => (
                    <Text key={dtc.id} style={styles.dtcItemText}>
                      • <Text style={styles.dtcCodeHighlight}>{dtc.code}</Text>: {dtc.description}
                    </Text>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Action Bar */}
            <View style={styles.actionsRow}>
              <Pressable
                accessibilityLabel="Scan for BLE dongles"
                accessibilityRole="button"
                disabled={isScanning || isSyncing}
                onPress={handleStartScan}
                style={({ pressed }) => [
                  styles.scanButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                {isScanning ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <RefreshCw color={Colors.background} size={16} strokeWidth={2.4} />
                )}
                <Text style={styles.scanButtonText}>
                  {isScanning ? 'Scanning...' : 'Scan BLE'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel="Simulate sync burst"
                accessibilityRole="button"
                disabled={isScanning || isSyncing}
                onPress={handleSimulateSync}
                style={({ pressed }) => [
                  styles.simButton,
                  pressed && styles.pressedOpacity,
                ]}
              >
                <Play color={Colors.primary} size={15} strokeWidth={2.2} />
                <Text style={styles.simButtonText}>Simulate Sync</Text>
              </Pressable>
            </View>

            {syncStatusText ? (
              <Text style={styles.syncStatusNotice}>{syncStatusText}</Text>
            ) : null}

            {/* Discovered BLE Dongles */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>DISCOVERED DONGLES</Text>
              {isScanning ? (
                <View style={styles.scanningBadge}>
                  <Radio color={Colors.primary} size={13} strokeWidth={2.5} />
                  <Text style={styles.scanningBadgeText}>Listening</Text>
                </View>
              ) : null}
            </View>

            {discoveredDevices.length === 0 ? (
              <View style={styles.emptyDevicesCard}>
                <Bluetooth color={Colors.textSecondary} size={24} strokeWidth={1.8} />
                <Text style={styles.emptyDevicesTitle}>No BLE dongles found yet</Text>
                <Text style={styles.emptyDevicesSubtitle}>
                  Tap &ldquo;Scan BLE&rdquo; or &ldquo;Simulate Sync&rdquo; to sync with your ELM327 or custom ESP32 dongle.
                </Text>
              </View>
            ) : (
              discoveredDevices.map((dev) => (
                <View key={dev.id} style={styles.deviceCard}>
                  <View style={styles.deviceIconBox}>
                    {dev.dongleType === 'esp32_custom' ? (
                      <Cpu color={Colors.primary} size={20} strokeWidth={2} />
                    ) : (
                      <Zap color={Colors.primary} size={20} strokeWidth={2} />
                    )}
                  </View>

                  <View style={styles.deviceDetails}>
                    <Text numberOfLines={1} style={styles.deviceName}>
                      {dev.name}
                    </Text>
                    <Text style={styles.deviceProtocol}>
                      {dev.dongleType === 'esp32_custom'
                        ? 'ESP32 GATT Burst · 4FAFC201'
                        : 'ELM327 UART · FFF0 / FFE0'}
                      {dev.isSimulated ? ' (Simulated)' : ''}
                    </Text>
                  </View>

                  <Pressable
                    accessibilityLabel={`Connect and sync ${dev.name}`}
                    accessibilityRole="button"
                    disabled={isSyncing}
                    onPress={() => handleConnectAndSync(dev)}
                    style={({ pressed }) => [
                      styles.connectButton,
                      pressed && styles.pressedOpacity,
                    ]}
                  >
                    {isSyncing ? (
                      <ActivityIndicator color={Colors.background} size="small" />
                    ) : (
                      <Text style={styles.connectButtonText}>Sync</Text>
                    )}
                  </Pressable>
                </View>
              ))
            )}

            {/* Live Terminal Console */}
            <View style={styles.consoleSection}>
              <View style={styles.consoleHeaderRow}>
                <View style={styles.consoleTitleGroup}>
                  <Terminal color={Colors.textSecondary} size={14} strokeWidth={2} />
                  <Text style={styles.consoleTitle}>RAW BLE / OBD TERMINAL</Text>
                </View>

                <Pressable
                  accessibilityLabel="Clear terminal"
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={handleClearLogs}
                  style={({ pressed }) => [
                    styles.consoleClearBtn,
                    pressed && styles.pressedOpacity,
                  ]}
                >
                  <Trash2 color={Colors.textSecondary} size={13} strokeWidth={2} />
                  <Text style={styles.consoleClearText}>Clear</Text>
                </Pressable>
              </View>

              <ScrollView
                ref={consoleScrollRef}
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.consoleBox}
              >
                {consoleLogs.length === 0 ? (
                  <Text style={styles.consoleEmptyText}>
                    Awaiting BLE frames...
                  </Text>
                ) : (
                  consoleLogs.map((log) => {
                    let logColor: string = Colors.textSecondary;
                    if (log.direction === 'tx') logColor = '#38BDF8';
                    if (log.direction === 'rx') logColor = '#4ADE80';
                    if (log.direction === 'error') logColor = '#F87171';
                    if (log.direction === 'info') logColor = '#FCD34D';

                    return (
                      <Text key={log.id} style={styles.consoleLine}>
                        <Text style={styles.consoleTimestamp}>[{log.timestamp}] </Text>
                        <Text style={{ color: logColor }}>
                          {log.direction.toUpperCase()}: {log.text}
                        </Text>
                      </Text>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: Colors.background, // #171A20
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.border, // #2B303A
    maxHeight: '90%',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#646D7C',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTextColumn: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  metricLabel: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  metricValue: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
  },
  metricUnit: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    marginTop: 2,
  },
  dtcBanner: {
    flexDirection: 'row',
    backgroundColor: '#301818',
    borderWidth: 1,
    borderColor: '#592424',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  dtcBannerContent: {
    flex: 1,
  },
  dtcBannerTitle: {
    color: '#F87171',
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  dtcItemText: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  dtcCodeHighlight: {
    fontFamily: Fonts.mono,
    fontWeight: '700',
    color: '#FCA5A5',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  scanButton: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  scanButtonText: {
    color: Colors.background,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
  },
  simButton: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.alertBackground,
    borderWidth: 1,
    borderColor: Colors.alertBorder,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  simButtonText: {
    color: Colors.primary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  syncStatusNotice: {
    color: Colors.primary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderTitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  scanningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scanningBadgeText: {
    color: Colors.primary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyDevicesCard: {
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyDevicesTitle: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyDevicesSubtitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  deviceIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.alertBackground,
    borderWidth: 1,
    borderColor: Colors.alertBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceDetails: {
    flex: 1,
  },
  deviceName: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
  },
  deviceProtocol: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
    marginTop: 2,
  },
  connectButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectButtonText: {
    color: Colors.background,
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '700',
  },
  consoleSection: {
    marginTop: 10,
  },
  consoleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  consoleTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consoleTitle: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  consoleClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  consoleClearText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.sans,
    fontSize: 11,
  },
  consoleBox: {
    height: 140,
    backgroundColor: Colors.surfaceRecessed, // #181B22
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 10,
  },
  consoleEmptyText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: 11,
    fontStyle: 'italic',
  },
  consoleLine: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 2,
  },
  consoleTimestamp: {
    color: '#646D7C',
  },
  pressedOpacity: {
    opacity: 0.8,
  },
});
