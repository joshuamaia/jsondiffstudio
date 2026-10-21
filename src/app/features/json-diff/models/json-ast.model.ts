/**
 * AST produzido pelo parser próprio do JSON Diff Studio.
 *
 * Todos os nós carregam offsets (`start` inclusivo, `end` exclusivo) relativos ao texto
 * de origem. Isso permite mapear diferenças estruturais de volta para linhas do editor
 * sem acoplar o algoritmo ao Monaco.
 */

export type JsonValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

interface JsonNodeBase extends TextRange {
  readonly type: JsonValueType;
}

export interface JsonObjectNode extends JsonNodeBase {
  readonly type: 'object';
  readonly properties: readonly JsonPropertyNode[];
}

export interface JsonPropertyNode extends TextRange {
  /** Nome da propriedade já decodificado (escapes resolvidos). */
  readonly key: string;
  /** Token original do nome, incluindo aspas. */
  readonly keyRaw: string;
  readonly keyStart: number;
  readonly keyEnd: number;
  readonly value: JsonNode;
}

export interface JsonArrayNode extends JsonNodeBase {
  readonly type: 'array';
  readonly items: readonly JsonNode[];
}

export interface JsonStringNode extends JsonNodeBase {
  readonly type: 'string';
  readonly value: string;
  /** Token original, incluindo aspas e escapes exatamente como digitados. */
  readonly raw: string;
}

export interface JsonNumberNode extends JsonNodeBase {
  readonly type: 'number';
  /** Token numérico original — nunca convertido, para não perder precisão. */
  readonly raw: string;
}

export interface JsonBooleanNode extends JsonNodeBase {
  readonly type: 'boolean';
  readonly value: boolean;
}

export interface JsonNullNode extends JsonNodeBase {
  readonly type: 'null';
}

export type JsonNode =
  JsonObjectNode | JsonArrayNode | JsonStringNode | JsonNumberNode | JsonBooleanNode | JsonNullNode;

export type JsonContainerNode = JsonObjectNode | JsonArrayNode;

export function isContainer(node: JsonNode | null | undefined): node is JsonContainerNode {
  return !!node && (node.type === 'object' || node.type === 'array');
}
