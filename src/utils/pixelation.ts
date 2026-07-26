import { transparentColorData, TRANSPARENT_KEY } from './pixelEditingUtils';

export enum PixelationMode {
  Dominant = 'dominant',
  Average = 'average',
}

export type ColorSystem = 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

export const MIN_GRID_GRANULARITY = 10;
export const MAX_GRID_GRANULARITY = 1000;
export const MAX_PROCESSING_CANVAS_SIDE = 4096;
export const MAX_PROCESSING_CANVAS_PIXELS = 16 * 1024 * 1024;

const DOMINANT_BUCKET_SIZE = 16;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface LabColor {
  L: number;
  a: number;
  b: number;
}

export interface PaletteColor {
  key: string;
  hex: string;
  rgb: RgbColor;
  lab?: LabColor;
}

export interface MappedPixel {
  key: string;
  color: string;
  isExternal?: boolean;
}

export interface ColorCountMap {
  [hexKey: string]: {
    count: number;
    color: string;
  };
}

export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number): number {
  const normalized = Math.max(0, Math.min(1, value));
  const srgb = normalized <= 0.0031308
    ? normalized * 12.92
    : 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055;
  return clampByte(srgb * 255);
}

function weightedLinearAverageToRgb(
  rLinear: number,
  gLinear: number,
  bLinear: number,
  weight: number
): RgbColor {
  return {
    r: linearToSrgb(rLinear / weight),
    g: linearToSrgb(gLinear / weight),
    b: linearToSrgb(bLinear / weight),
  };
}

function getDominantBucketKey(r: number, g: number, b: number): string {
  return [
    Math.floor(r / DOMINANT_BUCKET_SIZE),
    Math.floor(g / DOMINANT_BUCKET_SIZE),
    Math.floor(b / DOMINANT_BUCKET_SIZE),
  ].join(',');
}

export function getSafeProcessingDimensions(
  width: number,
  height: number
): { width: number; height: number; scale: number } {
  if (width <= 0 || height <= 0) {
    return { width: 1, height: 1, scale: 1 };
  }

  const sideScale = MAX_PROCESSING_CANVAS_SIDE / Math.max(width, height);
  const pixelScale = Math.sqrt(MAX_PROCESSING_CANVAS_PIXELS / (width * height));
  const scale = Math.min(1, sideScale, pixelScale);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

function calculateCellRepresentativeColor(
  imageData: ImageData,
  startX: number,
  startY: number,
  width: number,
  height: number,
  mode: PixelationMode
): RgbColor | null {
  const data = imageData.data;
  const imgWidth = imageData.width;
  const imgHeight = imageData.height;
  const endX = Math.min(imgWidth, startX + width);
  const endY = Math.min(imgHeight, startY + height);

  let rLinearSum = 0;
  let gLinearSum = 0;
  let bLinearSum = 0;
  let totalWeight = 0;
  let maxBucketWeight = 0;
  let dominantBucket: {
    rLinearSum: number;
    gLinearSum: number;
    bLinearSum: number;
    weight: number;
  } | null = null;
  const bucketMap = new Map<
    string,
    {
      rLinearSum: number;
      gLinearSum: number;
      bLinearSum: number;
      weight: number;
    }
  >();

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = (y * imgWidth + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 128) continue;

      const weight = alpha / 255;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const rLinear = srgbToLinear(r) * weight;
      const gLinear = srgbToLinear(g) * weight;
      const bLinear = srgbToLinear(b) * weight;

      totalWeight += weight;

      if (mode === PixelationMode.Average) {
        rLinearSum += rLinear;
        gLinearSum += gLinear;
        bLinearSum += bLinear;
      } else {
        const bucketKey = getDominantBucketKey(r, g, b);
        const bucket = bucketMap.get(bucketKey) ?? {
          rLinearSum: 0,
          gLinearSum: 0,
          bLinearSum: 0,
          weight: 0,
        };

        bucket.rLinearSum += rLinear;
        bucket.gLinearSum += gLinear;
        bucket.bLinearSum += bLinear;
        bucket.weight += weight;
        bucketMap.set(bucketKey, bucket);

        if (bucket.weight > maxBucketWeight) {
          maxBucketWeight = bucket.weight;
          dominantBucket = bucket;
        }
      }
    }
  }

  if (totalWeight === 0) {
    return null;
  }

  if (mode === PixelationMode.Average) {
    return weightedLinearAverageToRgb(rLinearSum, gLinearSum, bLinearSum, totalWeight);
  }

  return dominantBucket
    ? weightedLinearAverageToRgb(
        dominantBucket.rLinearSum,
        dominantBucket.gLinearSum,
        dominantBucket.bLinearSum,
        dominantBucket.weight
      )
    : null;
}

function rgbToXyz(rgb: RgbColor) {
  const r = srgbToLinear(rgb.r) * 100;
  const g = srgbToLinear(rgb.g) * 100;
  const b = srgbToLinear(rgb.b) * 100;

  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

  return { x, y, z };
}

