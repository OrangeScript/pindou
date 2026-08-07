import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPatternFileName } from '../src/utils/fileNaming';
import {
  createFocusPatternId,
  parseFocusSession,
  serializeFocusSession,
  type FocusSessionSnapshot,
} from '../src/utils/focusSession';
import {
  floodFillRegion,
  interpolateGridLine,
  paintBrushStroke,
  replaceMatchingPixels,
} from '../src/utils/pixelEditingUtils';
import type { MappedPixel } from '../src/utils/pixelation';

const red: MappedPixel = { key: 'R1', color: '#FF0000', isExternal: false };
const blue: MappedPixel = { key: 'B1', color: '#0000FF', isExternal: false };
const green: MappedPixel = { key: 'G1', color: '#00FF00', isExternal: false };

test('下载名继承来源文件名并追加图纸后缀', () => {
  assert.equal(buildPatternFileName('作品.v2.png', 'png'), '作品.v2-拼豆图纸.png');
  assert.equal(buildPatternFileName('folder\\头像.jpg', 'csv'), '头像-拼豆图纸.csv');
  assert.equal(buildPatternFileName('/album/猫.webp', 'png', 3), '猫-拼豆图纸-分图3.png');
  assert.equal(buildPatternFileName('   ', 'png'), '未命名-拼豆图纸.png');
});

test('油漆桶只填充四方向连续区域', () => {
  const grid = [
    [red, red, blue],
    [red, blue, blue],
    [blue, blue, red],
  ];
  const result = floodFillRegion(grid, { N: 3, M: 3 }, 0, 0, green);

  assert.equal(result.changedCount, 3);
  assert.equal(result.newPixelData[0][0].key, 'G1');
  assert.equal(result.newPixelData[2][2].key, 'R1');
  assert.equal(grid[0][0].key, 'R1');
  assert.equal(result.newPixelData[2], grid[2]);
});

test('颜色替换覆盖互不相连的同色格', () => {
  const grid = [
    [red, blue],
    [blue, red],
  ];
  const result = replaceMatchingPixels(grid, red, green);

  assert.equal(result.changedCount, 2);
  assert.equal(result.newPixelData[0][0].key, 'G1');
  assert.equal(result.newPixelData[1][1].key, 'G1');
});

test('全局替色保留没有命中颜色的行引用', () => {
  const grid = [
    [red, red],
    [blue, blue],
  ];
  const result = replaceMatchingPixels(grid, red, green);

  assert.notEqual(result.newPixelData[0], grid[0]);
  assert.equal(result.newPixelData[1], grid[1]);
});

test('画笔只复制发生变化的行，重复上色保持原引用', () => {
  const grid = [
    [red, red, red],
    [red, red, red],
    [red, red, red],
  ];
  const painted = paintBrushStroke(grid, [{ row: 1, col: 1 }], 1, 'square', blue);

  assert.equal(painted.changedCount, 1);
  assert.equal(painted.newPixelData[1][1].key, 'B1');
  assert.equal(painted.newPixelData[0], grid[0]);
  assert.notEqual(painted.newPixelData[1], grid[1]);

  const unchanged = paintBrushStroke(painted.newPixelData, [{ row: 1, col: 1 }], 1, 'square', blue);
  assert.equal(unchanged.changedCount, 0);
  assert.equal(unchanged.newPixelData, painted.newPixelData);
});

test('快速拖动画笔时会补齐跨过的网格', () => {
  assert.deepEqual(interpolateGridLine(
    { row: 0, col: 0 },
    { row: 3, col: 3 }
  ), [
    { row: 0, col: 0 },
    { row: 1, col: 1 },
    { row: 2, col: 2 },
    { row: 3, col: 3 },
  ]);
});

test('专心模式会话只恢复到同一张图纸', () => {
  const grid = [[red, blue]];
  const patternId = createFocusPatternId(grid, { N: 2, M: 1 });
  const snapshot: FocusSessionSnapshot = {
    version: 1,
    patternId,
    savedAt: 123,
    currentColor: '#FF0000',
    selectedCell: { row: 0, col: 0 },
    canvasScale: 2,
    canvasOffset: { x: 12, y: -4 },
    completedCells: ['0,0'],
    guidanceMode: 'largest',
    isPaused: true,
    totalElapsedTime: 42,
    gridSectionInterval: 10,
    showSectionLines: true,
    sectionLineColor: '#007acc',
    enableCelebration: false,
  };
  const serialized = serializeFocusSession(snapshot);

  assert.deepEqual(parseFocusSession(serialized, patternId), snapshot);
  assert.equal(parseFocusSession(serialized, 'other-pattern'), null);
  assert.notEqual(
    patternId,
    createFocusPatternId([[green, blue]], { N: 2, M: 1 })
  );
});

test('损坏的专心模式会话会被安全忽略', () => {
  assert.equal(parseFocusSession('{bad json', 'pattern'), null);
  assert.equal(parseFocusSession(JSON.stringify({ version: 1, patternId: 'pattern' }), 'pattern'), null);
});
