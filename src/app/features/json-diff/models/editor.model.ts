import { TextRange } from './json-ast.model';
import { ChangeKind, DiffKind } from './diff.model';

export type EditorSide = 'original' | 'modified';

export const SIDE_LABEL: Readonly<Record<EditorSide, string>> = {
  original: 'JSON Original',
  modified: 'JSON Modificado',
};

/** Origem de uma alteração de texto; somente `typing` passa por debounce. */
export type TextChangeSource = 'typing' | 'paste' | 'import' | 'format' | 'example' | 'clear';

export interface TextChange {
  readonly text: string;
  readonly source: TextChangeSource;
}

/** Marcação de diferença a ser desenhada em um editor (independente do Monaco). */
export interface EditorDiffMark {
  readonly id: string;
  readonly kind: ChangeKind;
  /** `change`: trecho existe neste documento; `absent`: indicador de ausência. */
  readonly type: 'change' | 'absent';
  readonly range: TextRange;
  /** Trecho do valor alterado, para destaque inline (somente valores primitivos). */
  readonly valueRange: TextRange | null;
  /** Texto curto exibido após a linha nos indicadores de ausência. */
  readonly label: string;
  /** Tooltip em Markdown. */
  readonly hover: string;
}

/** Pedido para rolar até um trecho e destacá-lo temporariamente. */
export interface EditorFocusRequest {
  readonly nonce: number;
  readonly range: TextRange;
  readonly kind: DiffKind;
  readonly absent: boolean;
}
