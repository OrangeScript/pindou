import { GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getDisplayColorKey, getColorKeyByHex, ColorSystem } from './colorSystemUtils';

type ColorCounts = { [key: string]: { count: number; color: string } };

type RenderRange = {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
};

type SplitTile = RenderRange & {
  label: string;
  index: number;
};

type RenderRequest = {
  mappedPixelData: MappedPixel[][];
  range: RenderRange;
  options: GridDownloadOptions;
  selectedColorSystem: ColorSystem;
  preferredCellSize: number;
  fileName: string;
};

const MAX_CANVAS_SIDE = 16000;
const MAX_CANVAS_PIXELS = 180_000_000;
const FULL_IMAGE_CELL_SIZE = 30;
const SPLIT_IMAGE_CELL_SIZE = 36;
const PATTERN_FILE_SUFFIX = '-拼豆图纸';

export function buildPatternFileName(
  sourceFileName: string | null | undefined,
  extension: 'png' | 'csv',
  partIndex?: number
): string {
  const normalizedName = sourceFileName?.trim().replace(/\\/g, '/').split('/').pop();
  const lastDotIndex = normalizedName?.lastIndexOf('.') ?? -1;
  const sourceName = normalizedName
    ? lastDotIndex > 0
      ? normalizedName.slice(0, lastDotIndex)
      : normalizedName
    : '未命名';
  const partSuffix = partIndex === undefined ? '' : `-分图${partIndex}`;

  return `${sourceName}${PATTERN_FILE_SUFFIX}${partSuffix}.${extension}`;
}

function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000';
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const formattedHex = hex.replace(shorthandRegex, (_m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(formattedHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB);
    }
    return numA - numB;
  }
  return a.localeCompare(b);
}

function clampRange(range: RenderRange, dimensions: { N: number; M: number }): RenderRange {
  return {
    minCol: Math.max(0, Math.min(dimensions.N - 1, range.minCol)),
    maxCol: Math.max(0, Math.min(dimensions.N - 1, range.maxCol)),
    minRow: Math.max(0, Math.min(dimensions.M - 1, range.minRow)),
    maxRow: Math.max(0, Math.min(dimensions.M - 1, range.maxRow)),
  };
}

function getContentRange(
  mappedPixelData: MappedPixel[][],
  dimensions: { N: number; M: number },
  trimTransparent: boolean
): RenderRange {
  const { N, M } = dimensions;
  let minCol = N;
  let maxCol = -1;
  let minRow = M;
  let maxRow = -1;

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const cell = mappedPixelData[row]?.[col];
      if (cell && !cell.isExternal) {
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
      }
    }
  }

  if (maxCol === -1 || !trimTransparent) {
    return { minCol: 0, maxCol: N - 1, minRow: 0, maxRow: M - 1 };
  }

  return { minCol, maxCol, minRow, maxRow };
}

function countColorsInRange(mappedPixelData: MappedPixel[][], range: RenderRange): {
  colorCounts: ColorCounts;
  totalBeadCount: number;
} {
  const colorCounts: ColorCounts = {};
  let totalBeadCount = 0;

  for (let row = range.minRow; row <= range.maxRow; row++) {
    for (let col = range.minCol; col <= range.maxCol; col++) {
      const cell = mappedPixelData[row]?.[col];
      if (!cell || cell.isExternal) continue;

      const hexKey = cell.color.toUpperCase();
      if (!colorCounts[hexKey]) {
        colorCounts[hexKey] = { count: 0, color: hexKey };
      }
      colorCounts[hexKey].count++;
      totalBeadCount++;
    }
  }

  return { colorCounts, totalBeadCount };
}

