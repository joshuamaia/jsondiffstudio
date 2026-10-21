import { JsonNode } from './json-ast.model';

export type JsonErrorCode =
  | 'trailing-comma'
  | 'missing-comma'
  | 'unclosed-object'
  | 'unclosed-array'
  | 'unterminated-string'
  | 'unquoted-key'
  | 'single-quotes'
  | 'invalid-value'
  | 'invalid-number'
  | 'invalid-escape'
  | 'control-character'
  | 'comment'
  | 'unexpected-character'
  | 'unexpected-token'
  | 'missing-colon'
  | 'missing-value'
  | 'unexpected-end'
  | 'trailing-content'
  | 'too-deep';

/** Localização de um problema no texto. Linha e coluna começam em 1. */
export interface JsonTextLocation {
  readonly offset: number;
  readonly length: number;
  readonly line: number;
  readonly column: number;
}

export interface JsonSyntaxError extends JsonTextLocation {
  readonly code: JsonErrorCode;
  readonly message: string;
}

export interface JsonWarning extends JsonTextLocation {
  readonly code: 'duplicate-key';
  readonly message: string;
}

export type DocumentStatus = 'empty' | 'valid' | 'invalid';

/** Estado exibido na interface; `processing` indica validação pendente (debounce). */
export type EditorStatus = DocumentStatus | 'processing';

export interface ValidationResult {
  readonly status: DocumentStatus;
  readonly ast: JsonNode | null;
  readonly error: JsonSyntaxError | null;
  readonly warnings: readonly JsonWarning[];
}

export type ParseResult =
  | { readonly ok: true; readonly ast: JsonNode; readonly warnings: readonly JsonWarning[] }
  | { readonly ok: false; readonly error: JsonSyntaxError };
