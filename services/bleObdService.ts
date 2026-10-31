import { Buffer } from 'buffer';
import { Platform } from 'react-native';

import {
  saveDtcCodes,
  updateVehicleTelemetry,
} from '@/db/repository';
import { notifyGarageDataChanged } from '@/hooks/useGarageData';

// Standard Generic ELM327 BLE Services and Characteristic UUIDs (lower case for matching)
export const ELM327_SERVICE_UUIDS = [
  '0000fff0-0000-1000-8000-00805f9b34fb', // FFF0
  '0000ffe0-0000-1000-8000-00805f9b34fb', // FFE0
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  'fff0',
  'ffe0',
];

// Custom ESP32 Smart Dongle UUIDs
export const ESP32_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const ESP32_CHAR_UUID = 'bea5760d-83d7-483e-a5ec-10f9d01c17b7';

export type DongleType = 'generic_elm327' | 'esp32_custom' | 'simulated';

export type BleConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'syncing'
  | 'synced'
  | 'error';

export interface DiscoveredDevice {
  id: string;
  name: string;
  rssi: number | null;
  dongleType: DongleType;
  isSimulated?: boolean;
}

export interface DtcItem {
  code: string;
  description: string;
}

export interface ObdTelemetryResult {
  odometer: number | null;
  batteryVoltage: number | null;
  dtcCodes: DtcItem[];
  rawResponses: string[];
  protocol: DongleType;
  timestamp: string;
}

export interface BleConsoleMessage {
  id: string;
  direction: 'tx' | 'rx' | 'info' | 'error';
  text: string;
  timestamp: string;
}

export const COMMON_DTC_DESCRIPTIONS: Record<string, string> = {
  P0133: 'O2 Sensor Circuit Slow Response (Bank 1, Sensor 1)',
  P0171: 'System Too Lean (Bank 1)',
  P0300: 'Random / Multiple Cylinder Misfire Detected',
  P0301: 'Cylinder 1 Misfire Detected',
  P0302: 'Cylinder 2 Misfire Detected',
  P0420: 'Catalyst System Efficiency Below Threshold (Bank 1)',
  P0128: 'Coolant Thermostat (Coolant Temp Below Regulating Temp)',
  P0455: 'Evaporative Emission System Leak Detected (Gross Leak)',
  P0442: 'Evaporative Emission System Leak Detected (Small Leak)',
  P0500: 'Vehicle Speed Sensor Malfunction',
};

// Safe interface to dynamically interact with react-native-ble-plx
interface NativeBleDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  connect: () => Promise<NativeBleDevice>;
  discoverAllServicesAndCharacteristics: () => Promise<NativeBleDevice>;
  services: () => Promise<NativeBleService[]>;
  cancelConnection: () => Promise<NativeBleDevice>;
}

interface NativeBleService {
  uuid: string;
  characteristics: () => Promise<NativeBleCharacteristic[]>;
}

interface NativeBleCharacteristic {
  uuid: string;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
  isNotifiable: boolean;
  isIndicatable: boolean;
  isReadable: boolean;
  read: () => Promise<NativeBleCharacteristic>;
  writeWithResponse: (valueBase64: string) => Promise<NativeBleCharacteristic>;
  writeWithoutResponse: (valueBase64: string) => Promise<NativeBleCharacteristic>;
  monitor: (
    listener: (error: Error | null, char: NativeBleCharacteristic | null) => void
  ) => { remove: () => void };
  value: string | null;
}

interface NativeBleManagerInstance {
  state: () => Promise<string>;
  startDeviceScan: (
    filteredUUIDs: string[] | null,
    options: Record<string, unknown> | null,
    listener: (error: Error | null, device: NativeBleDevice | null) => void
  ) => void;
  stopDeviceScan: () => void;
  destroy: () => void;
}

let nativeBleManager: NativeBleManagerInstance | null = null;
let isNativeModuleChecked = false;
let isNativeAvailable = false;

function getNativeBleManager(): NativeBleManagerInstance | null {
  if (isNativeModuleChecked) {
    return nativeBleManager;
  }
  isNativeModuleChecked = true;

  if (Platform.OS === 'web') {
    isNativeAvailable = false;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bleModule = require('react-native-ble-plx');
    if (bleModule && typeof bleModule.BleManager === 'function') {
      nativeBleManager = new bleModule.BleManager() as NativeBleManagerInstance;
      isNativeAvailable = true;
      return nativeBleManager;
    }
  } catch {
    // In Expo Go or test runners where native module isn't linked, fallback to simulation
    isNativeAvailable = false;
    nativeBleManager = null;
  }
  return nativeBleManager;
}

