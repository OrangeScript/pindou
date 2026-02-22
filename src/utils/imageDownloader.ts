import { GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getDisplayColorKey, getColorKeyByHex, ColorSystem } from './colorSystemUtils';

// 用于获取对比色的工具函数 - 从page.tsx复制
function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000'; // Default to black
  // Simple brightness check (Luma formula Y = 0.2126 R + 0.7152 G + 0.0722 B)
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF'; // Dark background -> white text, Light background -> black text
}

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const formattedHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(formattedHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// 用于排序颜色键的函数 - 从page.tsx复制
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // Sort by prefix first (A, B, C...)
    }
    return numA - numB; // Then sort by number (1, 2, 10...)
  }
  // Fallback for keys that don't match the standard pattern (e.g., T1, ZG1)
  return a.localeCompare(b);
}

// 导出CSV hex数据的函数
export function exportCsvData({
  mappedPixelData,
  gridDimensions,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}): void {
  if (!mappedPixelData || !gridDimensions) {
    console.error("导出失败: 映射数据或尺寸无效。");
    alert("无法导出CSV，数据未生成或无效。");
    return;
  }

  const { N, M } = gridDimensions;
  
  // 生成CSV内容，每行代表图纸的一行
  const csvLines: string[] = [];
  
  for (let row = 0; row < M; row++) {
    const rowData: string[] = [];
    for (let col = 0; col < N; col++) {
      const cellData = mappedPixelData[row][col];
      if (cellData && !cellData.isExternal) {
        // 内部单元格，记录hex颜色值
        rowData.push(cellData.color);
      } else {
        // 外部单元格或空白，使用特殊标记
        rowData.push('TRANSPARENT');
      }
    }
    csvLines.push(rowData.join(','));
  }

  // 创建CSV内容
  const csvContent = csvLines.join('\n');
  
  // 创建并下载CSV文件
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `bead-pattern-${N}x${M}-${selectedColorSystem}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 释放URL对象
  URL.revokeObjectURL(url);
  
  console.log("CSV数据导出完成");
}

// 导入CSV hex数据的函数
export function importCsvData(file: File): Promise<{
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error('无法读取文件内容'));
          return;
        }
        
        // 解析CSV内容
        const lines = text.trim().split('\n');
        const M = lines.length; // 行数
        
        if (M === 0) {
          reject(new Error('CSV文件为空'));
          return;
        }
        
        // 解析第一行获取列数
        const firstRowData = lines[0].split(',');
        const N = firstRowData.length; // 列数
        
        if (N === 0) {
          reject(new Error('CSV文件格式无效'));
          return;
        }
        
        // 创建映射数据
        const mappedPixelData: MappedPixel[][] = [];
        
        for (let row = 0; row < M; row++) {
          const rowData = lines[row].split(',');
          const mappedRow: MappedPixel[] = [];
          
          // 确保每行都有正确的列数
          if (rowData.length !== N) {
            reject(new Error(`第${row + 1}行的列数不匹配，期望${N}列，实际${rowData.length}列`));
            return;
          }
          
          for (let col = 0; col < N; col++) {
            const cellValue = rowData[col].trim();
            
            if (cellValue === 'TRANSPARENT' || cellValue === '') {
              // 外部/透明单元格
              mappedRow.push({
                key: 'TRANSPARENT',
                color: '#FFFFFF',
                isExternal: true
              });
            } else {
              // 验证hex颜色格式
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;
              if (!hexPattern.test(cellValue)) {
                reject(new Error(`第${row + 1}行第${col + 1}列的颜色值无效：${cellValue}`));
                return;
              }
              
              // 内部单元格
              mappedRow.push({
                key: cellValue.toUpperCase(),
                color: cellValue.toUpperCase(),
                isExternal: false
              });
            }
          }
          
          mappedPixelData.push(mappedRow);
        }
        
        // 返回解析结果
        resolve({
          mappedPixelData,
          gridDimensions: { N, M }
        });
        
      } catch (error) {
        reject(new Error(`解析CSV文件失败：${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsText(file, 'utf-8');
  });
}

