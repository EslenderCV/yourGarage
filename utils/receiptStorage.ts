import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export type ReceiptCaptureSource = 'camera' | 'library';

export interface ReceiptPickOutcome {
  status: 'picked' | 'canceled' | 'permission_denied';
  uri: string | null;
  message?: string;
}

const RECEIPTS_SUBDIRECTORY = 'receipts';
const VEHICLES_SUBDIRECTORY = 'vehicles';

function extractFileExtension(filenameOrUri: string): string {
  const cleanPath = filenameOrUri.split('?')[0]?.split('#')[0] ?? '';
  const lastDot = cleanPath.lastIndexOf('.');
  const lastSlash = cleanPath.lastIndexOf('/');
  if (lastDot > lastSlash && lastDot !== -1) {
    const ext = cleanPath.slice(lastDot).toLowerCase();
    if (/^\.[a-z0-9]{2,5}$/.test(ext)) {
      return ext;
    }
  }
  return '.jpg';
}

async function persistImageToSubdirectoryAsync(
  sourceUri: string,
  subdirectoryName: string,
  prefix: string,
  fileNameHint?: string | null
): Promise<string> {
  if (Platform.OS === 'web') {
    return sourceUri;
  }

  const targetDirectory = new Directory(Paths.document, subdirectoryName);
  targetDirectory.create({ intermediates: true, idempotent: true });

  const sourceFile = new File(sourceUri);
  const rawExtension =
    sourceFile.extension ||
    extractFileExtension(fileNameHint ?? sourceUri) ||
    '.jpg';
  const normalizedExtension = rawExtension.startsWith('.')
    ? rawExtension
    : `.${rawExtension}`;

  const uniqueName = `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}${normalizedExtension}`;

  const destinationFile = new File(targetDirectory, uniqueName);
  await sourceFile.copy(destinationFile, { overwrite: true });

  return destinationFile.uri;
}

export async function persistReceiptToDocumentsAsync(
  sourceUri: string,
  fileNameHint?: string | null
): Promise<string> {
  return persistImageToSubdirectoryAsync(
    sourceUri,
    RECEIPTS_SUBDIRECTORY,
    'receipt',
    fileNameHint
  );
}

export function deletePersistedReceiptIfOwned(uri: string | null): void {
  if (!uri || Platform.OS === 'web') {
    return;
  }

  try {
    const receiptsDirectory = new Directory(
      Paths.document,
      RECEIPTS_SUBDIRECTORY
    );
    if (!uri.startsWith(receiptsDirectory.uri)) {
      return;
    }
    const targetFile = new File(uri);
    if (targetFile.exists) {
      targetFile.delete();
    }
  } catch {
    // Ignore cleanup errors for temporary/unsaved replacements
  }
}

export function deletePersistedVehicleImageIfOwned(uri: string | null): void {
  if (!uri || Platform.OS === 'web') {
    return;
  }

  try {
    const vehiclesDirectory = new Directory(
      Paths.document,
      VEHICLES_SUBDIRECTORY
    );
    if (!uri.startsWith(vehiclesDirectory.uri)) {
      return;
    }
    const targetFile = new File(uri);
    if (targetFile.exists) {
      targetFile.delete();
    }
  } catch {
    // Ignore cleanup errors for temporary/unsaved vehicle images
  }
}

export async function pickAndPersistReceiptAsync(
  source: ReceiptCaptureSource
): Promise<ReceiptPickOutcome> {
  if (source === 'camera') {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraPermission.granted) {
      return {
        status: 'permission_denied',
        uri: null,
        message: 'Camera permission is required to photograph a receipt.',
      };
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (cameraResult.canceled || cameraResult.assets.length === 0) {
      return { status: 'canceled', uri: null };
    }

    const asset = cameraResult.assets[0];
    const savedUri = await persistReceiptToDocumentsAsync(
      asset.uri,
      asset.fileName
    );
    return { status: 'picked', uri: savedUri };
  }

  const libraryPermission =
    await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!libraryPermission.granted) {
    return {
      status: 'permission_denied',
      uri: null,
      message: 'Photo library permission is required to select a receipt.',
    };
  }

  const libraryResult = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });

  if (libraryResult.canceled || libraryResult.assets.length === 0) {
    return { status: 'canceled', uri: null };
  }

  const asset = libraryResult.assets[0];
  const savedUri = await persistReceiptToDocumentsAsync(
    asset.uri,
    asset.fileName
  );
  return { status: 'picked', uri: savedUri };
}

export async function pickAndPersistVehicleImageAsync(
  source: ReceiptCaptureSource
): Promise<ReceiptPickOutcome> {
  if (source === 'camera') {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (!cameraPermission.granted) {
      return {
        status: 'permission_denied',
        uri: null,
        message: 'Camera permission is required to photograph your vehicle.',
      };
    }

    const cameraResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (cameraResult.canceled || cameraResult.assets.length === 0) {
      return { status: 'canceled', uri: null };
    }

    const asset = cameraResult.assets[0];
    const savedUri = await persistImageToSubdirectoryAsync(
      asset.uri,
      VEHICLES_SUBDIRECTORY,
      'vehicle',
      asset.fileName
    );
    return { status: 'picked', uri: savedUri };
  }

  const libraryPermission =
    await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!libraryPermission.granted) {
    return {
      status: 'permission_denied',
      uri: null,
      message: 'Photo library permission is required to select a vehicle photo.',
    };
  }

  const libraryResult = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });

  if (libraryResult.canceled || libraryResult.assets.length === 0) {
    return { status: 'canceled', uri: null };
  }

  const asset = libraryResult.assets[0];
  const savedUri = await persistImageToSubdirectoryAsync(
    asset.uri,
    VEHICLES_SUBDIRECTORY,
    'vehicle',
    asset.fileName
  );
  return { status: 'picked', uri: savedUri };
}

export interface ShareReceiptOutcome {
  shared: boolean;
  message?: string;
}

export async function shareReceiptImageAsync(
  receiptUri: string,
  seededFallbackAsset: number
): Promise<ShareReceiptOutcome> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    return {
      shared: false,
      message: 'Native file sharing is not available on this device.',
    };
  }

  let localFileUri = receiptUri;

  if (receiptUri.startsWith('seed://')) {
    const [loadedAsset] = await Asset.loadAsync(seededFallbackAsset);
    const assetUri = loadedAsset?.localUri ?? loadedAsset?.uri;
    if (!assetUri) {
      return {
        shared: false,
        message: 'Unable to prepare receipt image for export.',
      };
    }

    if (Platform.OS !== 'web') {
      const exportTarget = new File(Paths.cache, 'receipt-export.png');
      const sourceAssetFile = new File(assetUri);
      await sourceAssetFile.copy(exportTarget, { overwrite: true });
      localFileUri = exportTarget.uri;
    } else {
      localFileUri = assetUri;
    }
  }

  await Sharing.shareAsync(localFileUri, {
    dialogTitle: 'Export service receipt',
    mimeType: localFileUri.toLowerCase().endsWith('.png')
      ? 'image/png'
      : 'image/jpeg',
  });

  return { shared: true };
}
