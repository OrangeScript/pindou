import React from 'react';

interface ColorStatusBarProps {
  currentColor: string;
  colorInfo?: {
    color: string;
    name: string;
    total: number;
    completed: number;
  };
  progressPercentage: number;
}

const ColorStatusBar: React.FC<ColorStatusBarProps> = ({
  currentColor,
  colorInfo,
  progressPercentage
}) => {
  if (!colorInfo) {
    return (
      <div className="h-12 border-b-2 border-[var(--atelier-ink)] bg-[var(--atelier-surface)] px-4 py-2 flex items-center">
        <div className="font-mono text-sm text-[var(--atelier-muted)]">请选择颜色</div>
      </div>
    );
  }

  const estimatedTime = Math.ceil((colorInfo.total - colorInfo.completed) * 0.1); // 假设每个格子0.5分钟

  return (
    <div className="h-12 border-b-2 border-[var(--atelier-ink)] bg-[var(--atelier-surface)] px-4 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div
          className="w-8 h-8 rounded-sm border-2 border-[var(--atelier-ink)] shadow-[2px_2px_0_var(--atelier-ink)]"
          style={{ backgroundColor: currentColor }}
        />
        <div className="text-sm font-mono font-bold text-[var(--atelier-ink)] px-2">
          {colorInfo.name}
        </div>
        <div className="flex flex-col">
          <div className="text-sm font-medium text-[var(--atelier-ink)]">
            {colorInfo.completed}/{colorInfo.total}
          </div>
          <div className="text-xs text-[var(--atelier-muted)]">
            预计还需 {estimatedTime}分钟
          </div>
        </div>
      </div>
      
      <div className="text-right">
        <div className="rounded-sm bg-[var(--atelier-signal)] px-2 py-0.5 font-mono text-lg font-black text-[#1d1b18]">
          {progressPercentage}%
        </div>
      </div>
    </div>
  );
};

export default ColorStatusBar;
