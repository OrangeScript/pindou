import { createNdArray } from '../vendor/perfect-pixel/ndarray-lite';
import { getPerfectPixel } from '../vendor/perfect-pixel/perfectPixelService';
import { SamplingMethod } from '../vendor/perfect-pixel/types';

export type PixelRefinerSamplingMethod = SamplingMethod;

export interface RefinedPixelImage {
  dataUrl: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  cellWidth: number;
  cellHeight: number;
  usedManualGrid: boolean;
}

export interface PixelRefinerOptions {
  samplingMethod: PixelRefinerSamplingMethod;
  manualColumns?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取这张图片，请尝试 JPG、PNG 或 WebP 格式。'));
    image.src = source;
  });
}

export async function refinePixelArt(
  source: string,
  options: PixelRefinerOptions
): Promise<RefinedPixelImage> {
  const image = await loadImage(source);
  if (image.naturalWidth < 4 || image.naturalHeight < 4) {
    throw new Error('图片尺寸太小，至少需要 4 × 4 像素。');
  }

  // Keep preprocessing identical to the official PerfectPixel web demo.
  const maxDim = 1024;
  const minThreshold = 64;
  const targetMin = 256;
  let workingWidth = image.naturalWidth;
  let workingHeight = image.naturalHeight;
  const minimumSide = Math.min(workingWidth, workingHeight);

  if (minimumSide < minThreshold) {
    const scaleFactor = Math.ceil((targetMin + 1) / minimumSide);
    workingWidth *= scaleFactor;
    workingHeight *= scaleFactor;
  }

  if (Math.max(workingWidth, workingHeight) > maxDim) {
    const scale = maxDim / Math.max(workingWidth, workingHeight);
    workingWidth = Math.round(workingWidth * scale);
    workingHeight = Math.round(workingHeight * scale);
  } else {
    workingWidth = Math.round(workingWidth);
    workingHeight = Math.round(workingHeight);
  }

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = workingWidth;
  sourceCanvas.height = workingHeight;
  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) throw new Error('浏览器无法创建图片处理画布。');

  if (workingWidth > image.naturalWidth) {
    sourceContext.imageSmoothingEnabled = false;
  }
  sourceContext.drawImage(image, 0, 0, workingWidth, workingHeight);

  const imageData = sourceContext.getImageData(0, 0, workingWidth, workingHeight);
  const inputData = new Float32Array(workingWidth * workingHeight * 4);
  for (let index = 0; index < imageData.data.length; index++) {
    inputData[index] = imageData.data[index];
  }

  const inputArray = createNdArray(inputData, [workingHeight, workingWidth, 4]);
  const manualGrid = options.manualColumns
    ? [
        clamp(Math.round(options.manualColumns), 2, 512),
        clamp(Math.round(options.manualColumns * workingHeight / workingWidth), 2, 512),
      ] as [number, number]
    : null;
  const perfectPixelResult = getPerfectPixel(inputArray, {
    sampleMethod: options.samplingMethod,
    gridSize: manualGrid,
  });

  if (perfectPixelResult.refinedW === null || perfectPixelResult.refinedH === null) {
    throw new Error('无法识别这张图片的像素网格，请填写“横向格数”后重试。');
  }

  const [resultHeight, resultWidth, resultChannels] = perfectPixelResult.scaled.shape;
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = resultWidth;
  outputCanvas.height = resultHeight;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) throw new Error('浏览器无法创建输出画布。');

  // Keep output conversion identical to the official PerfectPixel web demo.
  const outputImageData = outputContext.createImageData(resultWidth, resultHeight);
  for (let y = 0; y < resultHeight; y++) {
    for (let x = 0; x < resultWidth; x++) {
      const outputIndex = (y * resultWidth + x) * 4;
      if (resultChannels >= 3) {
        outputImageData.data[outputIndex] = perfectPixelResult.scaled.get(y, x, 0);
        outputImageData.data[outputIndex + 1] = perfectPixelResult.scaled.get(y, x, 1);
        outputImageData.data[outputIndex + 2] = perfectPixelResult.scaled.get(y, x, 2);
        outputImageData.data[outputIndex + 3] = resultChannels === 4
          ? perfectPixelResult.scaled.get(y, x, 3)
          : 255;
      } else {
        const value = perfectPixelResult.scaled.get(y, x, 0);
        outputImageData.data[outputIndex] = value;
        outputImageData.data[outputIndex + 1] = value;
        outputImageData.data[outputIndex + 2] = value;
        outputImageData.data[outputIndex + 3] = 255;
      }
    }
  }
  outputContext.putImageData(outputImageData, 0, 0);

  return {
    dataUrl: outputCanvas.toDataURL('image/png'),
    width: resultWidth,
    height: resultHeight,
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight,
    cellWidth: image.naturalWidth / resultWidth,
    cellHeight: image.naturalHeight / resultHeight,
    usedManualGrid: Boolean(manualGrid),
  };
}

export async function downloadRefinedPixelArt(
  result: RefinedPixelImage,
  sourceFileName: string,
  scale: number
): Promise<void> {
  const image = await loadImage(result.dataUrl);
  const safeScale = clamp(Math.round(scale), 1, 24);
  const canvas = document.createElement('canvas');
  canvas.width = result.width * safeScale;
  canvas.height = result.height * safeScale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建下载画布。');

  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(outputBlob => {
      if (outputBlob) resolve(outputBlob);
      else reject(new Error('无法生成下载图片。'));
    }, 'image/png');
  });
  const normalizedName = sourceFileName.trim() || '像素图片';
  const lastDotIndex = normalizedName.lastIndexOf('.');
  const sourceStem = lastDotIndex > 0 ? normalizedName.slice(0, lastDotIndex) : normalizedName;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${sourceStem}-像素净化-${result.width}x${result.height}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
