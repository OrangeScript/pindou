export type ManualEditorTool =
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'replace'
  | 'picker'
  | 'pan';

export type BrushShape = 'circle' | 'square';

export type EditorPointerPhase = 'start' | 'move' | 'end';

export interface GridCellPosition {
  row: number;
  col: number;
}
