// Vendored from the official PerfectPixel web demo at commit
// f30589fec619036b21fe1ccf29d6deb473b50720.
// Upstream: https://github.com/theamusing/perfectPixel_webdemo

import { NdArray } from './types';

export function createNdArray(data: Float32Array, shape: number[]): NdArray {
  const stride: number[] = [];
  let s = 1;
  for (let i = shape.length - 1; i >= 0; i--) {
    stride[i] = s;
    s *= shape[i];
  }

  return {
    data,
    shape,
    stride,
    offset: 0,
    size: data.length,
    get(...indices: number[]) {
      let idx = 0;
      for (let i = 0; i < indices.length; i++) {
        idx += indices[i] * stride[i];
      }
      return data[idx];
    },
    set(...args: number[]) {
      const val = args.pop()!;
      let idx = 0;
      for (let i = 0; i < args.length; i++) {
        idx += args[i] * stride[i];
      }
      data[idx] = val;
    }
  };
}

export const ops = {
  assigns(array: NdArray, value: number) {
    array.data.fill(value);
  }
};

/**
 * Basic FFT implementation for 2D arrays.
 * Handles non-square arrays. Dimensions must be power of 2 for the internal fft1d.
 */
export function fft2d(dir: number, real: NdArray, imag: NdArray) {
  const [rows, cols] = real.shape;

  // Row-wise FFT: process each row of length 'cols'
  for (let i = 0; i < rows; i++) {
    const r = new Float32Array(cols);
    const m = new Float32Array(cols);
    for (let j = 0; j < cols; j++) {
      r[j] = real.get(i, j);
      m[j] = imag.get(i, j);
    }
    fft1d(dir, r, m);
    for (let j = 0; j < cols; j++) {
      real.set(i, j, r[j]);
      imag.set(i, j, m[j]);
    }
  }

  // Column-wise FFT: process each column of length 'rows'
  for (let j = 0; j < cols; j++) {
    const r = new Float32Array(rows);
    const m = new Float32Array(rows);
    for (let i = 0; i < rows; i++) {
      r[i] = real.get(i, j);
      m[i] = imag.get(i, j);
    }
    fft1d(dir, r, m);
    for (let i = 0; i < rows; i++) {
      real.set(i, j, r[i]);
      imag.set(i, j, m[i]);
    }
  }
}

function fft1d(dir: number, real: Float32Array, imag: Float32Array) {
  const n = real.length;
  // Basic validation: Radix-2 FFT requires power of 2 length
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    console.warn(`FFT length ${n} is not a power of 2. Results will be inaccurate. Use padding.`);
  }

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Cooley-Tukey iterative
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (2 * Math.PI * dir) / len;
    const wlen_r = Math.cos(angle);
    const wlen_i = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let w_r = 1;
      let w_i = 0;
      for (let k = 0; k < len / 2; k++) {
        const u_r = real[i + k];
        const u_i = imag[i + k];
        const v_r = real[i + k + len / 2] * w_r - imag[i + k + len / 2] * w_i;
        const v_i = real[i + k + len / 2] * w_i + imag[i + k + len / 2] * w_r;
        real[i + k] = u_r + v_r;
        imag[i + k] = u_i + v_i;
        real[i + k + len / 2] = u_r - v_r;
        imag[i + k + len / 2] = u_i - v_i;
        const tmp_r = w_r * wlen_r - w_i * wlen_i;
        w_i = w_r * wlen_i + w_i * wlen_r;
        w_r = tmp_r;
      }
    }
  }

  if (dir === -1) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}