// 下载图片的主函数
export async function downloadImage({
  mappedPixelData,
  gridDimensions,
  colorCounts,
  totalBeadCount,
  options,
  activeBeadPalette,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: { [key: string]: { count: number; color: string } } | null;
  totalBeadCount: number;
  options: GridDownloadOptions;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: ColorSystem;
}): Promise<void> {
  if (!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0) {
    console.error("下载失败: 映射数据或尺寸无效。");
    alert("无法下载图纸，数据未生成或无效。");
    return;
  }
  if (!colorCounts) {
    console.error("下载失败: 色号统计数据无效。");
    alert("无法下载图纸，色号统计数据未生成或无效。");
    return;
  }
  
  // 加载二维码图片
  const qrCodeImage = new Image();
  qrCodeImage.src = '/website_qrcode.png'; // 使用public目录中的图片
  
  // 主要下载处理函数
  const processDownload = () => {
    const { N, M } = gridDimensions; // 此时已确保gridDimensions不为null
    const downloadCellSize = 30;
  
    // 从下载选项中获取设置
    const { showGrid, gridInterval, showCoordinates, gridLineColor, includeStats, showCellNumbers = true } = options;
  
    // 设置边距空间用于坐标轴标注（如果需要）
    const axisLabelSize = showCoordinates ? Math.max(30, Math.floor(downloadCellSize)) : 0;
    
    // 定义统计区域的基本参数
    const statsPadding = 20;
    let statsHeight = 0;
    
    // 預先計算用於字體大小的變量
    const preCalcWidth = N * downloadCellSize + axisLabelSize;
    const preCalcAvailableWidth = preCalcWidth - (statsPadding * 2);
    
    // 計算字體大小 - 增加 Math.min(3, ...) 限制最大放大倍數，避免字體無限放大
    const baseStatsFontSize = 13;
    const widthFactor = Math.min(3, Math.max(0, preCalcAvailableWidth - 350) / 600);
    const statsFontSize = Math.floor(baseStatsFontSize + (widthFactor * 10));
    
    const baseSwatchSize = 18;
    const swatchSize = Math.floor(baseSwatchSize + (widthFactor * 10)); 

    // 【關鍵修正】動態計算每列需要的最小寬度，不再寫死 160
    // 計算公式：色塊寬度 + 預估文字寬度(約6個字元) + 安全間距
    const minColumnWidth = Math.max(160, swatchSize + (statsFontSize * 6) + 30);
    
    // 计算额外边距，确保坐标数字完全显示（四边都需要）
    const extraLeftMargin = showCoordinates ? Math.max(20, statsFontSize * 2) : 0; // 左侧额外边距
    const extraRightMargin = showCoordinates ? Math.max(20, statsFontSize * 2) : 0; // 右侧额外边距
    const extraTopMargin = Math.max(20, showCoordinates ? Math.max(15, statsFontSize) : 0);
    const extraBottomMargin = showCoordinates ? Math.max(15, statsFontSize) : 0; // 底部额外边距
    
    // 计算网格尺寸
    const gridWidth = N * downloadCellSize;
    const gridHeight = M * downloadCellSize;
    
    // 计算小红书标识区域的高度
    const xiaohongshuAreaHeight = 35; // 为小红书名字预留的底部空间
  
    // 计算标题栏高度（根据图片大小自动调整）
    const baseTitleBarHeight = 0; // 增大基础高度
    
    // 先计算一个初始下载宽度来确定缩放比例
    const initialWidth = gridWidth + axisLabelSize + extraLeftMargin;
    // 使用总宽度而不是单元格大小来计算比例，确保字体在大尺寸图片上也足够大
    const titleBarScale = Math.max(1.0, Math.min(2.0, initialWidth / 1000)); // 更激进的缩放策略
    const titleBarHeight = Math.floor(baseTitleBarHeight * titleBarScale);
    
    // 计算标题文字大小 - 与总体宽度相关而不是单元格大小
    
    // 计算二维码大小
    
    
    // 计算统计区域的大小
    // 计算统计区域的大小
   // 計算統計區域的大小
    if (includeStats && colorCounts) {
      const colorKeys = Object.keys(colorCounts);
      
      const statsTopMargin = 15; 
      
      // 【修改】使用剛剛算好的動態欄寬 minColumnWidth，取代固定的 160
      const numColumns = Math.max(1, Math.floor(preCalcAvailableWidth / minColumnWidth));
      
      const numRows = Math.ceil(colorKeys.length / numColumns);
      
      const statsRowHeight = swatchSize + 12; 
      const titleHeight = 30; 
      const footerHeight = 0; 
      
      // 計算總高度
      statsHeight = titleHeight + (numRows * statsRowHeight) + footerHeight + (statsPadding * 2) + statsTopMargin;
    }
  
    // 调整画布大小，包含标题栏、坐标轴、统计区域和小红书标识区域（四边都有坐标）
    const downloadWidth = gridWidth + (axisLabelSize * 2) + extraLeftMargin + extraRightMargin;
    let downloadHeight = titleBarHeight + gridHeight + (axisLabelSize * 2) + statsHeight + extraTopMargin + extraBottomMargin + xiaohongshuAreaHeight;
  
    let downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = downloadWidth;
    downloadCanvas.height = downloadHeight;
    const context = downloadCanvas.getContext('2d');
    if (!context) {
      console.error("下载失败: 无法创建临时 Canvas Context。");
      alert("无法下载图纸。");
      return;
    }
    
    // 使用非空的context变量
    let ctx = context;
    ctx.imageSmoothingEnabled = false;
  
    // 设置背景色
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, downloadWidth, downloadHeight);
  
    // 重新设计的现代简洁标题栏
    // 1. 主背景 - 纯净的深色，专业感
    ctx.fillStyle = '#1F2937'; // 深灰色，既有专业感又不抢夺主要内容
    ctx.fillRect(0, 0, downloadWidth, titleBarHeight);
    
    // 2. 左侧品牌色块 - 作为Logo载体
    const brandBlockWidth = titleBarHeight * 0.8;
    const brandGradient = ctx.createLinearGradient(0, 0, brandBlockWidth, titleBarHeight);
    brandGradient.addColorStop(0, '#6366F1'); // 现代蓝色
    brandGradient.addColorStop(1, '#8B5CF6'); // 现代紫色
    
    ctx.fillStyle = brandGradient;
    ctx.fillRect(0, 0, brandBlockWidth, titleBarHeight);
    
    // 3. 绘制现代Logo - 几何图形组合
    const logoSize = titleBarHeight * 0.4;
    const logoX = brandBlockWidth / 2;
    const logoY = titleBarHeight / 2;
    
    // Logo: 拼豆的抽象表示 - 圆角方块阵列
    ctx.fillStyle = '#FFFFFF';
    const beadSize = logoSize / 4;
    const beadSpacing = beadSize * 1.2;
    
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const beadX = logoX - logoSize/2 + col * beadSpacing;
        const beadY = logoY - logoSize/2 + row * beadSpacing;
        
        // 绘制圆角方块，模拟拼豆
        ctx.beginPath();
        ctx.roundRect(beadX, beadY, beadSize, beadSize, beadSize * 0.2);
        ctx.fill();
        
        // 添加中心小圆点，增加拼豆特征
        ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
        ctx.beginPath();
        ctx.arc(beadX + beadSize/2, beadY + beadSize/2, beadSize * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
      }
    }
    
  
    
    
    // 7. 优雅的分割线
    const separatorY = titleBarHeight - 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, separatorY);
    ctx.lineTo(downloadWidth, separatorY);
    ctx.stroke();
    
  
    console.log(`Generating download grid image: ${downloadWidth}x${downloadHeight}`);
    const fontSize = Math.max(8, Math.floor(downloadCellSize * 0.4));
    
    // 如果需要，先绘制坐标轴和网格背景
    if (showCoordinates) {
      // 绘制坐标轴背景
      ctx.fillStyle = '#F5F5F5'; // 浅灰色背景
      // 横轴背景 (顶部)
      ctx.fillRect(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin, gridWidth, axisLabelSize);
      // 横轴背景 (底部)
      ctx.fillRect(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight, gridWidth, axisLabelSize);
      // 纵轴背景 (左侧)
      ctx.fillRect(extraLeftMargin, titleBarHeight + extraTopMargin + axisLabelSize, axisLabelSize, gridHeight);
      // 纵轴背景 (右侧)
      ctx.fillRect(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize, axisLabelSize, gridHeight);
      
      // 绘制坐标轴数字
      ctx.fillStyle = '#333333'; // 坐标数字颜色
      // 使用固定的字体大小，不进行缩放
      const axisFontSize = 14;
      ctx.font = `${axisFontSize}px sans-serif`;

      // X轴（顶部）数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        if ((i + 1) % gridInterval === 0 || i === 0 || i === N - 1) { // 在间隔处、起始处和结束处标注
          // 将数字放在轴线之上，考虑额外边距
          const numX = extraLeftMargin + axisLabelSize + (i * downloadCellSize) + (downloadCellSize / 2);
          const numY = titleBarHeight + extraTopMargin + (axisLabelSize / 2);
          ctx.fillText((i + 1).toString(), numX, numY);
        }
      }
      
      // X轴（底部）数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        if ((i + 1) % gridInterval === 0 || i === 0 || i === N - 1) { // 在间隔处、起始处和结束处标注
          // 将数字放在底部轴线上
          const numX = extraLeftMargin + axisLabelSize + (i * downloadCellSize) + (downloadCellSize / 2);
          const numY = titleBarHeight + extraTopMargin + axisLabelSize + gridHeight + (axisLabelSize / 2);
          ctx.fillText((i + 1).toString(), numX, numY);
        }
      }
      
      // Y轴（左侧）数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < M; j++) {
        if ((j + 1) % gridInterval === 0 || j === 0 || j === M - 1) { // 在间隔处、起始处和结束处标注
          // 将数字放在轴线之左
          const numX = extraLeftMargin + (axisLabelSize / 2);
          const numY = titleBarHeight + extraTopMargin + axisLabelSize + (j * downloadCellSize) + (downloadCellSize / 2);
          ctx.fillText((j + 1).toString(), numX, numY);
        }
      }
      
      // Y轴（右侧）数字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < M; j++) {
        if ((j + 1) % gridInterval === 0 || j === 0 || j === M - 1) { // 在间隔处、起始处和结束处标注
          // 将数字放在右侧轴线上
          const numX = extraLeftMargin + axisLabelSize + gridWidth + (axisLabelSize / 2);
          const numY = titleBarHeight + extraTopMargin + axisLabelSize + (j * downloadCellSize) + (downloadCellSize / 2);
          ctx.fillText((j + 1).toString(), numX, numY);
        }
      }
      
      // 绘制坐标轴边框
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = 1;
      // 顶部横轴底边
      ctx.beginPath();
      ctx.moveTo(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize);
      ctx.lineTo(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize);
      ctx.stroke();
      // 底部横轴顶边
      ctx.beginPath();
      ctx.moveTo(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight);
      ctx.lineTo(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight);
      ctx.stroke();
      // 左侧纵轴右边
      ctx.beginPath();
      ctx.moveTo(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize);
      ctx.lineTo(extraLeftMargin + axisLabelSize, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight);
      ctx.stroke();
      // 右侧纵轴左边
      ctx.beginPath();
      ctx.moveTo(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize);
      ctx.lineTo(extraLeftMargin + axisLabelSize + gridWidth, titleBarHeight + extraTopMargin + axisLabelSize + gridHeight);
      ctx.stroke();
    }
    
    // 恢复默认文本对齐和基线，为后续绘制做准备
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 设置用于绘制单元格内容的字体
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 绘制所有单元格
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const cellData = mappedPixelData[j][i];
        // 计算绘制位置，考虑额外边距和标题栏高度
        const drawX = extraLeftMargin + i * downloadCellSize + axisLabelSize;
        const drawY = titleBarHeight + extraTopMargin + j * downloadCellSize + axisLabelSize;

        // 根据是否是外部背景确定填充颜色
        if (cellData && !cellData.isExternal) {
          // 内部单元格：使用珠子颜色填充并绘制文本
          const cellColor = cellData.color || '#FFFFFF';

          ctx.fillStyle = cellColor;
          ctx.fillRect(drawX, drawY, downloadCellSize, downloadCellSize);

          if (showCellNumbers) {
            const cellKey = getDisplayColorKey(cellData.color || '#FFFFFF', selectedColorSystem);
            ctx.fillStyle = getContrastColor(cellColor);
            ctx.fillText(cellKey, drawX + downloadCellSize / 2, drawY + downloadCellSize / 2);
          }
        } else {
          // 外部背景：填充白色
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(drawX, drawY, downloadCellSize, downloadCellSize);
        }

        // 绘制所有单元格的边框
        ctx.strokeStyle = '#DDDDDD'; // 浅色线条作为基础网格
        ctx.lineWidth = 0.5;
        ctx.strokeRect(drawX + 0.5, drawY + 0.5, downloadCellSize, downloadCellSize);
      }
    }

    // 如果需要，绘制分隔网格线
    if (showGrid) {
      ctx.strokeStyle = gridLineColor; // 使用用户选择的颜色
      ctx.lineWidth = 1.5;
      
      // 绘制垂直分隔线 - 在单元格之间而不是边框上
      for (let i = gridInterval; i < N; i += gridInterval) {
        const lineX = extraLeftMargin + i * downloadCellSize + axisLabelSize;
        ctx.beginPath();
        ctx.moveTo(lineX, titleBarHeight + extraTopMargin + axisLabelSize);
        ctx.lineTo(lineX, titleBarHeight + extraTopMargin + axisLabelSize + M * downloadCellSize);
        ctx.stroke();
      }
      
      // 绘制水平分隔线 - 在单元格之间而不是边框上
      for (let j = gridInterval; j < M; j += gridInterval) {
        const lineY = titleBarHeight + extraTopMargin + j * downloadCellSize + axisLabelSize;
        ctx.beginPath();
        ctx.moveTo(extraLeftMargin + axisLabelSize, lineY);
        ctx.lineTo(extraLeftMargin + axisLabelSize + N * downloadCellSize, lineY);
        ctx.stroke();
      }
    }

    // 绘制整个网格区域的主边框
    ctx.strokeStyle = '#000000'; // 黑色边框
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      extraLeftMargin + axisLabelSize + 0.5, 
      titleBarHeight + extraTopMargin + axisLabelSize + 0.5, 
      N * downloadCellSize, 
      M * downloadCellSize
    );

    // 副水印：放在网格左上角，简洁版本
    const secondaryWatermarkFontSize = Math.max(10, Math.floor(downloadCellSize * 0.5));
    const secondaryText = '@Isaac';
    
    ctx.font = `500 ${secondaryWatermarkFontSize}px system-ui, -apple-system, sans-serif`;
    const secondaryMetrics = ctx.measureText(secondaryText);
    const secondaryWidth = secondaryMetrics.width;
    const secondaryHeight = secondaryWatermarkFontSize;
    
    const secondaryWatermarkX = extraLeftMargin + axisLabelSize + 15;
    const secondaryWatermarkY = titleBarHeight + extraTopMargin + axisLabelSize + secondaryHeight + 15;
    
    // 副水印背景
    const secondaryBgPadding = 4;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.roundRect(
      secondaryWatermarkX - secondaryBgPadding,
      secondaryWatermarkY - secondaryHeight - secondaryBgPadding,
      secondaryWidth + secondaryBgPadding * 2,
      secondaryHeight + secondaryBgPadding * 2,
      3
    );
    ctx.fill();
    
    // 副水印文字
    ctx.fillStyle = '#6B7280'; // 中等灰色，存在但不突兀
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(secondaryText, secondaryWatermarkX, secondaryWatermarkY);

    // 绘制统计信息
    if (includeStats && colorCounts) {
      const colorKeys = Object.keys(colorCounts).sort(sortColorKeys);
      
      // 减少间距
      const statsTopMargin = 15; 
      const statsY = titleBarHeight + extraTopMargin + M * downloadCellSize + (axisLabelSize * 2) + statsTopMargin;
      
      const availableStatsWidth = downloadWidth - (statsPadding * 2);
      
      // 使用更紧凑的列宽计算 (160px)
      const renderNumColumns = Math.max(1, Math.floor(availableStatsWidth / minColumnWidth));
      const itemWidth = Math.floor(availableStatsWidth / renderNumColumns);

      // 计算色块大小
      const baseSwatchSize = 18;
      const swatchSize = Math.floor(baseSwatchSize + (widthFactor * 10));
      const statsRowHeight = swatchSize + 12;

      // 1. 绘制整合后的标题栏 (包含总数)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      
      // 绘制左侧标题
      ctx.fillStyle = '#333333';
      ctx.font = `bold ${Math.max(14, statsFontSize + 2)}px sans-serif`;
      ctx.fillText('用色统计', statsPadding, statsY + 15);

      // 绘制右侧总数 (原本在最底部的数字，现在移到标题右侧)
      ctx.textAlign = 'right';
      ctx.fillStyle = '#666666';
      ctx.font = `${Math.max(12, statsFontSize)}px sans-serif`;
      ctx.fillText(`共 ${totalBeadCount} 颗`, downloadWidth - statsPadding, statsY + 15);

      // 绘制一条淡一点的分隔线
      ctx.strokeStyle = '#EEEEEE';
      ctx.beginPath();
      ctx.moveTo(statsPadding, statsY + 30);
      ctx.lineTo(downloadWidth - statsPadding, statsY + 30);
      ctx.stroke();

      const titleHeight = 35; // 标题区域占用的总高度

      // 设置列表字体
      ctx.font = `${statsFontSize}px sans-serif`;
      
      // 2. 绘制紧凑的颜色列表
      colorKeys.forEach((key, index) => {
        const rowIndex = Math.floor(index / renderNumColumns);
        const colIndex = index % renderNumColumns;
        
        const itemX = statsPadding + (colIndex * itemWidth);
        const rowY = statsY + titleHeight + (rowIndex * statsRowHeight) + (statsRowHeight / 2);
        
        const cellData = colorCounts[key];
        
        // 绘制圆形色块 (比方块更柔和)
        ctx.fillStyle = cellData.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        // 如果你还是喜欢方块，用 fillRect 替换这里
        ctx.arc(itemX + swatchSize/2, rowY, swatchSize/2, 0, Math.PI * 2); 
        ctx.fill();
        ctx.stroke();
        
        // 绘制文字信息
        ctx.fillStyle = '#333333';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        // 色号
        const colorCode = getColorKeyByHex(key, selectedColorSystem);
        ctx.fillText(colorCode, itemX + swatchSize + 8, rowY);
        
        // 数量 (紧跟在色号后面，用灰色显示，不再强制靠右对齐，看起来更紧凑)
        ctx.fillStyle = '#888888';
        const countText = `×${cellData.count}`;
        // 测量色号宽度，以便紧跟其后
        const codeWidth = ctx.measureText(colorCode).width;
        ctx.fillText(countText, itemX + swatchSize + 8 + codeWidth + 5, rowY);
      });

      // 3. 简化的水印 (可选：如果你觉得太乱可以把这段也删掉)
      // 计算水印位置：紧贴最后一行下方
      const numRows = Math.ceil(colorKeys.length / renderNumColumns);
      const watermarkY = statsY + titleHeight + (numRows * statsRowHeight) + 15;
      
      ctx.fillStyle = '#AAAAAA';
      ctx.font = `10px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText('Designed by @Isaac', downloadWidth - statsPadding, watermarkY);
      
      // 更新最终高度变量用于后续画布调整
      statsHeight = titleHeight + (numRows * statsRowHeight) + 20; // +20 给水印留点地
    }

    // 重新计算画布高度并调整
    if (includeStats && colorCounts) {
      // 调整画布大小，包含计算后的统计区域和小红书标识区域
      const newDownloadHeight = titleBarHeight + extraTopMargin + M * downloadCellSize + (axisLabelSize * 2) + statsHeight + extraBottomMargin + xiaohongshuAreaHeight;
      
      if (downloadHeight !== newDownloadHeight) {
        // 如果高度变化了，需要创建新的画布并复制当前内容
        const newCanvas = document.createElement('canvas');
        newCanvas.width = downloadWidth;
        newCanvas.height = newDownloadHeight;
        const newContext = newCanvas.getContext('2d');
        
        if (newContext) {
          // 复制原画布内容
          newContext.drawImage(downloadCanvas, 0, 0);
          
          // 更新画布和上下文引用
          downloadCanvas = newCanvas;
          ctx = newContext;
          ctx.imageSmoothingEnabled = false;
          
          // 更新高度
          downloadHeight = newDownloadHeight;
        }
      }
    }

    try {
      const dataURL = downloadCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = showCellNumbers
        ? `bead-grid-${N}x${M}-keys-palette_${selectedColorSystem}.png`
        : `bead-grid-${N}x${M}-pixel-palette_${selectedColorSystem}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log("Grid image download initiated.");
      
      // 如果启用了CSV导出，同时导出CSV文件
      if (options.exportCsv) {
        exportCsvData({
          mappedPixelData,
          gridDimensions,
          selectedColorSystem
        });
      }
    } catch (e) {
      console.error("下载图纸失败:", e);
      alert("无法生成图纸下载链接。");
    }
  };
  
  // 图片加载后处理，或在加载失败时使用占位符
  if (qrCodeImage.complete) {
    processDownload();
  } else {
    qrCodeImage.onload = processDownload;
    qrCodeImage.onerror = () => {
      console.warn("二维码图片加载失败，将使用占位符");
      processDownload();
    };
  }
} 