function findAlignedSplit(min: number, max: number, interval: number): number {
  const firstCellAfterSplitMin = min + 1;
  const firstCellAfterSplitMax = max;
  const midpoint = (min + max + 1) / 2;
  const candidates: number[] = [];

  for (let boundary = firstCellAfterSplitMin; boundary <= firstCellAfterSplitMax; boundary++) {
    if (boundary % interval === 0) {
      candidates.push(boundary);
    }
  }

  if (candidates.length === 0) {
    return Math.max(firstCellAfterSplitMin, Math.min(firstCellAfterSplitMax, Math.round(midpoint)));
  }

  return candidates.reduce((best, current) =>
    Math.abs(current - midpoint) < Math.abs(best - midpoint) ? current : best
  );
}

function buildFourSplitRanges(range: RenderRange, gridInterval: number): SplitTile[] {
  const colCount = range.maxCol - range.minCol + 1;
  const rowCount = range.maxRow - range.minRow + 1;

  if (colCount < 2 || rowCount < 2) {
    return [{ ...range, label: 'full', index: 1 }];
  }

  const safeInterval = Math.max(1, gridInterval);
  const splitCol = findAlignedSplit(range.minCol, range.maxCol, safeInterval);
  const splitRow = findAlignedSplit(range.minRow, range.maxRow, safeInterval);

  return [
    {
      minCol: range.minCol,
      maxCol: splitCol - 1,
      minRow: range.minRow,
      maxRow: splitRow - 1,
      label: 'top-left',
      index: 1,
    },
    {
      minCol: splitCol,
      maxCol: range.maxCol,
      minRow: range.minRow,
      maxRow: splitRow - 1,
      label: 'top-right',
      index: 2,
    },
    {
      minCol: range.minCol,
      maxCol: splitCol - 1,
      minRow: splitRow,
      maxRow: range.maxRow,
      label: 'bottom-left',
      index: 3,
    },
    {
      minCol: splitCol,
      maxCol: range.maxCol,
      minRow: splitRow,
      maxRow: range.maxRow,
      label: 'bottom-right',
      index: 4,
    },
  ].filter(tile => tile.minCol <= tile.maxCol && tile.minRow <= tile.maxRow);
}

function getSafeCellSize(cols: number, rows: number, preferredCellSize: number): number {
  const maxSideCellSize = Math.floor((MAX_CANVAS_SIDE - 280) / Math.max(cols, rows));
  const maxPixelCellSize = Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, cols * rows)));
  return Math.max(1, Math.min(preferredCellSize, Math.max(1, maxSideCellSize), Math.max(1, maxPixelCellSize)));
}

function triggerCanvasDownload(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('无法生成 PNG 图片'));
        return;
      }

      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.download = fileName;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

function drawDownloadCanvas({
  mappedPixelData,
  range,
  options,
  selectedColorSystem,
  preferredCellSize,
  fileName,
}: RenderRequest): { canvas: HTMLCanvasElement; fileName: string } {
  const { showGrid, gridInterval, showCoordinates, gridLineColor, includeStats, showCellNumbers = true } = options;
  const renderCols = range.maxCol - range.minCol + 1;
  const renderRows = range.maxRow - range.minRow + 1;
  const downloadCellSize = getSafeCellSize(renderCols, renderRows, preferredCellSize);
  const axisLabelSize = showCoordinates ? Math.max(32, Math.floor(downloadCellSize * 1.15)) : 0;
  const fontSize = Math.max(7, Math.floor(downloadCellSize * 0.38));
  const statsTopMargin = includeStats ? 16 : 0;
  const gridWidth = renderCols * downloadCellSize;
  const gridHeight = renderRows * downloadCellSize;
  const extraLeftMargin = showCoordinates ? Math.max(14, fontSize * 2) : 0;
  const extraRightMargin = showCoordinates ? Math.max(14, fontSize * 2) : 0;
  const extraTopMargin = Math.max(16, showCoordinates ? fontSize : 0);
  const extraBottomMargin = showCoordinates ? Math.max(14, fontSize) : 0;
  const width = gridWidth + axisLabelSize * 2 + extraLeftMargin + extraRightMargin;
  const { colorCounts, totalBeadCount } = countColorsInRange(mappedPixelData, range);
  const statsInfo = calculateStatsLayout(width, colorCounts, includeStats);
  const height =
    gridHeight +
    axisLabelSize * 2 +
    extraTopMargin +
    extraBottomMargin +
    statsInfo.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建下载画布');
  }

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const gridOriginX = extraLeftMargin + axisLabelSize;
  const gridOriginY = extraTopMargin + axisLabelSize;

  if (showCoordinates) {
    drawCoordinateBands(ctx, {
      gridOriginX,
      gridOriginY,
      gridWidth,
      gridHeight,
      axisLabelSize,
      downloadCellSize,
      renderCols,
      renderRows,
      gridInterval,
      fontSize,
    });
  }

  drawCells(ctx, {
    mappedPixelData,
    range,
    selectedColorSystem,
    gridOriginX,
    gridOriginY,
    downloadCellSize,
    renderCols,
    renderRows,
    showCellNumbers,
    fontSize,
  });

  drawGrid(ctx, {
    gridOriginX,
    gridOriginY,
    gridWidth,
    gridHeight,
    downloadCellSize,
    renderCols,
    renderRows,
    showGrid,
    gridInterval,
    gridLineColor,
  });

  drawWatermark(ctx, gridOriginX, gridOriginY, downloadCellSize);

  if (includeStats) {
    drawStats(ctx, {
      y: gridOriginY + gridHeight + axisLabelSize + statsTopMargin,
      width,
      colorCounts,
      totalBeadCount,
      selectedColorSystem,
      layout: statsInfo,
    });
  }

  return { canvas, fileName };
}