function xyzToLab(x: number, y: number, z: number): LabColor {
  const refX = 95.047;
  const refY = 100.0;
  const refZ = 108.883;

  let xNorm = x / refX;
  let yNorm = y / refY;
  let zNorm = z / refZ;

  xNorm = xNorm > 0.008856 ? Math.pow(xNorm, 1 / 3) : 7.787 * xNorm + 16 / 116;
  yNorm = yNorm > 0.008856 ? Math.pow(yNorm, 1 / 3) : 7.787 * yNorm + 16 / 116;
  zNorm = zNorm > 0.008856 ? Math.pow(zNorm, 1 / 3) : 7.787 * zNorm + 16 / 116;

  return {
    L: 116 * yNorm - 16,
    a: 500 * (xNorm - yNorm),
    b: 200 * (yNorm - zNorm),
  };
}

export function rgbToLab(rgb: RgbColor): LabColor {
  const { x, y, z } = rgbToXyz(rgb);
  return xyzToLab(x, y, z);
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function normalizeHue(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function deltaE76(lab1: LabColor, lab2: LabColor): number {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function deltaE00(lab1: LabColor, lab2: LabColor): number {
  const kL = 1;
  const kC = 1;
  const kH = 1;
  const c1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
  const c2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);
  const avgC = (c1 + c2) / 2;
  const avgC7 = Math.pow(avgC, 7);
  const g = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + Math.pow(25, 7))));

  const a1Prime = (1 + g) * lab1.a;
  const a2Prime = (1 + g) * lab2.a;
  const c1Prime = Math.sqrt(a1Prime * a1Prime + lab1.b * lab1.b);
  const c2Prime = Math.sqrt(a2Prime * a2Prime + lab2.b * lab2.b);
  const h1Prime = c1Prime === 0 ? 0 : normalizeHue(radToDeg(Math.atan2(lab1.b, a1Prime)));
  const h2Prime = c2Prime === 0 ? 0 : normalizeHue(radToDeg(Math.atan2(lab2.b, a2Prime)));

  const deltaLPrime = lab2.L - lab1.L;
  const deltaCPrime = c2Prime - c1Prime;

  let deltahPrime = 0;
  if (c1Prime * c2Prime !== 0) {
    const hueDiff = h2Prime - h1Prime;
    if (Math.abs(hueDiff) <= 180) {
      deltahPrime = hueDiff;
    } else if (hueDiff > 180) {
      deltahPrime = hueDiff - 360;
    } else {
      deltahPrime = hueDiff + 360;
    }
  }

  const deltaHPrime = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(degToRad(deltahPrime / 2));
  const avgLPrime = (lab1.L + lab2.L) / 2;
  const avgCPrime = (c1Prime + c2Prime) / 2;

  let avgHPrime = h1Prime + h2Prime;
  if (c1Prime * c2Prime !== 0) {
    const hueDiff = Math.abs(h1Prime - h2Prime);
    if (hueDiff <= 180) {
      avgHPrime = (h1Prime + h2Prime) / 2;
    } else if (h1Prime + h2Prime < 360) {
      avgHPrime = (h1Prime + h2Prime + 360) / 2;
    } else {
      avgHPrime = (h1Prime + h2Prime - 360) / 2;
    }
  }

  const t =
    1 -
    0.17 * Math.cos(degToRad(avgHPrime - 30)) +
    0.24 * Math.cos(degToRad(2 * avgHPrime)) +
    0.32 * Math.cos(degToRad(3 * avgHPrime + 6)) -
    0.2 * Math.cos(degToRad(4 * avgHPrime - 63));
  const deltaTheta = 30 * Math.exp(-Math.pow((avgHPrime - 275) / 25, 2));
  const avgCPrime7 = Math.pow(avgCPrime, 7);
  const rC = 2 * Math.sqrt(avgCPrime7 / (avgCPrime7 + Math.pow(25, 7)));
  const sL =
    1 +
    (0.015 * Math.pow(avgLPrime - 50, 2)) /
      Math.sqrt(20 + Math.pow(avgLPrime - 50, 2));
  const sC = 1 + 0.045 * avgCPrime;
  const sH = 1 + 0.015 * avgCPrime * t;
  const rT = -Math.sin(degToRad(2 * deltaTheta)) * rC;

  const lTerm = deltaLPrime / (kL * sL);
  const cTerm = deltaCPrime / (kC * sC);
  const hTerm = deltaHPrime / (kH * sH);

  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm);
}

export function colorDistance(rgb1: RgbColor, rgb2: RgbColor): number {
  return deltaE00(rgbToLab(rgb1), rgbToLab(rgb2));
}

export function findClosestPaletteColor(
  targetRgb: RgbColor,
  palette: PaletteColor[]
): PaletteColor {
  if (!palette || palette.length === 0) {
    console.error('findClosestPaletteColor: Palette is empty or invalid.');
    return { key: 'ERR', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } };
  }

  const targetLab = rgbToLab(targetRgb);
  let minDistance = Infinity;
  let closestColor = palette[0];

  for (const paletteColor of palette) {
    if (!paletteColor.lab) {
      paletteColor.lab = rgbToLab(paletteColor.rgb);
    }

    const distance = deltaE00(targetLab, paletteColor.lab);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = paletteColor;
    }

    if (distance === 0) break;
  }

  return closestColor;
}

