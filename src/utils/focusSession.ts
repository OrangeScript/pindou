import type { MappedPixel } from './pixelation';

export const FOCUS_SESSION_STORAGE_KEY = 'focusMode_session_v1';

export type FocusGuidanceMode = 'nearest' | 'largest' | 'edge-first';

export interface FocusSessionSnapshot {
  version: 1;
  patternId: string;
  savedAt: number;
  currentColor: string;
  selectedCell: { row: number; col: number } | null;
  canvasScale: number;
  canvasOffset: { x: number; y: number };
  completedCells: string[];
  guidanceMode: FocusGuidanceMode;
  isPaused: boolean;
  totalElapsedTime: number;
  gridSectionInterval: number;
  showSectionLines: boolean;
  sectionLineColor: string;
  enableCelebration: boolean;
}

function mixHash(hash: number, value: string): number {
  let next = hash;
  for (let index = 0; index < value.length; index++) {
    next ^= value.charCodeAt(index);
    next = Math.imul(next, 16777619);
  }
  return next >>> 0;
}

export function createFocusPatternId(
  pixelData: MappedPixel[][],
  dimensions: { N: number; M: number }
): string {
  let hash = mixHash(2166136261, `${dimensions.N}x${dimensions.M}|`);
  for (const row of pixelData) {
    for (const cell of row) {
      hash = mixHash(hash, `${cell?.color?.toUpperCase() ?? ''}:${cell?.isExternal ? 1 : 0};`);
    }
  }
  return `${dimensions.N}x${dimensions.M}-${hash.toString(36)}`;
}

export function serializeFocusSession(snapshot: FocusSessionSnapshot): string {
  return JSON.stringify(snapshot);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseFocusSession(
  serialized: string | null,
  expectedPatternId: string
): FocusSessionSnapshot | null {
  if (!serialized) return null;

  try {
    const value = JSON.parse(serialized) as Partial<FocusSessionSnapshot>;
    if (value.version !== 1 || value.patternId !== expectedPatternId) return null;
    if (typeof value.currentColor !== 'string' || !Array.isArray(value.completedCells)) return null;

    const guidanceModes: FocusGuidanceMode[] = ['nearest', 'largest', 'edge-first'];
    const guidanceMode = guidanceModes.includes(value.guidanceMode as FocusGuidanceMode)
      ? value.guidanceMode as FocusGuidanceMode
      : 'nearest';
    const selectedCell = value.selectedCell
      && isFiniteNumber(value.selectedCell.row)
      && isFiniteNumber(value.selectedCell.col)
      ? { row: Math.floor(value.selectedCell.row), col: Math.floor(value.selectedCell.col) }
      : null;

    return {
      version: 1,
      patternId: expectedPatternId,
      savedAt: isFiniteNumber(value.savedAt) ? value.savedAt : Date.now(),
      currentColor: value.currentColor,
      selectedCell,
      canvasScale: isFiniteNumber(value.canvasScale)
        ? Math.max(0.25, Math.min(8, value.canvasScale))
        : 1,
      canvasOffset: {
        x: isFiniteNumber(value.canvasOffset?.x) ? value.canvasOffset.x : 0,
        y: isFiniteNumber(value.canvasOffset?.y) ? value.canvasOffset.y : 0,
      },
      completedCells: value.completedCells.filter(
        (cell): cell is string => typeof cell === 'string' && /^\d+,\d+$/.test(cell)
      ),
      guidanceMode,
      isPaused: Boolean(value.isPaused),
      totalElapsedTime: isFiniteNumber(value.totalElapsedTime)
        ? Math.max(0, Math.floor(value.totalElapsedTime))
        : 0,
      gridSectionInterval: isFiniteNumber(value.gridSectionInterval)
        ? Math.max(5, Math.min(20, Math.round(value.gridSectionInterval)))
        : 10,
      showSectionLines: value.showSectionLines !== false,
      sectionLineColor: typeof value.sectionLineColor === 'string'
        && /^#[0-9a-f]{6}$/i.test(value.sectionLineColor)
        ? value.sectionLineColor
        : '#007acc',
      enableCelebration: value.enableCelebration !== false,
    };
  } catch {
    return null;
  }
}