export function isBleHardwareAvailable(): boolean {
  return isNativeAvailable && getNativeBleManager() !== null;
}

// Global console log buffer for BLE diagnostics
type ConsoleListener = (message: BleConsoleMessage) => void;
const consoleListeners = new Set<ConsoleListener>();
const consoleLogHistory: BleConsoleMessage[] = [];

export function addConsoleListener(listener: ConsoleListener): () => void {
  consoleListeners.add(listener);
  return () => {
    consoleListeners.delete(listener);
  };
}

export function getConsoleHistory(): BleConsoleMessage[] {
  return [...consoleLogHistory];
}

export function clearConsoleHistory(): void {
  consoleLogHistory.length = 0;
}

export function appendConsoleMessage(
  direction: 'tx' | 'rx' | 'info' | 'error',
  text: string
): BleConsoleMessage {
  const message: BleConsoleMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    direction,
    text,
    timestamp: new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };

  consoleLogHistory.push(message);
  if (consoleLogHistory.length > 200) {
    consoleLogHistory.shift();
  }

  for (const listener of consoleListeners) {
    listener(message);
  }

  return message;
}

// Detect dongle type from device name or service UUIDs
export function classifyDongle(
  name: string | null,
  serviceUUIDs?: string[] | null
): DongleType {
  const lowerName = (name ?? '').toLowerCase();

  if (
    lowerName.includes('esp32') ||
    lowerName.includes('garage') ||
    serviceUUIDs?.some((uuid) => uuid.toLowerCase().includes(ESP32_SERVICE_UUID))
  ) {
    return 'esp32_custom';
  }

  if (
    lowerName.includes('obd') ||
    lowerName.includes('elm') ||
    lowerName.includes('veepeak') ||
    lowerName.includes('vgate') ||
    lowerName.includes('carista') ||
    lowerName.includes('link')
  ) {
    return 'generic_elm327';
  }

  return 'generic_elm327';
}

// Convert ELM327 DTC hex nibbles to human-readable OBD-II code
export function parseDtcHex(byte1: number, byte2: number): string | null {
  if (byte1 === 0 && byte2 === 0) {
    return null;
  }

  const prefixIndex = (byte1 >> 6) & 0x03;
  const prefixes = ['P', 'C', 'B', 'U'] as const;
  const prefix = prefixes[prefixIndex] ?? 'P';

  const digit1 = (byte1 >> 4) & 0x03;
  const digit2 = byte1 & 0x0f;
  const hexStr = ((digit2 << 8) | byte2).toString(16).toUpperCase().padStart(3, '0');

  return `${prefix}${digit1}${hexStr}`;
}

export function parseDtcResponse(raw: string): DtcItem[] {
  const codes: DtcItem[] = [];
  const clean = raw.replace(/[\r\n>]/g, ' ').replace(/\s+/g, ' ').trim();
  const hexTokens = clean.split(' ').filter((token) => /^[0-9A-Fa-f]{2}$/.test(token));

  // Mode 03 response starts with 43
  const modeIndex = hexTokens.indexOf('43');
  if (modeIndex >= 0) {
    const dataTokens = hexTokens.slice(modeIndex + 1);
    for (let i = 0; i < dataTokens.length - 1; i += 2) {
      const b1Str = dataTokens[i];
      const b2Str = dataTokens[i + 1];
      if (!b1Str || !b2Str) {
        break;
      }
      const b1 = Number.parseInt(b1Str, 16);
      const b2 = Number.parseInt(b2Str, 16);
      const code = parseDtcHex(b1, b2);
      if (code) {
        codes.push({
          code,
          description: COMMON_DTC_DESCRIPTIONS[code] ?? `Diagnostic Trouble Code ${code}`,
        });
      }
    }
  }

  return codes;
}

export function parseBatteryVoltageResponse(raw: string): number | null {
  const match = raw.match(/([0-9]+\.[0-9]+)\s*V?/i);
  if (match && match[1]) {
    const val = Number.parseFloat(match[1]);
    if (!Number.isNaN(val) && val >= 5 && val <= 20) {
      return Math.round(val * 10) / 10;
    }
  }
  return null;
}

