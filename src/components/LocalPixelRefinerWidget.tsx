'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  downloadRefinedPixelArt,
  PixelRefinerSamplingMethod,
  refinePixelArt,
  RefinedPixelImage,
} from '../utils/localPixelRefiner';

const MAX_FILE_SIZE = 30 * 1024 * 1024;

function clampZoom(value: number): number {
  return Math.min(24, Math.max(1, Math.round(value)));
}

const LocalPixelRefinerWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [result, setResult] = useState<RefinedPixelImage | null>(null);
  const [samplingMethod, setSamplingMethod] = useState<PixelRefinerSamplingMethod>('center');
  const [manualColumns, setManualColumns] = useState('');
  const [zoom, setZoom] = useState(6);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragStateRef = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  const resetPreviewPosition = (nextResult?: RefinedPixelImage) => {
    const targetResult = nextResult ?? result;
    const fittedZoom = targetResult
      ? clampZoom(Math.floor(250 / Math.max(targetResult.width, targetResult.height)))
      : 6;
    setZoom(fittedZoom);
    setOffset({ x: 0, y: 0 });
  };

  const selectFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择 JPG、PNG、WebP 等图片文件。');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('图片不能超过 30 MB。');
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setSourceFile(file);
    setSourceUrl(nextUrl);
    setResult(null);
    setError(null);
    setOffset({ x: 0, y: 0 });
  };

  const handleProcess = async () => {
    if (!sourceUrl) return;
    const parsedColumns = manualColumns.trim() === '' ? undefined : Number(manualColumns);
    if (parsedColumns !== undefined && (!Number.isInteger(parsedColumns) || parsedColumns < 2 || parsedColumns > 512)) {
      setError('横向格数需要填写 2～512 之间的整数。');
      return;
    }

    setIsProcessing(true);
    setError(null);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    try {
      const nextResult = await refinePixelArt(sourceUrl, {
        samplingMethod,
        manualColumns: parsedColumns,
      });
      setResult(nextResult);
      resetPreviewPosition(nextResult);
    } catch (processingError) {
      setResult(null);
      setError(processingError instanceof Error ? processingError.message : '图片转换失败，请重试。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!result || !sourceFile) return;
    setIsDownloading(true);
    setError(null);

    try {
      await downloadRefinedPixelArt(result, sourceFile.name, zoom);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '图片下载失败，请重试。');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!result) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState) return;
    setOffset({
      x: dragState.offsetX + event.clientX - dragState.pointerX,
      y: dragState.offsetY + event.clientY - dragState.pointerY,
    });
  };

  const stopDragging = () => {
    dragStateRef.current = null;
  };

  return (
    <>
      {isOpen && (
        <section
          aria-label="像素净化工具"
          className="fixed bottom-20 left-4 z-[90] flex max-h-[calc(100vh-6rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-indigo-800/70 dark:bg-gray-900/95 sm:left-6 sm:w-[440px]"
        >
          <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">像素净化</h2>
              <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">仅在浏览器本地处理，不会上传图片</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="关闭像素净化工具"
              className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div className="space-y-3 overflow-y-auto p-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) selectFile(file);
              }}
              className="group flex min-h-28 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/60 p-3 text-center transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 dark:hover:border-indigo-600"
            >
              {sourceUrl ? (
                <div className="flex w-full items-center gap-3 text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sourceUrl} alt="待转换图片预览" className="h-20 w-20 shrink-0 rounded-lg bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:12px_12px] object-contain [image-rendering:pixelated] dark:bg-gray-800" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{sourceFile?.name}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">点击或拖入另一张图片</p>
                  </div>
                </div>
              ) : (
                <div>
                  <svg className="mx-auto h-8 w-8 text-indigo-400 transition group-hover:-translate-y-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M4 16.5V19a1 1 0 001 1h14a1 1 0 001-1v-2.5M8 8l4-4 4 4M12 4v11" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">点击上传或拖入像素风图片</p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">支持 JPG、PNG、WebP，最大 30 MB</p>
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) selectFile(file);
                event.target.value = '';
              }}
            />

            <div className="grid grid-cols-[1fr_120px] gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-300">
                取样方式
                <select
                  value={samplingMethod}
                  onChange={event => setSamplingMethod(event.target.value as PixelRefinerSamplingMethod)}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-indigo-900"
                >
                  <option value="center">中心取样</option>
                  <option value="majority">多数颜色取样</option>
                </select>
              </label>
              <label className="text-xs text-gray-600 dark:text-gray-300">
                横向格数
                <input
                  type="number"
                  min={2}
                  max={512}
                  step={1}
                  value={manualColumns}
                  onChange={event => setManualColumns(event.target.value)}
                  placeholder="自动检测"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-indigo-900"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleProcess}
              disabled={!sourceUrl || isProcessing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2.5 text-sm font-medium text-white shadow-md transition hover:from-indigo-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
              )}
              {isProcessing ? '正在本地分析…' : '转换为规整像素图'}
            </button>

            {error && (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}

            {result && (
              <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-700 dark:bg-gray-800/70">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">生成结果 · {result.width} × {result.height} 格</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {result.usedManualGrid ? '使用手动格数' : 'PerfectPixel 自动识别'} · 可拖动查看
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => resetPreviewPosition()}
                    className="rounded-md px-2 py-1 text-[11px] text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                  >
                    居中
                  </button>
                </div>

                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={stopDragging}
                  onPointerCancel={stopDragging}
                  onWheel={event => {
                    event.preventDefault();
                    setZoom(current => clampZoom(current + (event.deltaY < 0 ? 1 : -1)));
                  }}
                  className="relative flex h-64 touch-none select-none items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%),linear-gradient(-45deg,#f3f4f6_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f3f4f6_75%),linear-gradient(-45deg,transparent_75%,#f3f4f6_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] active:cursor-grabbing dark:border-gray-700 dark:bg-gray-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.dataUrl}
                    alt="规整像素图生成结果"
                    draggable={false}
                    style={{
                      width: result.width * zoom,
                      height: result.height * zoom,
                      transform: `translate(${offset.x}px, ${offset.y}px)`,
                      imageRendering: 'pixelated',
                    }}
                    className="max-w-none cursor-grab shadow-lg"
                  />
                </div>

                <div className="flex items-center gap-2 px-1">
                  <button type="button" aria-label="缩小预览" onClick={() => setZoom(current => clampZoom(current - 1))} className="h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">−</button>
                  <input
                    type="range"
                    min={1}
                    max={24}
                    value={zoom}
                    onChange={event => setZoom(Number(event.target.value))}
                    aria-label="预览和导出倍率"
                    className="min-w-0 flex-1 accent-indigo-500"
                  />
                  <button type="button" aria-label="放大预览" onClick={() => setZoom(current => clampZoom(current + 1))} className="h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">＋</button>
                  <span className="w-8 text-right text-xs font-medium text-gray-600 dark:text-gray-300">{zoom}×</span>
                </div>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 20h14" />
                  </svg>
                  {isDownloading ? '正在生成…' : `立即下载 ${result.width * zoom} × ${result.height * zoom} PNG`}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        aria-expanded={isOpen}
        aria-label={isOpen ? '收起像素净化工具' : '打开像素净化工具'}
        className="fixed bottom-5 left-4 z-[90] flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 sm:left-6"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </svg>
        像素净化
      </button>
    </>
  );
};

export default LocalPixelRefinerWidget;
