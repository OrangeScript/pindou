import { transparentColorData } from './pixelEditingUtils';

// 定义像素化模式
export enum PixelationMode {
  Dominant = 'dominant', // 卡通模式（主色）
  Average = 'average',   // 真实模式（平均色）
}

// 定义色号系统类型
export type ColorSystem = 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

// --- 必要的类型定义 ---
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
  lab?: LabColor; // 核心优化：用于缓存计算后的 LAB 值，避免重复计算
}

export interface PaletteColor {
  key: string;
  hex: string;
  rgb: RgbColor;
}

export interface MappedPixel {
  key: string;
  color: string;
  isExternal?: boolean;
}

// --- 辅助函数 ---

// 转换 Hex 到 RGB
export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// 计算颜色距离
export function colorDistance(rgb1: RgbColor, rgb2: RgbColor): number {
  const dr = rgb1.r - rgb2.r;
  const dg = rgb1.g - rgb2.g;
  const db = rgb1.b - rgb2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// 查找最接近的颜色



// --- 核心像素化计算逻辑 ---

/**
 * 计算图像指定区域的代表色（根据所选模式）
 * @param imageData 包含像素数据的 ImageData 对象
 * @param startX 区域起始 X 坐标
 * @param startY 区域起始 Y 坐标
 * @param width 区域宽度
 * @param height 区域高度
 * @param mode 计算模式 ('dominant' 或 'average')
 * @returns 代表色的 RGB 对象，或 null（如果区域无效或全透明）
 */
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
    let rSum = 0, gSum = 0, bSum = 0;
    let pixelCount = 0;
    const colorCountsInCell: { [key: string]: number } = {};
    let dominantColorRgb: RgbColor | null = null;
    let maxCount = 0;

    const endX = startX + width;
    const endY = startY + height;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const index = (y * imgWidth + x) * 4;
            // 检查 alpha 通道，忽略完全透明的像素
            if (data[index + 3] < 128) continue;

            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];

            pixelCount++;

            if (mode === PixelationMode.Average) {
                rSum += r;
                gSum += g;
                bSum += b;
            } else { // Dominant mode
                const colorKey = `${r},${g},${b}`;
                colorCountsInCell[colorKey] = (colorCountsInCell[colorKey] || 0) + 1;
                if (colorCountsInCell[colorKey] > maxCount) {
                    maxCount = colorCountsInCell[colorKey];
                    dominantColorRgb = { r, g, b };
                }
            }
        }
    }

    if (pixelCount === 0) {
        return null; // 区域内没有不透明像素
    }

    if (mode === PixelationMode.Average) {
        return {
            r: Math.round(rSum / pixelCount),
            g: Math.round(gSum / pixelCount),
            b: Math.round(bSum / pixelCount),
        };
    } else { // Dominant mode
        return dominantColorRgb; // 可能为 null 如果只有一个透明像素
    }
}

// --- 颜色空间转换核心逻辑 ---

// RGB 转 XYZ (基于 D65 标准光源)
function rgbToXyz(rgb: RgbColor) {
  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  // 伽马反校正
  r = r > 0.04045 ? Math.pow(((r + 0.055) / 1.055), 2.4) : (r / 12.92);
  g = g > 0.04045 ? Math.pow(((g + 0.055) / 1.055), 2.4) : (g / 12.92);
  b = b > 0.04045 ? Math.pow(((b + 0.055) / 1.055), 2.4) : (b / 12.92);

  r *= 100;
  g *= 100;
  b *= 100;

  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

  return { x, y, z };
}

// XYZ 转 LAB
function xyzToLab(x: number, y: number, z: number): LabColor {
  // D65 参考白点
  const refX = 95.047;
  const refY = 100.000;
  const refZ = 108.883;

  let xNorm = x / refX;
  let yNorm = y / refY;
  let zNorm = z / refZ;

  xNorm = xNorm > 0.008856 ? Math.pow(xNorm, 1/3) : (7.787 * xNorm) + (16 / 116);
  yNorm = yNorm > 0.008856 ? Math.pow(yNorm, 1/3) : (7.787 * yNorm) + (16 / 116);
  zNorm = zNorm > 0.008856 ? Math.pow(zNorm, 1/3) : (7.787 * zNorm) + (16 / 116);

  const L = (116 * yNorm) - 16;
  const a = 500 * (xNorm - yNorm);
  const b = 200 * (yNorm - zNorm);

  return { L, a, b };
}