function calculateStatsLayout(width: number, colorCounts: ColorCounts, includeStats: boolean) {
  const colorKeys = Object.keys(colorCounts);
  if (!includeStats || colorKeys.length === 0) {
    return {
      height: 0,
      fontSize: 13,
      swatchSize: 18,
      rowHeight: 30,
      columns: 1,
      itemWidth: width,
      padding: 20,
      titleHeight: 36,
    };
  }

  const padding = 20;
  const availableWidth = Math.max(1, width - padding * 2);
  const widthFactor = Math.min(2.4, Math.max(0, availableWidth - 350) / 700);
  const fontSize = Math.floor(13 + widthFactor * 8);
  const swatchSize = Math.floor(18 + widthFactor * 8);
  const minColumnWidth = Math.max(170, swatchSize + fontSize * 7 + 34);
  const columns = Math.max(1, Math.floor(availableWidth / minColumnWidth));
  const rows = Math.ceil(colorKeys.length / columns);
  const rowHeight = swatchSize + 12;
  const titleHeight = 38;

  return {
    height: titleHeight + rows * rowHeight + padding,
    fontSize,
    swatchSize,
    rowHeight,
    columns,
    itemWidth: Math.floor(availableWidth / columns),
    padding,
    titleHeight,
  };
}

function drawCoordinateBands(
  ctx: CanvasRenderingContext2D,
  args: {
    gridOriginX: number;
    gridOriginY: number;
    gridWidth: number;
    gridHeight: number;
    axisLabelSize: number;
    downloadCellSize: number;
    renderCols: number;
    renderRows: number;
    gridInterval: number;
    fontSize: number;
  }
) {
  const {
    gridOriginX,
    gridOriginY,
    gridWidth,
    gridHeight,
    axisLabelSize,
    downloadCellSize,
    renderCols,
    renderRows,
    gridInterval,
    fontSize,
  } = args;

  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(gridOriginX, gridOriginY - axisLabelSize, gridWidth, axisLabelSize);
  ctx.fillRect(gridOriginX, gridOriginY + gridHeight, gridWidth, axisLabelSize);
  ctx.fillRect(gridOriginX - axisLabelSize, gridOriginY, axisLabelSize, gridHeight);
  ctx.fillRect(gridOriginX + gridWidth, gridOriginY, axisLabelSize, gridHeight);

  ctx.fillStyle = '#333333';
  ctx.font = `${Math.max(10, fontSize)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < renderCols; i++) {
    if (i % gridInterval === 0 || i === renderCols - 1) {
      const x = gridOriginX + i * downloadCellSize + downloadCellSize / 2;
      ctx.fillText(i.toString(), x, gridOriginY - axisLabelSize / 2);
      ctx.fillText(i.toString(), x, gridOriginY + gridHeight + axisLabelSize / 2);
    }
  }

  for (let j = 0; j < renderRows; j++) {
    if (j % gridInterval === 0 || j === renderRows - 1) {
      const y = gridOriginY + j * downloadCellSize + downloadCellSize / 2;
      ctx.fillText(j.toString(), gridOriginX - axisLabelSize / 2, y);
      ctx.fillText(j.toString(), gridOriginX + gridWidth + axisLabelSize / 2, y);
    }
  }

  ctx.strokeStyle = '#AAAAAA';
  ctx.lineWidth = 1;
  ctx.strokeRect(gridOriginX, gridOriginY, gridWidth, gridHeight);
}

function drawCells(
  ctx: CanvasRenderingContext2D,
  args: {
    mappedPixelData: MappedPixel[][];
    range: RenderRange;
    selectedColorSystem: ColorSystem;
    gridOriginX: number;
    gridOriginY: number;
    downloadCellSize: number;
    renderCols: number;
    renderRows: number;
    showCellNumbers: boolean;
    fontSize: number;
  }
) {
  const {
    mappedPixelData,
    range,
    selectedColorSystem,
    gridOriginX,
    gridOriginY,
    downloadCellSize,
    renderCols,
    renderRows,
    showCellNumbers,
    fontSize,
  } = args;

  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let row = 0; row < renderRows; row++) {
    for (let col = 0; col < renderCols; col++) {
      const origRow = range.minRow + row;
      const origCol = range.minCol + col;
      const cellData = mappedPixelData[origRow]?.[origCol];
      const x = gridOriginX + col * downloadCellSize;
      const y = gridOriginY + row * downloadCellSize;

      if (cellData && !cellData.isExternal) {
        const cellColor = cellData.color || '#FFFFFF';
        ctx.fillStyle = cellColor;
        ctx.fillRect(x, y, downloadCellSize, downloadCellSize);

        if (showCellNumbers && downloadCellSize >= 12) {
          const cellKey = getDisplayColorKey(cellColor, selectedColorSystem);
          ctx.fillStyle = getContrastColor(cellColor);
          ctx.fillText(cellKey, x + downloadCellSize / 2, y + downloadCellSize / 2);
        }
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y, downloadCellSize, downloadCellSize);
      }

      ctx.strokeStyle = '#DDDDDD';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, y + 0.5, downloadCellSize, downloadCellSize);
    }
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  args: {
    gridOriginX: number;
    gridOriginY: number;
    gridWidth: number;
    gridHeight: number;
    downloadCellSize: number;
    renderCols: number;
    renderRows: number;
    showGrid: boolean;
    gridInterval: number;
    gridLineColor: string;
  }
) {
  const {
    gridOriginX,
    gridOriginY,
    gridWidth,
    gridHeight,
    renderCols,
    renderRows,
    showGrid,
    gridInterval,
    gridLineColor,
  } = args;

  if (showGrid) {
    ctx.strokeStyle = gridLineColor;
    ctx.lineWidth = 1.5;

    for (let col = 1; col < renderCols; col++) {
      if (col % gridInterval === 0) {
        const x = gridOriginX + col * args.downloadCellSize;
        ctx.beginPath();
        ctx.moveTo(x, gridOriginY);
        ctx.lineTo(x, gridOriginY + renderRows * args.downloadCellSize);
        ctx.stroke();
      }
    }

    for (let row = 1; row < renderRows; row++) {
      if (row % gridInterval === 0) {
        const y = gridOriginY + row * args.downloadCellSize;
        ctx.beginPath();
        ctx.moveTo(gridOriginX, y);
        ctx.lineTo(gridOriginX + renderCols * args.downloadCellSize, y);
        ctx.stroke();
      }
    }
  }

  // 外轮廓
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gridOriginX + 0.5, gridOriginY + 0.5, gridWidth, gridHeight);
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  gridOriginX: number,
  gridOriginY: number,
  downloadCellSize: number
) {
  const fontSize = Math.max(10, Math.floor(downloadCellSize * 0.45));
  const text = '@T^T';
  ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const metrics = ctx.measureText(text);
  const padding = 4;
  const x = gridOriginX + 14;
  const y = gridOriginY + fontSize + 14;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.roundRect(x - padding, y - fontSize - padding, metrics.width + padding * 2, fontSize + padding * 2, 3);
  ctx.fill();

  ctx.fillStyle = '#6B7280';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x, y);
}

function drawStats(
  ctx: CanvasRenderingContext2D,
  args: {
    y: number;
    width: number;
    colorCounts: ColorCounts;
    totalBeadCount: number;
    selectedColorSystem: ColorSystem;
    layout: ReturnType<typeof calculateStatsLayout>;
  }
) {
  const { y, width, colorCounts, totalBeadCount, selectedColorSystem, layout } = args;
  const colorKeys = Object.keys(colorCounts).sort(sortColorKeys);
  if (colorKeys.length === 0) return;

  ctx.fillStyle = '#333333';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(14, layout.fontSize + 2)}px sans-serif`;
  ctx.fillText('用色统计', layout.padding, y + 16);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#666666';
  ctx.font = `${Math.max(12, layout.fontSize)}px sans-serif`;
  ctx.fillText(`共 ${totalBeadCount} 颗`, width - layout.padding, y + 16);

  ctx.strokeStyle = '#EEEEEE';
  ctx.beginPath();
  ctx.moveTo(layout.padding, y + 32);
  ctx.lineTo(width - layout.padding, y + 32);
  ctx.stroke();

  ctx.font = `${layout.fontSize}px sans-serif`;
  colorKeys.forEach((key, index) => {
    const rowIndex = Math.floor(index / layout.columns);
    const colIndex = index % layout.columns;
    const itemX = layout.padding + colIndex * layout.itemWidth;
    const rowY = y + layout.titleHeight + rowIndex * layout.rowHeight + layout.rowHeight / 2;
    const cellData = colorCounts[key];

    ctx.fillStyle = cellData.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.arc(itemX + layout.swatchSize / 2, rowY, layout.swatchSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const colorCode = getColorKeyByHex(key, selectedColorSystem);
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.fillText(colorCode, itemX + layout.swatchSize + 8, rowY);

    const codeWidth = ctx.measureText(colorCode).width;
    ctx.fillStyle = '#888888';
    ctx.fillText(`x${cellData.count}`, itemX + layout.swatchSize + 13 + codeWidth, rowY);
  });

}

export function exportCsvData({
  mappedPixelData,
  gridDimensions,
  sourceFileName,
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  sourceFileName: string | null;
}): void {
  if (!mappedPixelData || !gridDimensions) {
    console.error('导出失败: 映射数据或尺寸无效。');
    alert('无法导出 CSV，数据未生成或无效。');
    return;
  }

  const { N, M } = gridDimensions;
  const csvLines: string[] = [];

  for (let row = 0; row < M; row++) {
    const rowData: string[] = [];
    for (let col = 0; col < N; col++) {
      const cellData = mappedPixelData[row][col];
      rowData.push(cellData && !cellData.isExternal ? cellData.color : 'TRANSPARENT');
    }
    csvLines.push(rowData.join(','));
  }

  const csvContent = csvLines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', buildPatternFileName(sourceFileName, 'csv'));
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importCsvData(file: File): Promise<{
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error('无法读取文件内容'));
          return;
        }

        const lines = text.trim().split('\n');
        const M = lines.length;

        if (M === 0) {
          reject(new Error('CSV 文件为空'));
          return;
        }

        const firstRowData = lines[0].split(',');
        const N = firstRowData.length;

        if (N === 0) {
          reject(new Error('CSV 文件格式无效'));
          return;
        }

        const mappedPixelData: MappedPixel[][] = [];

        for (let row = 0; row < M; row++) {
          const rowData = lines[row].split(',');
          const mappedRow: MappedPixel[] = [];

          if (rowData.length !== N) {
            reject(new Error(`第 ${row + 1} 行的列数不匹配，期望 ${N} 列，实际 ${rowData.length} 列`));
            return;
          }

          for (let col = 0; col < N; col++) {
            const cellValue = rowData[col].trim();

            if (cellValue === 'TRANSPARENT' || cellValue === '') {
              mappedRow.push({
                key: 'TRANSPARENT',
                color: '#FFFFFF',
                isExternal: true,
              });
            } else {
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;
              if (!hexPattern.test(cellValue)) {
                reject(new Error(`第 ${row + 1} 行第 ${col + 1} 列的颜色值无效：${cellValue}`));
                return;
              }

              mappedRow.push({
                key: cellValue.toUpperCase(),
                color: cellValue.toUpperCase(),
                isExternal: false,
              });
            }
          }

          mappedPixelData.push(mappedRow);
        }

        resolve({
          mappedPixelData,
          gridDimensions: { N, M },
        });
      } catch (error) {
        reject(new Error(`解析 CSV 文件失败：${error}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };

    reader.readAsText(file, 'utf-8');
  });
}

function validateDownloadInput({
  mappedPixelData,
  gridDimensions,
  activeBeadPalette,
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  activeBeadPalette: PaletteColor[];
}): boolean {
  if (!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0) {
    console.error('下载失败: 映射数据或尺寸无效。');
    alert('无法下载图纸，数据未生成或无效。');
    return false;
  }
  return true;
}

export async function downloadImage({
  mappedPixelData,
  gridDimensions,
  options,
  activeBeadPalette,
  selectedColorSystem,
  sourceFileName,
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: ColorCounts | null;
  totalBeadCount: number;
  options: GridDownloadOptions;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: ColorSystem;
  sourceFileName: string | null;
}): Promise<void> {
  if (!validateDownloadInput({ mappedPixelData, gridDimensions, activeBeadPalette })) return;
  if (!mappedPixelData || !gridDimensions) return;

  const range = getContentRange(mappedPixelData, gridDimensions, options.trimTransparent);
  const { canvas, fileName } = drawDownloadCanvas({
    mappedPixelData,
    range,
    options,
    selectedColorSystem,
    preferredCellSize: FULL_IMAGE_CELL_SIZE,
    fileName: buildPatternFileName(sourceFileName, 'png'),
  });

  try {
    await triggerCanvasDownload(canvas, fileName);

    if (options.exportCsv) {
      exportCsvData({
        mappedPixelData,
        gridDimensions,
        sourceFileName,
      });
    }
  } catch (e) {
    console.error('下载图纸失败:', e);
    alert('无法生成图纸下载链接。');
  }
}

export async function downloadSplitImages({
  mappedPixelData,
  gridDimensions,
  options,
  activeBeadPalette,
  selectedColorSystem,
  sourceFileName,
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: ColorCounts | null;
  totalBeadCount: number;
  options: GridDownloadOptions;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: ColorSystem;
  sourceFileName: string | null;
}): Promise<void> {
  if (!validateDownloadInput({ mappedPixelData, gridDimensions, activeBeadPalette })) return;
  if (!mappedPixelData || !gridDimensions) return;

  const baseRange = getContentRange(mappedPixelData, gridDimensions, options.trimTransparent);
  const ranges = buildFourSplitRanges(clampRange(baseRange, gridDimensions), options.gridInterval);

  try {
    for (const range of ranges) {
      const { canvas, fileName } = drawDownloadCanvas({
        mappedPixelData,
        range,
        options,
        selectedColorSystem,
        preferredCellSize: SPLIT_IMAGE_CELL_SIZE,
        fileName: buildPatternFileName(sourceFileName, 'png', range.index),
      });

      await triggerCanvasDownload(canvas, fileName);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } catch (e) {
    console.error('下载四分图失败:', e);
    alert('无法生成四分图下载链接。');
  }
}
