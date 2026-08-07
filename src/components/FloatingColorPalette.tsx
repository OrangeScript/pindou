'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { ColorSystem, getColorKeyByHex } from '../utils/colorSystemUtils';

interface FloatingColorPaletteProps {
  colors: { key: string; color: string }[];
  selectedColor: MappedPixel | null;
  onColorSelect: (colorData: { key: string; color: string; isExternal?: boolean }) => void;
  selectedColorSystem: ColorSystem;
  fullPaletteColors: { key: string; color: string }[];
  showFullPalette: boolean;
  onToggleFullPalette: () => void;
  onHighlightColor: (colorHex: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  isActive: boolean;
  onActivate: () => void;
}

const FloatingColorPalette: React.FC<FloatingColorPaletteProps> = ({
  colors,
  selectedColor,
  onColorSelect,
  selectedColorSystem,
  fullPaletteColors,
  showFullPalette,
  onToggleFullPalette,
  onHighlightColor,
  isOpen,
  onToggleOpen,
  isActive,
  onActivate
}) => {
  // 计算初始位置，确保左边缘在屏幕内（小屏幕时右边缘可以超出）
  const getInitialPosition = () => ({
    x: Math.max(0, Math.min(20, window.innerWidth - 280)), // 确保左边缘至少是0
    y: Math.max(0, Math.min(100, window.innerHeight - 400)) // 确保上边缘至少是0
  });
  
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const paletteRef = useRef<HTMLDivElement>(null);

  // 处理拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!paletteRef.current) return;
    
    onActivate(); // 激活调色板，置于最上层
    const rect = paletteRef.current.getBoundingClientRect();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    e.preventDefault();
  }, [onActivate]);

  // 处理触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!paletteRef.current) return;
    
    onActivate(); // 激活调色板，置于最上层
    const rect = paletteRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    setIsDragging(true);
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
    e.preventDefault();
  }, [onActivate]);

  // 处理移动
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;

      // 移除边界限制，允许自由拖动到任何位置
      const newX = clientX - dragOffset.x;
      const newY = clientY - dragOffset.y;

      setPosition({ x: newX, y: newY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
      // 恢复页面滚动
      document.body.style.overflow = '';
    };

    if (isDragging) {
      // 阻止页面滚动
      document.body.style.overflow = 'hidden';
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
        // 清理时恢复滚动
        document.body.style.overflow = '';
      };
    }
  }, [isDragging, dragOffset]);

  // 移除窗口大小变化时的边界调整，允许调色盘保持在任何位置

    // 每次打开调色盘时重置位置到屏幕内
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      setPosition(getInitialPosition());
    }
  }, [isOpen]);

  // 处理颜色点击
  const handleColorClick = (colorData: { key: string; color: string }) => {
    onHighlightColor(colorData.color);
    onColorSelect(colorData);
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const displayColors = (showFullPalette ? fullPaletteColors : colors).filter(colorData => {
    if (!normalizedSearch) return true;
    const displayKey = getColorKeyByHex(colorData.color, selectedColorSystem);
    return displayKey.toLowerCase().includes(normalizedSearch)
      || colorData.color.toLowerCase().includes(normalizedSearch);
  });

  // 如果调色盘关闭，完全不渲染
  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={paletteRef}
      className={`fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 select-none ${
        isActive ? 'z-[60]' : 'z-[50]'
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: '280px',
        maxHeight: '400px'
      }}
      onClick={onActivate}
    >
      {/* 标题栏和控制按钮 */}
      <div
        className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-t-xl cursor-move"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">调色盘</span>
        </div>
        
        <div className="flex items-center gap-1">
          {/* 关闭按钮 */}
          <button
            onClick={onToggleOpen}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="关闭调色盘"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-3 max-h-80 overflow-y-auto">
          <input
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="搜索色号或 HEX"
            className="mb-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            aria-label="搜索颜色"
          />

          {/* 色板切换 */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={onToggleFullPalette}
              className="w-full text-xs py-2 px-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {showFullPalette ? `当前色板 (${colors.length})` : `完整色板 (${fullPaletteColors.length})`}
            </button>
          </div>

          {/* 颜色网格 */}
          <div className="grid grid-cols-6 gap-1.5" data-testid="color-palette-grid">
            {displayColors.map((colorData) => {
              const isSelected = selectedColor?.color.toUpperCase() === colorData.color.toUpperCase();
              const displayKey = getColorKeyByHex(colorData.color, selectedColorSystem);
              
              return (
                <button
                  key={`${colorData.key}-${colorData.color}`}
                  onClick={() => handleColorClick(colorData)}
                  className={`group relative aspect-square rounded-lg border-2 transition-all duration-200 hover:scale-110 ${
                    isSelected
                      ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800 scale-110'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: colorData.color }}
                  title={`${displayKey} (${colorData.color})`}
                >
                  {/* 选中指示器 */}
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full shadow-lg"></div>
                    </div>
                  )}
                  
                  {/* 悬停时显示色号 */}
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    {displayKey}
                  </div>
                </button>
              );
            })}
          </div>

          {displayColors.length === 0 && (
            <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">没有匹配的颜色</p>
          )}

          {/* 当前选中颜色信息 */}
          {selectedColor && !selectedColor.isExternal && (
            <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2 text-xs">
                <div
                  className="w-4 h-4 rounded border border-gray-300 dark:border-gray-500"
                  style={{ backgroundColor: selectedColor.color }}
                ></div>
                <span className="text-gray-700 dark:text-gray-300">
                  当前: {getColorKeyByHex(selectedColor.color, selectedColorSystem)}
                </span>
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

export default FloatingColorPalette;
