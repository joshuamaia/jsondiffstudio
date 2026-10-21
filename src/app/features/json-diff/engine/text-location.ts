import { JsonTextLocation } from '../models/validation.model';

/**
 * Converte offsets em linha/coluna (base 1), tratando `\n`, `\r\n` e `\r` como quebras —
 * o mesmo critério usado pelo Monaco Editor.
 */
export class LineIndex {
  private readonly lineStarts: number[] = [0];

  constructor(private readonly text: string) {
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 13 /* \r */) {
        if (text.charCodeAt(i + 1) === 10) i++;
        this.lineStarts.push(i + 1);
      } else if (ch === 10 /* \n */) {
        this.lineStarts.push(i + 1);
      }
    }
  }

  get lineCount(): number {
    return this.lineStarts.length;
  }

  positionAt(offset: number): { line: number; column: number } {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.lineStarts[mid] <= clamped) low = mid;
      else high = mid - 1;
    }
    return { line: low + 1, column: clamped - this.lineStarts[low] + 1 };
  }

  location(offset: number, length: number): JsonTextLocation {
    const { line, column } = this.positionAt(offset);
    return { offset, length: Math.max(0, length), line, column };
  }
}

export function locate(text: string, offset: number, length = 1): JsonTextLocation {
  return new LineIndex(text).location(offset, length);
}
