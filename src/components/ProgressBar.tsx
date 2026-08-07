import React from 'react';

interface ProgressBarProps {
  progressPercentage: number;
  recommendedCell?: { row: number; col: number } | null;
  colorInfo?: {
    color: string;
    name: string;
    total: number;
    completed: number;
  };
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progressPercentage,
  recommendedCell
}) => {
  // 生成7个圆点来表示进度
  const progressDots = Array.from({ length: 7 }, (_, index) => {
    const threshold = (index + 1) * (100 / 7);
    const isFilled = progressPercentage >= threshold;
    
    return (
      <div
        key={index}
        className={`w-3 h-3 rounded-full ${
          isFilled ? 'bg-[var(--atelier-accent)]' : 'bg-[var(--atelier-paper-deep)]'
        }`}
      />
    );
  });

  return (
    <div className="h-10 border-b-2 border-[var(--atelier-ink)] bg-[var(--atelier-surface)] px-4 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        {progressDots}
        <span className="ml-2 font-mono text-sm font-bold text-[var(--atelier-ink)]">
          {progressPercentage}%
        </span>
      </div>
      
      <div className="font-mono text-xs text-[var(--atelier-muted)]">
        {recommendedCell ? (
          <span>下一块 → {recommendedCell.row + 1},{recommendedCell.col + 1}</span>
        ) : (
          <span>已完成当前颜色</span>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;
