const PATTERN_FILE_SUFFIX = '-拼豆图纸';

/**
 * 下载图纸始终继承上传文件的名称，避免批量任务生成无法对应来源的独立编号。
 */
export function buildPatternFileName(
  sourceFileName: string | null | undefined,
  extension: 'png' | 'csv',
  partIndex?: number
): string {
  const normalizedName = sourceFileName?.trim().replace(/\\/g, '/').split('/').pop();
  const lastDotIndex = normalizedName?.lastIndexOf('.') ?? -1;
  const sourceName = normalizedName
    ? lastDotIndex > 0
      ? normalizedName.slice(0, lastDotIndex)
      : normalizedName
    : '未命名';
  const partSuffix = partIndex === undefined ? '' : `-分图${partIndex}`;

  return `${sourceName}${PATTERN_FILE_SUFFIX}${partSuffix}.${extension}`;
}
