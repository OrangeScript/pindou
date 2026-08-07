export type ManualEditorTool =
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'replace'
  | 'picker'
  | 'pan';

export type BrushShape = 'circle' | 'square';

export type TouchInteractionMode = 'draw' | 'navigate';

export type EditorPointerPhase = 'start' | 'move' | 'end' | 'cancel';

export interface GridCellPosition {
  row: number;
  col: number;
}
