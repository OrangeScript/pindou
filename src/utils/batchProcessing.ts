import {
  MappedPixel,
  PaletteColor,
  PixelationMode,
  calculatePixelGrid,
  getSafeProcessingDimensions,
  mergeSimilarMappedColors,
  countMappedColors,
} from './pixelation';
import { downloadImage } from './imageDownloader';
import { GridDownloadOptions } from '../types/downloadTypes';
import { ColorSystem } from './colorSystemUtils';

export interface BatchFileItem {
  id: string;
  file: File;
  name: string;
  granularity: number | null;
  similarityThreshold: number | null;
  pixelationMode: PixelationMode | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMessage?: string;
}

export interface BatchGlobalSettings {
  granularity: number;
  similarityThreshold: number;
  pixelationMode: PixelationMode;
}

export interface BatchProcessResult {
  fileId: string;
  fileName: string;
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  colorCounts: { [key: string]: { count: number; color: string } };
  totalBeadCount: number;
}

export function processImageFile(
  file: File,
  granularity: number,
  similarityThreshold: number,
  pixelationMode: PixelationMode,
  palette: PaletteColor[]
): Promise<BatchProcessResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error(`无法读取文件: ${file.name}`));

    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        reject(new Error(`文件内容为空: ${file.name}`));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error(`无法加载图片: ${file.name}`));

      img.onload = () => {
        try {
          const processingDimensions = getSafeProcessingDimensions(img.width, img.height);
          const canvas = document.createElement('canvas');
          canvas.width = processingDimensions.width;
          canvas.height = processingDimensions.height;

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            reject(new Error('无法创建 Canvas 上下文'));
            return;
          }

          ctx.drawImage(img, 0, 0, processingDimensions.width, processingDimensions.height);

          const aspectRatio = img.height / img.width;
          const N = granularity;
          const M = Math.max(1, Math.round(N * aspectRatio));
          const t1FallbackColor =
            palette.find(p => p.key === 'T1') ||
            palette.find(p => p.hex.toUpperCase() === '#FFFFFF') ||
            palette[0];

          const initialMappedData = calculatePixelGrid(
            ctx,
            processingDimensions.width,
            processingDimensions.height,
            N,
            M,
            palette,
            pixelationMode,
            t1FallbackColor
          );
          const mappedPixelData = mergeSimilarMappedColors(
            initialMappedData,
            palette,
            similarityThreshold
          );
          const { colorCounts, totalCount } = countMappedColors(mappedPixelData);

          resolve({
            fileId: file.name,
            fileName: file.name,
            mappedPixelData,
            gridDimensions: { N, M },
            colorCounts,
            totalBeadCount: totalCount,
          });
        } catch (err) {
          reject(new Error(`处理图片失败: ${file.name} - ${err}`));
        }
      };

      img.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
}

export async function batchProcessAndDownload(
  files: BatchFileItem[],
  globalSettings: BatchGlobalSettings,
  palette: PaletteColor[],
  downloadOptions: GridDownloadOptions,
  selectedColorSystem: ColorSystem,
  onProgress: (fileId: string, status: 'processing' | 'done' | 'error', errorMessage?: string) => void
): Promise<void> {
  for (const item of files) {
    const granularity = item.granularity ?? globalSettings.granularity;
    const threshold = item.similarityThreshold ?? globalSettings.similarityThreshold;
    const mode = item.pixelationMode ?? globalSettings.pixelationMode;

    onProgress(item.id, 'processing');

    try {
      const result = await processImageFile(item.file, granularity, threshold, mode, palette);

      await downloadImage({
        mappedPixelData: result.mappedPixelData,
        gridDimensions: result.gridDimensions,
        colorCounts: result.colorCounts,
        totalBeadCount: result.totalBeadCount,
        options: downloadOptions,
        activeBeadPalette: palette,
        selectedColorSystem,
        sourceFileName: result.fileName,
      });

      onProgress(item.id, 'done');
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress(item.id, 'error', msg);
    }
  }
}
