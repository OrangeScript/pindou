import React, { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { PixelationMode, PaletteColor, MIN_GRID_GRANULARITY, MAX_GRID_GRANULARITY } from '../utils/pixelation';
import { GridDownloadOptions } from '../types/downloadTypes';
import { ColorSystem } from '../utils/colorSystemUtils';
import {
  BatchFileItem,
  BatchGlobalSettings,
  batchProcessAndDownload
} from '../utils/batchProcessing';
import { notify } from '../utils/notifications';

interface BatchUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeBeadPalette: PaletteColor[];
  downloadOptions: GridDownloadOptions;
  selectedColorSystem: ColorSystem;
  defaultGranularity: number;
  defaultSimilarityThreshold: number;
  defaultPixelationMode: PixelationMode;
}

let fileIdCounter = 0;

const BatchUploadModal: React.FC<BatchUploadModalProps> = ({
  isOpen,
  onClose,
  activeBeadPalette,
  downloadOptions,
  selectedColorSystem,
  defaultGranularity,
  defaultSimilarityThreshold,
  defaultPixelationMode
}) => {
  const [files, setFiles] = useState<BatchFileItem[]>([]);
  const [globalSettings, setGlobalSettings] = useState<BatchGlobalSettings>({
    granularity: defaultGranularity,
    similarityThreshold: defaultSimilarityThreshold,
    pixelationMode: defaultPixelationMode
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const imageFiles = Array.from(newFiles).filter(f => {
      const type = f.type.toLowerCase();
      return type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png';
    });
    
    if (imageFiles.length === 0) {
      notify('没有找到支持的图片文件（仅支持 JPG/PNG）', 'warning');
      return;
    }
    
    const items: BatchFileItem[] = imageFiles.map(f => ({
      id: `batch-${++fileIdCounter}`,
      file: f,
      name: f.name,
      granularity: null,
      similarityThreshold: null,
      pixelationMode: null,
      status: 'pending' as const
    }));
    
    setFiles(prev => [...prev, ...items]);
  }, []);

  const handleFolderSelect = () => {
    folderInputRef.current?.click();
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFolderChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (expandedFileId === id) setExpandedFileId(null);
  };

  const clearAll = () => {
    setFiles([]);
    setExpandedFileId(null);
  };

  const updateFileSettings = (id: string, key: keyof Pick<BatchFileItem, 'granularity' | 'similarityThreshold' | 'pixelationMode'>, value: number | PixelationMode | null) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const handleProcess = async () => {
    if (files.length === 0 || activeBeadPalette.length === 0) return;
    setIsProcessing(true);
    
    // 重置所有文件状态
    setFiles(prev => prev.map(f => ({ ...f, status: 'pending' as const, errorMessage: undefined })));
    
    try {
      await batchProcessAndDownload(
        files,
        globalSettings,
        activeBeadPalette,
        downloadOptions,
        selectedColorSystem,
        (fileId, status, errorMessage) => {
          setFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, status, errorMessage } : f
          ));
        }
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const pendingCount = files.filter(f => f.status === 'pending').length;
  const doneCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">批量处理图片</h3>
          <button onClick={onClose} disabled={isProcessing} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* 文件夹/文件上传区 */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              拖放图片文件到此处，或选择上传方式：
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleFolderSelect}
                disabled={isProcessing}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                📁 选择文件夹
              </button>
              <button
                onClick={handleFileSelect}
                disabled={isProcessing}
                className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                📄 选择文件
              </button>
            </div>
            {/* 隐藏的文件输入 */}
            <input
              ref={folderInputRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png"
              multiple
              /* @ts-expect-error webkitdirectory is a non-standard attribute */
              webkitdirectory=""
              onChange={handleFolderChange}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png"
              multiple
              onChange={handleFileChange}
            />
          </div>

          {/* 全局默认设置 */}
          {files.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">全局默认设置</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">横轴切割数量</label>
                  <input
                    type="number"
                    min={MIN_GRID_GRANULARITY}
                    max={MAX_GRID_GRANULARITY}
                    value={globalSettings.granularity}
                    onChange={(e) => setGlobalSettings(prev => ({ ...prev, granularity: Math.max(MIN_GRID_GRANULARITY, Math.min(MAX_GRID_GRANULARITY, parseInt(e.target.value) || 32)) }))}
                    disabled={isProcessing}
                    className="w-full mt-1 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">颜色合并阈值</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={globalSettings.similarityThreshold}
                    onChange={(e) => setGlobalSettings(prev => ({ ...prev, similarityThreshold: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))}
                    disabled={isProcessing}
                    className="w-full mt-1 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">解析模式</label>
                  <select
                    value={globalSettings.pixelationMode}
                    onChange={(e) => setGlobalSettings(prev => ({ ...prev, pixelationMode: e.target.value as PixelationMode }))}
                    disabled={isProcessing}
                    className="w-full mt-1 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-50"
                  >
                    <option value={PixelationMode.Dominant}>卡通模式</option>
                    <option value={PixelationMode.Average}>真实模式</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 文件列表 */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  文件列表 ({files.length} 个)
                  {doneCount > 0 && <span className="text-green-500 ml-2">✓ {doneCount}</span>}
                  {errorCount > 0 && <span className="text-red-500 ml-2">✗ {errorCount}</span>}
                </h4>
                <button
                  onClick={clearAll}
                  disabled={isProcessing}
                  className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
                >
                  清空全部
                </button>
              </div>
              
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {files.map((item) => (
                  <div key={item.id} className="border dark:border-gray-600 rounded-lg overflow-hidden">
                    {/* 文件行 */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800">
                      {/* 状态指示器 */}
                      <span className="flex-shrink-0 w-5 text-center">
                        {item.status === 'pending' && <span className="text-gray-400">○</span>}
                        {item.status === 'processing' && (
                          <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        )}
                        {item.status === 'done' && <span className="text-green-500">✓</span>}
                        {item.status === 'error' && <span className="text-red-500">✗</span>}
                      </span>
                      
                      {/* 文件名 */}
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate" title={item.name}>
                        {item.name}
                      </span>
                      
                      {/* 自定义标记 */}
                      {(item.granularity !== null || item.similarityThreshold !== null || item.pixelationMode !== null) && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded">
                          自定义
                        </span>
                      )}
                      
                      {/* 展开/折叠 */}
                      <button
                        onClick={() => setExpandedFileId(expandedFileId === item.id ? null : item.id)}
                        disabled={isProcessing}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 text-xs"
                        title="个性化设置"
                      >
                        {expandedFileId === item.id ? '▲' : '▼'}
                      </button>
                      
                      {/* 删除 */}
                      <button
                        onClick={() => removeFile(item.id)}
                        disabled={isProcessing}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                        title="移除"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* 错误信息 */}
                    {item.status === 'error' && item.errorMessage && (
                      <div className="px-3 py-1 bg-red-50 dark:bg-red-900/30 text-xs text-red-600 dark:text-red-400">
                        {item.errorMessage}
                      </div>
                    )}
                    
                    {/* 展开的个性化设置 */}
                    {expandedFileId === item.id && (
                      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t dark:border-gray-600">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          留空则使用全局默认值
                        </p>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400">切割数量</label>
                            <input
                              type="number"
                              min={MIN_GRID_GRANULARITY}
                              max={MAX_GRID_GRANULARITY}
                              placeholder={String(globalSettings.granularity)}
                              value={item.granularity ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateFileSettings(item.id, 'granularity', val ? Math.max(MIN_GRID_GRANULARITY, Math.min(MAX_GRID_GRANULARITY, parseInt(val) || 32)) : null);
                              }}
                              disabled={isProcessing}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400">合并阈值</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              placeholder={String(globalSettings.similarityThreshold)}
                              value={item.similarityThreshold ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateFileSettings(item.id, 'similarityThreshold', val ? Math.max(0, Math.min(100, parseInt(val) || 0)) : null);
                              }}
                              disabled={isProcessing}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400">解析模式</label>
                            <select
                              value={item.pixelationMode ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateFileSettings(item.id, 'pixelationMode', val ? val as PixelationMode : null);
                              }}
                              disabled={isProcessing}
                              className="w-full mt-1 px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 disabled:opacity-50"
                            >
                              <option value="">默认</option>
                              <option value={PixelationMode.Dominant}>卡通模式</option>
                              <option value={PixelationMode.Average}>真实模式</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="p-4 border-t dark:border-gray-700 flex justify-between items-center flex-shrink-0 bg-white dark:bg-gray-800">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isProcessing
              ? `处理中... ${doneCount}/${files.length}`
              : files.length > 0
                ? `共 ${files.length} 个文件${pendingCount === files.length ? '' : ` (${doneCount} 完成)`}`
                : '请添加图片文件'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg transition-colors text-sm disabled:opacity-50"
            >
              {isProcessing ? '处理中...' : '关闭'}
            </button>
            <button
              onClick={handleProcess}
              disabled={isProcessing || files.length === 0 || activeBeadPalette.length === 0}
              className="atelier-button atelier-button--signal px-4 py-2 text-sm"
            >
              {isProcessing ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  处理中
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  批量处理并下载
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchUploadModal;