// 完整的 RGB 转 LAB 封装
export function rgbToLab(rgb: RgbColor): LabColor {
  const { x, y, z } = rgbToXyz(rgb);
  return xyzToLab(x, y, z);
}

/**
 * 根据原始图像数据、网格尺寸、调色板和模式计算像素化网格数据。
 * @param originalCtx 原始图像的 Canvas 2D Context
 * @param imgWidth 原始图像宽度
 * @param imgHeight 原始图像高度
 * @param N 网格横向数量
 * @param M 网格纵向数量
 * @param palette 当前使用的调色板
 * @param mode 像素化模式 (Dominant/Average)
 * @param t1FallbackColor T1 或其他备用颜色数据
 * @returns 计算后的 MappedPixel 网格数据
 */
export function calculatePixelGrid(
    originalCtx: CanvasRenderingContext2D,
    imgWidth: number,
    imgHeight: number,
    N: number,
    M: number,
    palette: PaletteColor[],
    mode: PixelationMode,
    t1FallbackColor: PaletteColor // 传入备用色
): MappedPixel[][] {
    console.log(`Calculating pixel grid with mode: ${mode}`);
    const mappedData: MappedPixel[][] = Array(M).fill(null).map(() => Array(N).fill({ key: t1FallbackColor.key, color: t1FallbackColor.hex }));
    const cellWidthOriginal = imgWidth / N;
    const cellHeightOriginal = imgHeight / M;

    let fullImageData: ImageData | null = null;
    try {
        fullImageData = originalCtx.getImageData(0, 0, imgWidth, imgHeight);
    } catch (e) {
        console.error("Failed to get full image data:", e);
        // 如果无法获取图像数据，返回一个空的或默认的网格
        return mappedData;
    }

    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const startXOriginal = Math.floor(i * cellWidthOriginal);
            const startYOriginal = Math.floor(j * cellHeightOriginal);
            // 计算精确的单元格结束位置，避免超出图像边界
            const endXOriginal = Math.min(imgWidth, Math.ceil((i + 1) * cellWidthOriginal));
            const endYOriginal = Math.min(imgHeight, Math.ceil((j + 1) * cellHeightOriginal));
            // 计算实际的单元格宽高
            const currentCellWidth = Math.max(1, endXOriginal - startXOriginal);
            const currentCellHeight = Math.max(1, endYOriginal - startYOriginal);

            // 使用提取的函数计算代表色
            const representativeRgb = calculateCellRepresentativeColor(
                fullImageData,
                startXOriginal,
                startYOriginal,
                currentCellWidth,
                currentCellHeight,
                mode
            );

            let finalCellColorData: MappedPixel;
            if (representativeRgb) {
                const closestBead = findClosestPaletteColor(representativeRgb, palette);
                finalCellColorData = { key: closestBead.key, color: closestBead.hex };
            } else {
                // 如果单元格为空或全透明，标记为透明/外部
                finalCellColorData = { ...transparentColorData };
            }
            mappedData[j][i] = finalCellColorData;
        }
    }
    console.log(`Pixel grid calculation complete for mode: ${mode}`);
    return mappedData;
} 

// --- 颜色匹配逻辑 ---

// 计算 Delta E 76 色差 (LAB 空间下的欧几里得距离)
export function deltaE76(lab1: LabColor, lab2: LabColor): number {
  const weightL = 1.25; 
  
  const dL = (lab1.L - lab2.L) * weightL; 
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  
  return Math.sqrt(dL * dL + da * da + db * db);
}

// 查找最接近的颜色 (带性能优化)
export function findClosestPaletteColor(
  targetRgb: RgbColor,
  palette: PaletteColor[]
): PaletteColor {
  if (!palette || palette.length === 0) {
      console.error("findClosestPaletteColor: Palette is empty or invalid!");
      return { key: 'ERR', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } };
  }

  // 1. 将当前网格的目标颜色转为 LAB
  const targetLab = rgbToLab(targetRgb);

  let minDistance = Infinity;
  let closestColor = palette[0];

  for (const paletteColor of palette) {
    // 2. 性能优化核心：按需计算并缓存调色板的 LAB 值
    // 这样每个色号只会在第一次遇到时计算一次，后续全部直接读取
    if (!paletteColor.lab) {
        paletteColor.lab = rgbToLab(paletteColor.rgb);
    }

    // 3. 在 LAB 空间计算距离
    const distance = deltaE76(targetLab, paletteColor.lab);

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = paletteColor;
    }
    
    // 如果完全匹配，直接提前退出
    if (distance === 0) break; 
  }
  
  return closestColor;
}