export function parseOdometerResponse(raw: string): number | null {
  const clean = raw.replace(/[\r\n>]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = clean.split(' ').filter((t) => /^[0-9A-Fa-f]{2}$/.test(t));

  // Check 01 A6 response: 41 A6 A B C D (4 bytes)
  const a6Idx = tokens.indexOf('A6');
  if (a6Idx >= 1 && tokens[a6Idx - 1] === '41' && tokens.length >= a6Idx + 5) {
    const b0 = Number.parseInt(tokens[a6Idx + 1] ?? '0', 16);
    const b1 = Number.parseInt(tokens[a6Idx + 2] ?? '0', 16);
    const b2 = Number.parseInt(tokens[a6Idx + 3] ?? '0', 16);
    const b3 = Number.parseInt(tokens[a6Idx + 4] ?? '0', 16);
    const rawVal = (b0 * 16777216) + (b1 * 65536) + (b2 * 256) + b3;
    const km = Math.round(rawVal / 10);
    if (km > 0 && km < 2000000) {
      return km;
    }
  }

  // Fallback 01 31 response (Distance since codes cleared): 41 31 A B
  const idx31 = tokens.indexOf('31');
  if (idx31 >= 1 && tokens[idx31 - 1] === '41' && tokens.length >= idx31 + 3) {
    const b0 = Number.parseInt(tokens[idx31 + 1] ?? '0', 16);
    const b1 = Number.parseInt(tokens[idx31 + 2] ?? '0', 16);
    const km = (b0 * 256) + b1;
    if (km > 0 && km < 2000000) {
      return km;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Simulated BLE Dongle Engine
// ---------------------------------------------------------------------------

const SIMULATED_DEVICES: DiscoveredDevice[] = [
  {
    id: 'SIM-ESP32-01',
    name: 'ESP32-Garage-OBD (Custom BLE)',
    rssi: -58,
    dongleType: 'esp32_custom',
    isSimulated: true,
  },
  {
    id: 'SIM-ELM327-02',
    name: 'Veepeak OBDCheck BLE (ELM327)',
    rssi: -64,
    dongleType: 'generic_elm327',
    isSimulated: true,
  },
];

export async function runSimulatedBleSync(
  device: DiscoveredDevice,
  vehicleId: number,
  currentOdometer: number
): Promise<ObdTelemetryResult> {
  appendConsoleMessage('info', `Connecting to simulated device ${device.name}...`);
  await new Promise((resolve) => setTimeout(resolve, 350));

  appendConsoleMessage('info', `Connected! Synchronizing vehicle #${vehicleId} telemetry...`);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const responses: string[] = [];

  if (device.dongleType === 'esp32_custom') {
    // Custom ESP32 single GATT burst payload
    appendConsoleMessage('tx', `SUBSCRIBE GATT ${ESP32_SERVICE_UUID}`);
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Simulated new odometer +15 km and 14.2V alternator running
    const nextOdometer = currentOdometer + 15;
    const vbat = 14.2;
    const payload = JSON.stringify({
      odo: nextOdometer,
      vbat,
      dtcs: [],
    });

    appendConsoleMessage('rx', `BURST: ${payload}`);
    responses.push(payload);

    updateVehicleTelemetry(vehicleId, {
      odometer: nextOdometer,
      voltage: vbat,
      deviceId: device.id,
      deviceName: device.name,
    });
    notifyGarageDataChanged();

    appendConsoleMessage(
      'info',
      `Sync completed! Odometer: ${nextOdometer.toLocaleString()} km · Battery: ${vbat}V`
    );

    return {
      odometer: nextOdometer,
      batteryVoltage: vbat,
      dtcCodes: [],
      rawResponses: responses,
      protocol: 'esp32_custom',
      timestamp: new Date().toISOString(),
    };
  }

  // Generic ELM327 command sequence
  appendConsoleMessage('tx', 'ATZ');
  await new Promise((resolve) => setTimeout(resolve, 200));
  appendConsoleMessage('rx', 'ELM327 v1.5 >');
  responses.push('ELM327 v1.5 >');

  appendConsoleMessage('tx', 'ATE0');
  await new Promise((resolve) => setTimeout(resolve, 150));
  appendConsoleMessage('rx', 'OK >');
  responses.push('OK >');

  appendConsoleMessage('tx', 'ATRV');
  await new Promise((resolve) => setTimeout(resolve, 200));
  const simulatedVoltage = 12.6;
  appendConsoleMessage('rx', `${simulatedVoltage}V >`);
  responses.push(`${simulatedVoltage}V >`);

  appendConsoleMessage('tx', '01A6');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const nextOdo = currentOdometer + 12;
  const hexOdo = (nextOdo * 10).toString(16).padStart(8, '0').toUpperCase();
  const chunked = `${hexOdo.slice(0, 2)} ${hexOdo.slice(2, 4)} ${hexOdo.slice(4, 6)} ${hexOdo.slice(6, 8)}`;
  appendConsoleMessage('rx', `41 A6 ${chunked} >`);
  responses.push(`41 A6 ${chunked} >`);

  appendConsoleMessage('tx', '03');
  await new Promise((resolve) => setTimeout(resolve, 250));
  appendConsoleMessage('rx', '43 00 00 00 00 00 00 >');
  responses.push('43 00 00 00 00 00 00 >');

  updateVehicleTelemetry(vehicleId, {
    odometer: nextOdo,
    voltage: simulatedVoltage,
    deviceId: device.id,
    deviceName: device.name,
  });
  notifyGarageDataChanged();

  appendConsoleMessage(
    'info',
    `Sync completed! Odometer: ${nextOdo.toLocaleString()} km · Battery: ${simulatedVoltage}V`
  );

  return {
    odometer: nextOdo,
    batteryVoltage: simulatedVoltage,
    dtcCodes: [],
    rawResponses: responses,
    protocol: 'generic_elm327',
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hardware BLE Scan & Sync Controller
// ---------------------------------------------------------------------------

let activeConnectedDevice: NativeBleDevice | null = null;

export async function scanForBleDongles(
  onDeviceDiscovered: (device: DiscoveredDevice) => void,
  durationMs = 6000
): Promise<void> {
  const manager = getNativeBleManager();

  // If native BLE is not available, immediately provide simulated dongles
  if (!manager) {
    appendConsoleMessage('info', 'Native BLE hardware unavailable. Emulating BLE dongle discovery.');
    for (const sim of SIMULATED_DEVICES) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      onDeviceDiscovered(sim);
    }
    return;
  }

  // Also include the simulated options so developers can test without hardware
  for (const sim of SIMULATED_DEVICES) {
    onDeviceDiscovered(sim);
  }

  appendConsoleMessage('info', 'Scanning for nearby BLE OBD-II dongles...');
  const discoveredMap = new Map<string, DiscoveredDevice>();

  try {
    manager.startDeviceScan(null, null, (error, nativeDev) => {
      if (error) {
        appendConsoleMessage('error', `Scan error: ${error.message}`);
        return;
      }
      if (nativeDev && nativeDev.name) {
        const dongleType = classifyDongle(nativeDev.name);
        if (!discoveredMap.has(nativeDev.id)) {
          const discovered: DiscoveredDevice = {
            id: nativeDev.id,
            name: nativeDev.name,
            rssi: nativeDev.rssi,
            dongleType,
            isSimulated: false,
          };
          discoveredMap.set(nativeDev.id, discovered);
          appendConsoleMessage('info', `Found BLE device: ${nativeDev.name} (${nativeDev.id})`);
          onDeviceDiscovered(discovered);
        }
      }
    });

    await new Promise((resolve) => setTimeout(resolve, durationMs));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    appendConsoleMessage('error', `Scan failed: ${msg}`);
  } finally {
    try {
      manager.stopDeviceScan();
    } catch {
      // Ignore stop errors
    }
    appendConsoleMessage('info', 'BLE scan finished.');
  }
}

export async function syncVehicleWithDongle(
  device: DiscoveredDevice,
  vehicleId: number,
  currentOdometer: number
): Promise<ObdTelemetryResult> {
  if (device.isSimulated || !getNativeBleManager()) {
    return await runSimulatedBleSync(device, vehicleId, currentOdometer);
  }

  const manager = getNativeBleManager();
  if (!manager) {
    throw new Error('BLE hardware is not available on this platform.');
  }

  appendConsoleMessage('info', `Connecting to ${device.name} (${device.id})...`);
  const nativeDevice = (await (manager as unknown as {
    connectToDevice: (id: string) => Promise<NativeBleDevice>;
  }).connectToDevice(device.id)) as NativeBleDevice;

  activeConnectedDevice = nativeDevice;
  await nativeDevice.discoverAllServicesAndCharacteristics();
  appendConsoleMessage('info', 'GATT services discovered.');

  const services = await nativeDevice.services();
  const responses: string[] = [];

  // Check for ESP32 custom characteristic
  const esp32Service = services.find((s) => s.uuid.toLowerCase().includes(ESP32_SERVICE_UUID));

  if (esp32Service) {
    appendConsoleMessage('info', 'ESP32 Smart Dongle GATT profile detected.');
    const chars = await esp32Service.characteristics();
    const payloadChar = chars.find((c) => c.uuid.toLowerCase().includes(ESP32_CHAR_UUID)) ?? chars[0];

    if (!payloadChar) {
      throw new Error('ESP32 telemetry characteristic not found.');
    }

    appendConsoleMessage('tx', `READ ${payloadChar.uuid}`);
    const readChar = await payloadChar.read();
    const rawBase64 = readChar.value ?? '';
    const rawJson = Buffer.from(rawBase64, 'base64').toString('utf-8');
    appendConsoleMessage('rx', `BURST: ${rawJson}`);
    responses.push(rawJson);

    let parsedOdo = currentOdometer;
    let parsedVbat = 14.1;
    let parsedDtcs: DtcItem[] = [];

    try {
      const data = JSON.parse(rawJson) as {
        odo?: number;
        vbat?: number;
        dtcs?: string[];
      };
      if (typeof data.odo === 'number') {
        parsedOdo = Math.round(data.odo);
      }
      if (typeof data.vbat === 'number') {
        parsedVbat = Math.round(data.vbat * 10) / 10;
      }
      if (Array.isArray(data.dtcs)) {
        parsedDtcs = data.dtcs.map((c) => ({
          code: c,
          description: COMMON_DTC_DESCRIPTIONS[c] ?? `Diagnostic Trouble Code ${c}`,
        }));
      }
    } catch {
      // Fallback
    }

    updateVehicleTelemetry(vehicleId, {
      odometer: parsedOdo,
      voltage: parsedVbat,
      deviceId: device.id,
      deviceName: device.name,
    });

    if (parsedDtcs.length > 0) {
      saveDtcCodes(vehicleId, parsedDtcs);
    }

    notifyGarageDataChanged();

    return {
      odometer: parsedOdo,
      batteryVoltage: parsedVbat,
      dtcCodes: parsedDtcs,
      rawResponses: responses,
      protocol: 'esp32_custom',
      timestamp: new Date().toISOString(),
    };
  }

  // Generic ELM327 Serial UART mode
  let writeChar: NativeBleCharacteristic | null = null;
  let notifyChar: NativeBleCharacteristic | null = null;

  for (const s of services) {
    const chars = await s.characteristics();
    for (const c of chars) {
      if (c.isWritableWithResponse || c.isWritableWithoutResponse) {
        writeChar = c;
      }
      if (c.isNotifiable || c.isIndicatable || c.isReadable) {
        notifyChar = c;
      }
    }
  }

  if (!writeChar) {
    throw new Error('No writable UART characteristic found on dongle.');
  }

  const sendElmCommand = async (cmd: string): Promise<string> => {
    appendConsoleMessage('tx', cmd);
    const b64 = Buffer.from(`${cmd}\r`, 'utf-8').toString('base64');
    if (writeChar.isWritableWithResponse) {
      await writeChar.writeWithResponse(b64);
    } else {
      await writeChar.writeWithoutResponse(b64);
    }

    // Wait for response frame
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (notifyChar?.isReadable) {
      const readRes = await notifyChar.read();
      const resText = Buffer.from(readRes.value ?? '', 'base64').toString('utf-8');
      appendConsoleMessage('rx', resText.trim());
      responses.push(resText.trim());
      return resText;
    }
    return '';
  };

  // Run ELM327 handshake
  await sendElmCommand('ATZ');
  await sendElmCommand('ATE0');
  const vbatRaw = await sendElmCommand('ATRV');
  const parsedVoltage = parseBatteryVoltageResponse(vbatRaw) ?? 12.6;

  const odoRaw = await sendElmCommand('01A6');
  const parsedOdo = parseOdometerResponse(odoRaw) ?? currentOdometer;

  const dtcRaw = await sendElmCommand('03');
  const dtcCodes = parseDtcResponse(dtcRaw);

  updateVehicleTelemetry(vehicleId, {
    odometer: parsedOdo,
    voltage: parsedVoltage,
    deviceId: device.id,
    deviceName: device.name,
  });

  if (dtcCodes.length > 0) {
    saveDtcCodes(vehicleId, dtcCodes);
  }

  notifyGarageDataChanged();

  return {
    odometer: parsedOdo,
    batteryVoltage: parsedVoltage,
    dtcCodes,
    rawResponses: responses,
    protocol: 'generic_elm327',
    timestamp: new Date().toISOString(),
  };
}

export async function disconnectBleDongle(): Promise<void> {
  if (activeConnectedDevice) {
    try {
      await activeConnectedDevice.cancelConnection();
      appendConsoleMessage('info', 'Disconnected from BLE dongle.');
    } catch {
      // Ignore cancellation error
    }
    activeConnectedDevice = null;
  }
}
