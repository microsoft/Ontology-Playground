export const MAX_EXPORT_DIMENSION = 8192;
export const MAX_EXPORT_PIXEL_AREA = 16_777_216;
export const BASE_EXPORT_SCALE = 2;
export const MIN_PNG_BYTES = 67;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export interface PngExportBounds {
  maxWidth: number;
  maxHeight: number;
}

export interface PngExportOptions extends PngExportBounds {
  full: true;
  bg: string;
  output: 'blob-promise';
}

export function computePngExportBounds(
  width: number,
  height: number,
  desiredScale = BASE_EXPORT_SCALE,
  maxDimension = MAX_EXPORT_DIMENSION,
  maxPixelArea = MAX_EXPORT_PIXEL_AREA,
): PngExportBounds {
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    throw new RangeError('Graph export bounds must be finite positive values.');
  }
  if (
    !Number.isFinite(desiredScale)
    || !Number.isFinite(maxDimension)
    || !Number.isFinite(maxPixelArea)
    || desiredScale <= 0
    || maxDimension <= 0
    || maxPixelArea <= 0
  ) {
    throw new RangeError('Graph export limits must be finite positive values.');
  }

  const canvasWidth = Math.ceil(width);
  const canvasHeight = Math.ceil(height);
  const dimensionScale = Math.min(
    maxDimension / canvasWidth,
    maxDimension / canvasHeight,
  );
  const areaScale = Math.sqrt(
    maxPixelArea / (canvasWidth * canvasHeight),
  );
  const scale = Math.min(desiredScale, dimensionScale, areaScale);

  return {
    maxWidth: Math.max(1, Math.floor(canvasWidth * scale)),
    maxHeight: Math.max(1, Math.floor(canvasHeight * scale)),
  };
}

export function createPngExportOptions(
  width: number,
  height: number,
  bg: string,
): PngExportOptions {
  return {
    ...computePngExportBounds(width, height),
    full: true,
    bg,
    output: 'blob-promise',
  };
}

function readBlobPrefix(blob: Blob, length: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read PNG output.'));
    };
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('PNG output did not contain binary data.'));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob.slice(0, length));
  });
}

export async function isValidPngBlob(value: unknown): Promise<boolean> {
  if (
    !(value instanceof Blob)
    || value.type !== 'image/png'
    || value.size < MIN_PNG_BYTES
  ) {
    return false;
  }

  const bytes = await readBlobPrefix(value, PNG_SIGNATURE.length);
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
