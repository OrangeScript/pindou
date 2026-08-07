'use client';

import React, { useState } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { BrushShape, ManualEditorTool, TouchInteractionMode } from '../types/manualEditor';

interface FloatingToolbarProps {
  isManualColoringMode: boolean;
  activeTool: ManualEditorTool;
  brushSize: number;
  brushShape: BrushShape;
  touchInteractionMode: TouchInteractionMode;
  zoom: number;
  showGrid: boolean;
  selectedColor: MappedPixel | null;
  statusMessage: string;
  canUndo: boolean;
  canRedo: boolean;
  isPaletteOpen: boolean;
  onToolChange: (tool: ManualEditorTool) => void;
  onBrushSizeChange: (size: number) => void;
  onBrushShapeChange: (shape: BrushShape) => void;
  onTouchInteractionModeChange: (mode: TouchInteractionMode) => void;
  onZoomChange: (zoom: number) => void;
  onResetZoom: () => void;
  onToggleGrid: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePalette: () => void;
  onExitManualMode: () => void;
}

const tools: Array<{ id: ManualEditorTool; label: string; shortcut: string; icon: string }> = [
  { id: 'brush', label: '画笔', shortcut: 'B', icon: '✎' },
  { id: 'eraser', label: '橡皮擦', shortcut: 'E', icon: '◇' },
  { id: 'fill', label: '油漆桶', shortcut: 'G', icon: '▰' },
  { id: 'replace', label: '全局换色', shortcut: 'R', icon: '⇄' },
  { id: 'picker', label: '吸管', shortcut: 'I', icon: '⌁' },
  { id: 'pan', label: '抓手', shortcut: 'H', icon: '✋' },
];

