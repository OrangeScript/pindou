'use client';

import React, { useRef, useEffect, TouchEvent, MouseEvent, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';

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
  highlightColorKey?: string | null,
  isHighlighting?: boolean
) => {
  if (!canvas || !dims || !dataToDraw) {
    console.warn('drawPixelatedCanvas: Missing required parameters');
    return;
  }

  const pixelatedCtx = canvas.getContext('2d');
  if (!pixelatedCtx) {
    console.error('Failed to get 2D context for pixelated canvas');
    return;
  }

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
  if (!sourceCtx) {
    console.error('Failed to get 2D context for source canvas');
    return;
  }

  const rgbCache = new Map<string, RgbTuple>();
  const externalRgb = parseHexColor(externalBackgroundColor, rgbCache);
  const imageData = sourceCtx.createImageData(N, M);
  const imageBuffer = imageData.data;
  const normalizedHighlight = highlightColorKey?.toUpperCase() ?? null;

  for (let j = 0; j < M; j++) {
    const row = dataToDraw[j];
    for (let i = 0; i < N; i++) {
      const cellData = row?.[i];
      const index = (j * N + i) * 4;
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
  drawGridLines(pixelatedCtx, outputWidth, outputHeight, N, M, gridLineColor);
};

const PixelatedPreviewCanvas: React.FC<PixelatedPreviewCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  isManualColoringMode,
  canvasRef,
  onInteraction,
  highlightColorKey,
  onHighlightComplete,
}) => {
  const [darkModeState, setDarkModeState] = useState<boolean | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
  const [isHighlighting, setIsHighlighting] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkDarkMode = () => {
      const isDark = document.documentElement.classList.contains('dark');
      if (isDark !== darkModeState) {
        setDarkModeState(isDark);
      }
    };

    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [darkModeState]);

  useEffect(() => {
    if (mappedPixelData && gridDimensions && canvasRef.current && darkModeState !== null) {
      drawPixelatedCanvas(mappedPixelData, canvasRef.current, gridDimensions, highlightColorKey, isHighlighting);
    }
  }, [mappedPixelData, gridDimensions, canvasRef, darkModeState, highlightColorKey, isHighlighting]);

  useEffect(() => {
    if (highlightColorKey && mappedPixelData && gridDimensions) {
      setIsHighlighting(true);
      const timer = setTimeout(() => {
        setIsHighlighting(false);
        onHighlightComplete?.();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [highlightColorKey, mappedPixelData, gridDimensions, onHighlightComplete]);

  const handleMouseMove = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!isManualColoringMode) {
      onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, false);
    }
  };

  const handleMouseLeave = () => {
    onInteraction(0, 0, 0, 0, false, true);
  };

  const handleClick = (event: MouseEvent<HTMLCanvasElement>) => {
    onInteraction(event.clientX, event.clientY, event.pageX, event.pageY, isManualColoringMode);
  };

  const handleTouchStart = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    touchStartPosRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      pageX: touch.pageX,
      pageY: touch.pageY,
    };
    touchMovedRef.current = false;

    if (!isManualColoringMode) {
      onInteraction(touch.clientX, touch.clientY, touch.pageX, touch.pageY, false);
    }
  };

  const handleTouchMove = (event: TouchEvent<HTMLCanvasElement>) => {
    const touch = event.touches[0];
    if (!touch || !touchStartPosRef.current) return;

    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);

    if (!touchMovedRef.current && (dx > 10 || dy > 10)) {
      touchMovedRef.current = true;
      onInteraction(0, 0, 0, 0, false, true);
    }
  };

  const handleTouchEnd = () => {
    if (isManualColoringMode && !touchMovedRef.current && touchStartPosRef.current) {
      const { x, y, pageX, pageY } = touchStartPosRef.current;
      onInteraction(x, y, pageX, pageY, true);
    }

    touchStartPosRef.current = null;
    touchMovedRef.current = false;
  };

  const isLargeGrid = gridDimensions ? Math.max(gridDimensions.N, gridDimensions.M) > 100 : false;

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`border border-gray-300 dark:border-gray-600 h-auto rounded block ${
        isLargeGrid ? 'max-w-none' : 'max-w-full'
      } ${isManualColoringMode ? 'cursor-pointer' : 'cursor-grab'}`}
      style={{
        imageRendering: 'pixelated',
      }}
    />
  );
};

export default PixelatedPreviewCanvas;
