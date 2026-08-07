'use client';

import React, { PointerEvent, WheelEvent, useCallback, useEffect, useRef, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import {
  BrushShape,
  EditorPointerPhase,
  GridCellPosition,
  ManualEditorTool,
} from '../types/manualEditor';

interface PixelatedPreviewCanvasProps {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  isManualColoringMode: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onInteraction: (
    clientX: number,
    clientY: number,
    pageX: number,
    pageY: number,
    isClick: boolean,
    isTouchEnd?: boolean
  ) => void;
  editorTool: ManualEditorTool;
  brushSize: number;
  brushShape: BrushShape;
  zoom: number;
  showGrid: boolean;
  onZoomChange: (zoom: number) => void;
  onEditPointer: (position: GridCellPosition | null, phase: EditorPointerPhase) => void;
  highlightColorKey?: string | null;
  onHighlightComplete?: () => void;
}

interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

function parseHexColor(hex: string, cache: Map<string, RgbTuple>): RgbTuple {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : '#FFFFFF';
  const cached = cache.get(normalized);
  if (cached) return cached;

  const rgb = {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
  cache.set(normalized, rgb);
  return rgb;
}

function dimColor(rgb: RgbTuple): RgbTuple {
  return {
    r: Math.round(rgb.r * 0.4),
    g: Math.round(rgb.g * 0.4),
    b: Math.round(rgb.b * 0.4),
  };
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  N: number,
  M: number,
  gridLineColor: string
) {
  const cellWidth = width / N;
  const cellHeight = height / M;
  if (cellWidth < 4 || cellHeight < 4 || N + M > 3000) return;

  ctx.save();
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();

  for (let i = 0; i <= N; i++) {
    const x = Math.round(i * cellWidth) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }

  for (let j = 0; j <= M; j++) {
    const y = Math.round(j * cellHeight) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }

  ctx.stroke();
  ctx.restore();
}

const drawPixelatedCanvas = (
  dataToDraw: MappedPixel[][],
  canvas: HTMLCanvasElement | null,
  dims: { N: number; M: number } | null,
  showGrid: boolean,
  highlightColorKey?: string | null,
  isHighlighting?: boolean
) => {
  if (!canvas || !dims || !dataToDraw) return;

  const pixelatedCtx = canvas.getContext('2d');
  if (!pixelatedCtx) return;

  const isDarkMode = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');
  const externalBackgroundColor = isDarkMode ? '#374151' : '#F3F4F6';
  const gridLineColor = isDarkMode ? '#4B5563' : '#DDDDDD';
  const { N, M } = dims;
  const outputWidth = canvas.width;
  const outputHeight = canvas.height;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = N;
  sourceCanvas.height = M;
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) return;

  const rgbCache = new Map<string, RgbTuple>();
  const externalRgb = parseHexColor(externalBackgroundColor, rgbCache);
  const imageData = sourceCtx.createImageData(N, M);
  const imageBuffer = imageData.data;
  const normalizedHighlight = highlightColorKey?.toUpperCase() ?? null;

  for (let rowIndex = 0; rowIndex < M; rowIndex++) {
    const row = dataToDraw[rowIndex];
    for (let colIndex = 0; colIndex < N; colIndex++) {
      const cellData = row?.[colIndex];
      const index = (rowIndex * N + colIndex) * 4;
      let rgb = cellData?.isExternal
        ? externalRgb
        : parseHexColor(cellData?.color ?? '#FFFFFF', rgbCache);

      if (isHighlighting && normalizedHighlight) {
        const shouldDim = cellData?.isExternal || cellData?.color?.toUpperCase() !== normalizedHighlight;
        if (shouldDim) rgb = dimColor(rgb);
      }

      imageBuffer[index] = rgb.r;
      imageBuffer[index + 1] = rgb.g;
      imageBuffer[index + 2] = rgb.b;
      imageBuffer[index + 3] = 255;
    }
  }

  sourceCtx.putImageData(imageData, 0, 0);
  pixelatedCtx.clearRect(0, 0, outputWidth, outputHeight);
  pixelatedCtx.imageSmoothingEnabled = false;
  pixelatedCtx.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
  if (showGrid) drawGridLines(pixelatedCtx, outputWidth, outputHeight, N, M, gridLineColor);
};

const PixelatedPreviewCanvas: React.FC<PixelatedPreviewCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  isManualColoringMode,
  canvasRef,
  onInteraction,
  editorTool,
  brushSize,
  brushShape,
  zoom,
  showGrid,
  onZoomChange,
  onEditPointer,
  highlightColorKey,
  onHighlightComplete,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointerStateRef = useRef<{
    id: number;
    mode: 'edit' | 'pan';
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [darkModeState, setDarkModeState] = useState<boolean | null>(null);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<GridCellPosition | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 500, height: 500 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkDarkMode = () => setDarkModeState(document.documentElement.classList.contains('dark'));
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCanvasSize({ width: canvas.width || 500, height: canvas.height || 500 });
    if (mappedPixelData && gridDimensions && darkModeState !== null) {
      drawPixelatedCanvas(
        mappedPixelData,
        canvas,
        gridDimensions,
        showGrid,
        highlightColorKey,
        isHighlighting
      );
    }
  }, [mappedPixelData, gridDimensions, canvasRef, darkModeState, showGrid, highlightColorKey, isHighlighting]);

  useEffect(() => {
    if (!highlightColorKey || !mappedPixelData || !gridDimensions) return;
    setIsHighlighting(true);
    const timer = window.setTimeout(() => {
      setIsHighlighting(false);
      onHighlightComplete?.();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [highlightColorKey, mappedPixelData, gridDimensions, onHighlightComplete]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const getGridPosition = useCallback((clientX: number, clientY: number): GridCellPosition | null => {
    const canvas = canvasRef.current;
    if (!canvas || !gridDimensions) return null;
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null;
    const col = Math.floor(((clientX - rect.left) / rect.width) * gridDimensions.N);
    const row = Math.floor(((clientY - rect.top) / rect.height) * gridDimensions.M);
    return row >= 0 && row < gridDimensions.M && col >= 0 && col < gridDimensions.N
      ? { row, col }
      : null;
  }, [canvasRef, gridDimensions]);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!isManualColoringMode) {
      if (event.button === 0) {
        onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, false);
      }
      return;
    }
    const shouldPan = isManualColoringMode && (editorTool === 'pan' || isSpacePressed || event.button === 1);
    if (isManualColoringMode && !shouldPan && event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStateRef.current = {
      id: event.pointerId,
      mode: shouldPan ? 'pan' : 'edit',
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };

    const position = getGridPosition(event.clientX, event.clientY);
    setHoveredCell(position);
    if (isManualColoringMode && !shouldPan) onEditPointer(position, 'start');
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const position = getGridPosition(event.clientX, event.clientY);
    setHoveredCell(position);
    const pointerState = pointerStateRef.current;

    if (pointerState?.id === event.pointerId) {
      if (pointerState.mode === 'pan') {
        const viewport = viewportRef.current;
        if (viewport) {
          viewport.scrollLeft = pointerState.scrollLeft - (event.clientX - pointerState.startX);
          viewport.scrollTop = pointerState.scrollTop - (event.clientY - pointerState.startY);
        }
      } else if (isManualColoringMode) {
        onEditPointer(position, 'move');
      }
      return;
    }

    if (!isManualColoringMode) {
      onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, false);
    }
  };

  const finishPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointerState = pointerStateRef.current;
    if (!pointerState || pointerState.id !== event.pointerId) return;
    if (pointerState.mode === 'edit' && isManualColoringMode) {
      onEditPointer(getGridPosition(event.clientX, event.clientY), 'end');
    }
    pointerStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerLeave = () => {
    setHoveredCell(null);
    if (!pointerStateRef.current) onInteraction(0, 0, 0, 0, false, true);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!isManualColoringMode) return;
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;

    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextZoom = Math.max(0.25, Math.min(8, zoom * factor));
    if (Math.abs(nextZoom - zoom) < 0.001) return;
    const rect = viewport.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;
    const contentX = viewport.scrollLeft + cursorX;
    const contentY = viewport.scrollTop + cursorY;
    const ratio = nextZoom / zoom;

    onZoomChange(nextZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = contentX * ratio - cursorX;
      viewport.scrollTop = contentY * ratio - cursorY;
    });
  };

  const isDrawingTool = editorTool === 'brush' || editorTool === 'eraser';
  const previewSize = isDrawingTool ? Math.max(1, brushSize) : 1;
  const minOffset = -Math.floor((previewSize - 1) / 2);
  const rawPreviewStartRow = hoveredCell ? hoveredCell.row + minOffset : 0;
  const rawPreviewStartCol = hoveredCell ? hoveredCell.col + minOffset : 0;
  const rawPreviewEndRow = hoveredCell ? rawPreviewStartRow + previewSize - 1 : 0;
  const rawPreviewEndCol = hoveredCell ? rawPreviewStartCol + previewSize - 1 : 0;
  const preview = hoveredCell && gridDimensions ? {
    row: Math.max(0, rawPreviewStartRow),
    col: Math.max(0, rawPreviewStartCol),
    rows: Math.max(1, Math.min(gridDimensions.M - 1, rawPreviewEndRow) - Math.max(0, rawPreviewStartRow) + 1),
    cols: Math.max(1, Math.min(gridDimensions.N - 1, rawPreviewEndCol) - Math.max(0, rawPreviewStartCol) + 1),
  } : null;

  const cursorClass = !isManualColoringMode
    ? 'cursor-default'
    : editorTool === 'pan' || isSpacePressed
      ? 'cursor-grab active:cursor-grabbing'
      : editorTool === 'picker'
        ? 'cursor-copy'
        : 'cursor-crosshair';

  return (
    <div
      ref={viewportRef}
      className="relative w-full max-h-[70vh] overflow-auto rounded-lg bg-gray-200/70 dark:bg-gray-900/40 overscroll-contain"
      onWheel={handleWheel}
      data-testid="pixel-editor-viewport"
    >
      <div
        className="relative mx-auto"
        style={{
          width: `${Math.max(1, canvasSize.width * zoom)}px`,
          height: `${Math.max(1, canvasSize.height * zoom)}px`,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onPointerLeave={handlePointerLeave}
          className={`absolute inset-0 block h-full w-full border border-gray-300 dark:border-gray-600 ${cursorClass}`}
          style={{ imageRendering: 'pixelated', touchAction: isManualColoringMode ? 'none' : 'auto' }}
          draggable={false}
          data-testid="pixel-editor-canvas"
        />
        {isManualColoringMode && preview && gridDimensions && editorTool !== 'pan' && (
          <div
            className={`pointer-events-none absolute z-10 border-2 border-blue-600 shadow-[0_0_0_1px_rgba(255,255,255,0.9)] ${
              isDrawingTool && brushShape === 'circle' ? 'rounded-full' : ''
            }`}
            style={{
              left: `${(preview.col / gridDimensions.N) * 100}%`,
              top: `${(preview.row / gridDimensions.M) * 100}%`,
              width: `${(preview.cols / gridDimensions.N) * 100}%`,
              height: `${(preview.rows / gridDimensions.M) * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default PixelatedPreviewCanvas;
