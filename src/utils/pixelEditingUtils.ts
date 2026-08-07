import { MappedPixel } from './pixelation';
import { BrushShape, GridCellPosition } from '../types/manualEditor';

// 透明键定义
export const TRANSPARENT_KEY = 'ERASE';

// 透明色数据
export const transparentColorData: MappedPixel = { 
  key: TRANSPARENT_KEY, 
  color: '#FFFFFF', 
  isExternal: true 
};

function normalizeCell(cell: MappedPixel): MappedPixel {
  return cell.key === TRANSPARENT_KEY || cell.isExternal
    ? { ...transparentColorData }
    : { key: cell.key, color: cell.color, isExternal: false };
}

export function arePixelsEqual(first: MappedPixel, second: MappedPixel): boolean {
  const normalizedFirst = normalizeCell(first);
  const normalizedSecond = normalizeCell(second);
  return normalizedFirst.key === normalizedSecond.key
    && normalizedFirst.color.toUpperCase() === normalizedSecond.color.toUpperCase()
    && Boolean(normalizedFirst.isExternal) === Boolean(normalizedSecond.isExternal);
}

export function clonePixelData(pixelData: MappedPixel[][]): MappedPixel[][] {
  return pixelData.map(row => row.map(cell => ({ ...cell })));
}

function createPaintCell(color: MappedPixel): MappedPixel {
  return color.key === TRANSPARENT_KEY || color.isExternal
    ? { ...transparentColorData }
    : { key: color.key, color: color.color, isExternal: false };
}

/**
 * 在一组路径点上绘制可调大小的圆形或方形笔刷。仅复制真正发生变化的行，
 * 避免在大图纸上拖动时每个指针事件都深拷贝整张图。
 */
export function paintBrushStroke(
  pixelData: MappedPixel[][],
  points: GridCellPosition[],
  brushSize: number,
  brushShape: BrushShape,
  color: MappedPixel
): { newPixelData: MappedPixel[][]; changedCount: number } {
  if (points.length === 0 || pixelData.length === 0) {
    return { newPixelData: pixelData, changedCount: 0 };
  }

  const rowCount = pixelData.length;
  const colCount = pixelData[0]?.length ?? 0;
  const safeSize = Math.max(1, Math.min(24, Math.round(brushSize)));
  const minOffset = -Math.floor((safeSize - 1) / 2);
  const maxOffset = Math.ceil((safeSize - 1) / 2);
  const brushCenter = (minOffset + maxOffset) / 2;
  const radius = safeSize / 2;
  const replacement = createPaintCell(color);
  const newPixelData = pixelData.slice();
  const copiedRows = new Set<number>();
  const touched = new Set<number>();
  let changedCount = 0;

  for (const point of points) {
    for (let rowOffset = minOffset; rowOffset <= maxOffset; rowOffset++) {
      for (let colOffset = minOffset; colOffset <= maxOffset; colOffset++) {
        if (brushShape === 'circle') {
          const dx = colOffset - brushCenter;
          const dy = rowOffset - brushCenter;
          if ((dx * dx) + (dy * dy) > radius * radius) continue;
        }

        const row = point.row + rowOffset;
        const col = point.col + colOffset;
        if (row < 0 || row >= rowCount || col < 0 || col >= colCount) continue;

        const flatIndex = row * colCount + col;
        if (touched.has(flatIndex)) continue;
        touched.add(flatIndex);

        const currentCell = newPixelData[row]?.[col];
        if (!currentCell || arePixelsEqual(currentCell, replacement)) continue;

        if (!copiedRows.has(row)) {
          newPixelData[row] = newPixelData[row].slice();
          copiedRows.add(row);
        }
        newPixelData[row][col] = { ...replacement };
        changedCount++;
      }
    }
  }

  return {
    newPixelData: changedCount > 0 ? newPixelData : pixelData,
    changedCount,
  };
}

