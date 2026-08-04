// Vendored from the official PerfectPixel web demo at commit
// f30589fec619036b21fe1ccf29d6deb473b50720.
// Upstream: https://github.com/theamusing/perfectPixel_webdemo

export type SamplingMethod = 'center' | 'majority';

export interface NdArray {
  data: Float32Array;
  shape: number[];
  stride: number[];
  offset: number;
  size: number;
  get: (...args: number[]) => number;
  set: (...args: number[]) => void;
}

export interface PerfectPixelOptions {
  sampleMethod?: SamplingMethod;
  gridSize?: [number, number] | null;
  minSize?: number;
}

export interface DebugData {
  smoothRow: Float32Array;
  smoothCol: Float32Array;
  peakRow: number | null;
  peakCol: number | null;
  peaksRow?: [number, number] | null;
  peaksCol?: [number, number] | null;
  magData?: Float32Array;
  magShape?: number[];
}

export interface PerfectPixelResult {
  refinedW: number | null;
  refinedH: number | null;
  scaled: NdArray;
  debugData?: DebugData;
}