const clampZoom = (zoom: number) => Math.max(0.25, Math.min(8, zoom));

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  isManualColoringMode,
  activeTool,
  brushSize,
  brushShape,
  touchInteractionMode,
  zoom,
  showGrid,
  selectedColor,
  statusMessage,
  canUndo,
  canRedo,
  isPaletteOpen,
  onToolChange,
  onBrushSizeChange,
  onBrushShapeChange,
  onTouchInteractionModeChange,
  onZoomChange,
  onResetZoom,
  onToggleGrid,
  onUndo,
  onRedo,
  onTogglePalette,
  onExitManualMode,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!isManualColoringMode) return null;

  return (
    <>
    <aside
      className="drawing-toolbar fixed right-4 top-4 z-[100] w-[320px] overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur dark:border-gray-600 dark:bg-gray-800/95"
      aria-label="手动绘图工具栏"
      data-testid="drawing-toolbar"
    >
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2.5 text-white">
        <div>
          <div className="text-sm font-semibold">图纸编辑器</div>
          <div className="text-[10px] text-blue-100">PC 滚轮/空格 · 平板双指手势</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsCollapsed(value => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/20"
            title={isCollapsed ? '展开工具栏' : '收起工具栏'}
            aria-label={isCollapsed ? '展开工具栏' : '收起工具栏'}
            aria-expanded={!isCollapsed}
          >
            <svg className={`h-5 w-5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 15 6-6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onExitManualMode}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/20"
            title="完成并退出编辑"
            aria-label="完成并退出编辑"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {!isCollapsed && (
      <div className="drawing-toolbar-content max-h-[calc(100vh-110px)] space-y-3 overflow-y-auto p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="flex min-h-11 flex-1 touch-manipulation items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            title="撤销 (Ctrl/⌘+Z)"
          >
            ↶ 撤销
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="flex min-h-11 flex-1 touch-manipulation items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            title="重做 (Ctrl/⌘+Shift+Z)"
          >
            ↷ 重做
          </button>
        </div>

        <div className="drawing-tool-grid grid grid-cols-3 gap-2">
          {tools.map(tool => (
            <button
              key={tool.id}
              type="button"
              onClick={() => onToolChange(tool.id)}
              className={`relative flex min-h-14 touch-manipulation flex-col items-center justify-center rounded-xl border px-1 py-2 text-xs transition-all ${
                activeTool === tool.id
                  ? 'border-blue-500 bg-blue-500 text-white shadow-md'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-blue-300 hover:bg-blue-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              }`}
              title={`${tool.label} (${tool.shortcut})`}
              data-testid={`tool-${tool.id}`}
              aria-pressed={activeTool === tool.id}
            >
              <span className="mb-0.5 text-lg leading-none" aria-hidden="true">{tool.icon}</span>
              <span>{tool.label}</span>
              <span className={`absolute right-1 top-0.5 text-[9px] ${activeTool === tool.id ? 'text-blue-100' : 'text-gray-400'}`}>
                {tool.shortcut}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-2.5 dark:border-indigo-800 dark:bg-indigo-950/30">
          <div className="mb-2 flex items-center justify-between text-xs text-indigo-800 dark:text-indigo-200">
            <span className="font-medium">平板手指操作</span>
            <span>触控笔始终绘制</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onTouchInteractionModeChange('navigate')}
              className={`min-h-11 touch-manipulation rounded-lg border px-2 py-2 text-xs ${touchInteractionMode === 'navigate' ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-indigo-200 bg-white text-indigo-700 dark:border-indigo-700 dark:bg-gray-800 dark:text-indigo-200'}`}
              aria-pressed={touchInteractionMode === 'navigate'}
              data-testid="touch-mode-navigate"
            >
              ☝ 单指移动
            </button>
            <button
              type="button"
              onClick={() => onTouchInteractionModeChange('draw')}
              className={`min-h-11 touch-manipulation rounded-lg border px-2 py-2 text-xs ${touchInteractionMode === 'draw' ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-indigo-200 bg-white text-indigo-700 dark:border-indigo-700 dark:bg-gray-800 dark:text-indigo-200'}`}
              aria-pressed={touchInteractionMode === 'draw'}
              data-testid="touch-mode-draw"
            >
              ✍ 手指绘制
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-indigo-600 dark:text-indigo-300">两种模式都支持双指缩放和平移；第二根手指加入时会取消未完成笔画。</p>
        </div>

        {(activeTool === 'brush' || activeTool === 'eraser') && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-600 dark:bg-gray-700/60">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
              <span>笔刷大小</span>
              <strong>{brushSize} × {brushSize}</strong>
            </div>
            <input
              type="range"
              min="1"
              max="24"
              step="1"
              value={brushSize}
              onChange={event => onBrushSizeChange(Number(event.target.value))}
              className="w-full accent-blue-600"
              aria-label="笔刷大小"
              data-testid="brush-size"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onBrushShapeChange('circle')}
                className={`min-h-11 touch-manipulation rounded-lg border py-1.5 text-xs ${brushShape === 'circle' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}
              >
                ● 圆形
              </button>
              <button
                type="button"
                onClick={() => onBrushShapeChange('square')}
                className={`min-h-11 touch-manipulation rounded-lg border py-1.5 text-xs ${brushShape === 'square' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}
              >
                ■ 方形
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 p-2.5 dark:border-gray-600">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
            <span>画布缩放</span>
            <strong>{Math.round(zoom * 100)}%</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onZoomChange(clampZoom(zoom / 1.25))}
              className="h-11 w-11 touch-manipulation rounded-lg bg-gray-100 text-lg hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
              aria-label="缩小"
            >−</button>
            <input
              type="range"
              min="25"
              max="800"
              step="5"
              value={Math.round(zoom * 100)}
              onChange={event => onZoomChange(Number(event.target.value) / 100)}
              className="min-w-0 flex-1 accent-blue-600"
              aria-label="画布缩放"
              data-testid="zoom-slider"
            />
            <button
              type="button"
              onClick={() => onZoomChange(clampZoom(zoom * 1.25))}
              className="h-11 w-11 touch-manipulation rounded-lg bg-gray-100 text-lg hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
              aria-label="放大"
            >+</button>
            <button
              type="button"
              onClick={onResetZoom}
              className="h-11 touch-manipulation rounded-lg bg-gray-100 px-2 text-[10px] hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
              title="重置为 100% (0)"
            >1:1</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onTogglePalette}
            className={`min-h-11 touch-manipulation rounded-lg border px-2 py-2 text-xs ${isPaletteOpen ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200' : 'border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}
          >
            🎨 {isPaletteOpen ? '收起色板' : '打开色板'}
          </button>
          <button
            type="button"
            onClick={onToggleGrid}
            className={`min-h-11 touch-manipulation rounded-lg border px-2 py-2 text-xs ${showGrid ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200' : 'border-gray-200 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}
          >
            # {showGrid ? '隐藏网格' : '显示网格'}
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-2.5 py-2 dark:bg-gray-700">
          <span
            className="h-7 w-7 flex-none rounded-lg border-2 border-white shadow"
            style={{ backgroundColor: selectedColor?.isExternal ? 'transparent' : selectedColor?.color ?? '#FFFFFF' }}
            aria-label="当前颜色"
          />
          <p className="min-w-0 text-xs leading-4 text-gray-600 dark:text-gray-200" aria-live="polite">
            {statusMessage}
          </p>
        </div>
      </div>
      )}
    </aside>
      <style jsx>{`
        @media (any-pointer: coarse) and (max-width: 1180px) {
          .drawing-toolbar {
            top: auto;
            right: auto;
            bottom: max(12px, env(safe-area-inset-bottom));
            left: 50%;
            width: min(720px, calc(100vw - 24px));
            transform: translateX(-50%);
          }

          .drawing-toolbar-content {
            max-height: min(58vh, 520px);
          }
        }

        @media (any-pointer: coarse) and (min-width: 640px) and (max-width: 1180px) {
          .drawing-tool-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
        }
      `}</style>
    </>
  );
};

export default FloatingToolbar;