export function calculatePixelGrid(
  originalCtx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  N: number,
  M: number,
  palette: PaletteColor[],
  mode: PixelationMode,
  t1FallbackColor: PaletteColor
): MappedPixel[][] {
  console.log(`Calculating pixel grid with mode: ${mode}`);
  const mappedData: MappedPixel[][] = Array.from({ length: M }, () =>
    Array.from({ length: N }, () => ({
      key: t1FallbackColor.key,
      color: t1FallbackColor.hex,
      isExternal: false,
    }))
  );
  const cellWidthOriginal = imgWidth / N;
  const cellHeightOriginal = imgHeight / M;

  let fullImageData: ImageData;
  try {
    fullImageData = originalCtx.getImageData(0, 0, imgWidth, imgHeight);
  } catch (e) {
    console.error('Failed to get full image data:', e);
    return mappedData;
  }

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const startXOriginal = Math.floor(i * cellWidthOriginal);
      const startYOriginal = Math.floor(j * cellHeightOriginal);
      const endXOriginal = Math.min(imgWidth, Math.ceil((i + 1) * cellWidthOriginal));
      const endYOriginal = Math.min(imgHeight, Math.ceil((j + 1) * cellHeightOriginal));
      const currentCellWidth = Math.max(1, endXOriginal - startXOriginal);
      const currentCellHeight = Math.max(1, endYOriginal - startYOriginal);

      const representativeRgb = calculateCellRepresentativeColor(
        fullImageData,
        startXOriginal,
        startYOriginal,
        currentCellWidth,
        currentCellHeight,
        mode
      );

      if (representativeRgb) {
        const closestBead = findClosestPaletteColor(representativeRgb, palette);
        mappedData[j][i] = {
          key: closestBead.key,
          color: closestBead.hex,
          isExternal: false,
        };
      } else {
        mappedData[j][i] = { ...transparentColorData };
      }
    }
  }

  console.log(`Pixel grid calculation complete for mode: ${mode}`);
  return mappedData;
}

export function mergeSimilarMappedColors(
  initialMappedData: MappedPixel[][],
  palette: PaletteColor[],
  similarityThreshold: number
): MappedPixel[][] {
  const copiedData = initialMappedData.map(row =>
    row.map(cell => ({ ...cell, isExternal: cell.isExternal ?? false }))
  );

  if (similarityThreshold <= 0 || copiedData.length === 0 || palette.length === 0) {
    return copiedData;
  }

  const keyToColorDataMap = new Map<string, PaletteColor>();
  palette.forEach(color => keyToColorDataMap.set(color.key, color));

  const initialColorCounts = new Map<string, number>();
  copiedData.forEach(row => {
    row.forEach(cell => {
      if (cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
        initialColorCounts.set(cell.key, (initialColorCounts.get(cell.key) ?? 0) + 1);
      }
    });
  });

  const colorsByFrequency = Array.from(initialColorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
  const replacedColors = new Set<string>();
  const replacementByKey = new Map<string, PaletteColor>();

  for (let i = 0; i < colorsByFrequency.length; i++) {
    const currentKey = colorsByFrequency[i];
    if (replacedColors.has(currentKey)) continue;

    const currentColor = keyToColorDataMap.get(currentKey);
    if (!currentColor) continue;

    for (let j = i + 1; j < colorsByFrequency.length; j++) {
      const lowerFreqKey = colorsByFrequency[j];
      if (replacedColors.has(lowerFreqKey)) continue;

      const lowerFreqColor = keyToColorDataMap.get(lowerFreqKey);
      if (!lowerFreqColor) continue;

      if (colorDistance(currentColor.rgb, lowerFreqColor.rgb) < similarityThreshold) {
        replacedColors.add(lowerFreqKey);
        replacementByKey.set(lowerFreqKey, currentColor);
      }
    }
  }

  if (replacementByKey.size === 0) {
    return copiedData;
  }

  return copiedData.map(row =>
    row.map(cell => {
      if (!cell || cell.isExternal) return cell;

      const replacement = replacementByKey.get(cell.key);
      return replacement
        ? {
            key: replacement.key,
            color: replacement.hex,
            isExternal: false,
          }
        : cell;
    })
  );
}

export function countMappedColors(mappedData: MappedPixel[][]): {
  colorCounts: ColorCountMap;
  totalCount: number;
} {
  const colorCounts: ColorCountMap = {};
  let totalCount = 0;

  mappedData.forEach(row => {
    row.forEach(cell => {
      if (cell && cell.color && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
        const hexKey = cell.color.toUpperCase();
        if (!colorCounts[hexKey]) {
          colorCounts[hexKey] = { count: 0, color: hexKey };
        }
        colorCounts[hexKey].count++;
        totalCount++;
      }
    });
  });

  return { colorCounts, totalCount };
}
