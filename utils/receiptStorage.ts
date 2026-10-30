import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type ReceiptCaptureSource = 'camera' | 'library';

export interface ReceiptPickOutcome {
  status: 'picked' | 'canceled' | 'permission_denied';
  uri: string | null;
  message?: string;
}

const RECEIPTS_SUBDIRECTORY = 'receipts';

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

export async function persistReceiptToDocumentsAsync(
  sourceUri: string,
  fileNameHint?: string | null
): Promise<string> {
  if (Platform.OS === 'web') {
    return sourceUri;
  }

  const receiptsDirectory = new Directory(
    Paths.document,
    RECEIPTS_SUBDIRECTORY
  );
  receiptsDirectory.create({ intermediates: true, idempotent: true });

  const sourceFile = new File(sourceUri);
  const rawExtension =
    sourceFile.extension ||
    extractFileExtension(fileNameHint ?? sourceUri) ||
    '.jpg';
  const normalizedExtension = rawExtension.startsWith('.')
    ? rawExtension
    : `.${rawExtension}`;

  const uniqueName = `receipt-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}${normalizedExtension}`;

  const destinationFile = new File(receiptsDirectory, uniqueName);
  await sourceFile.copy(destinationFile, { overwrite: true });

  return destinationFile.uri;
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
