// 下载网格的选项类型定义
export type GridDownloadOptions = {
  showGrid: boolean;
  gridInterval: number;
  showCoordinates: boolean;
  showCellNumbers: boolean;
  gridLineColor: string;
  includeStats: boolean;
  exportCsv: boolean; // 是否同时导出CSV hex数据
  trimTransparent: boolean; // 裁剪掉四周的透明/外部区域
};