/** 四方向连续区域填充，可填充普通颜色或透明区域。 */
export function floodFillRegion(
  pixelData: MappedPixel[][],
  gridDimensions: { N: number; M: number },
  startRow: number,
  startCol: number,
  targetColor: MappedPixel
): { newPixelData: MappedPixel[][]; changedCount: number } {
  const { N, M } = gridDimensions;
  const sourceCell = pixelData[startRow]?.[startCol];
  if (!sourceCell || arePixelsEqual(sourceCell, targetColor)) {
    return { newPixelData: pixelData, changedCount: 0 };
  }

  const newPixelData = pixelData.slice();
  const copiedRows = new Set<number>();
  const visited = new Uint8Array(N * M);
  const replacement = createPaintCell(targetColor);
  const stack: GridCellPosition[] = [{ row: startRow, col: startCol }];
  let changedCount = 0;

  while (stack.length > 0) {
    const { row, col } = stack.pop()!;
    if (row < 0 || row >= M || col < 0 || col >= N) continue;
    const index = row * N + col;
    if (visited[index]) continue;
    visited[index] = 1;

    const currentCell = pixelData[row]?.[col];
    if (!currentCell || !arePixelsEqual(currentCell, sourceCell)) continue;

    if (!copiedRows.has(row)) {
      newPixelData[row] = newPixelData[row].slice();
      copiedRows.add(row);
    }
    newPixelData[row][col] = { ...replacement };
    changedCount++;
    stack.push(
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    );
  }

  return {
    newPixelData: changedCount > 0 ? newPixelData : pixelData,
    changedCount,
  };
}

/** 替换整张图内所有相同颜色，区域可以彼此不相连。 */
export function replaceMatchingPixels(
  pixelData: MappedPixel[][],
  sourceCell: MappedPixel,
  targetColor: MappedPixel
): { newPixelData: MappedPixel[][]; changedCount: number } {
  if (arePixelsEqual(sourceCell, targetColor)) {
    return { newPixelData: pixelData, changedCount: 0 };
  }

  const replacement = createPaintCell(targetColor);
  let changedCount = 0;
  const newPixelData = pixelData.map(row => {
    let nextRow: MappedPixel[] | null = null;
    row.forEach((cell, col) => {
      if (!arePixelsEqual(cell, sourceCell)) return;
      if (!nextRow) nextRow = row.slice();
      nextRow[col] = { ...replacement };
      changedCount++;
    });
    return nextRow ?? row;
  });

  return {
    newPixelData: changedCount > 0 ? newPixelData : pixelData,
    changedCount,
  };
}

/** Bresenham 网格直线，用于补齐快速拖动时跳过的格子。 */
export function interpolateGridLine(
  from: GridCellPosition,
  to: GridCellPosition
): GridCellPosition[] {
  const points: GridCellPosition[] = [];
  let x0 = from.col;
  let y0 = from.row;
  const x1 = to.col;
  const y1 = to.row;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;

  while (true) {
    points.push({ row: y0, col: x0 });
    if (x0 === x1 && y0 === y1) break;
    const doubledError = 2 * error;
    if (doubledError >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubledError <= dx) {
      error += dx;
      y0 += sy;
    }
  }

  return points;
}

/**
 * 重新计算颜色统计
 * @param pixelData 像素数据
 * @returns 颜色统计对象和总数
 */
export function recalculateColorStats(
  pixelData: MappedPixel[][]
): {
  colorCounts: { [hexKey: string]: { count: number; color: string } };
  totalCount: number;
} {
  const colorCounts: { [hexKey: string]: { count: number; color: string } } = {};
  let totalCount = 0;

  pixelData.flat().forEach(cell => {
    if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
      const cellHex = cell.color.toUpperCase();
      if (!colorCounts[cellHex]) {
        colorCounts[cellHex] = {
          count: 0,
          color: cellHex
        };
      }
      colorCounts[cellHex].count++;
      totalCount++;
    }
  });

  return { colorCounts, totalCount };
}
