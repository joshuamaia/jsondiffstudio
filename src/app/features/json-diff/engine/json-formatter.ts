import { JsonNode } from '../models/json-ast.model';
import { JsonSyntaxError } from '../models/validation.model';
import { parseJson } from './json-parser';

export type IndentSize = 2 | 4;

export type FormatResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: JsonSyntaxError };

/**
 * Pretty print a partir do AST. Números, strings e nomes de propriedades são emitidos
 * exatamente como o token original (`raw`) — nunca passam por `JSON.parse`/`JSON.stringify`,
 * então inteiros grandes, `1.0`, `1e3` e escapes como `é` são preservados.
 */
export function formatJson(text: string, indent: IndentSize = 2): FormatResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: printJson(parsed.ast, indent) };
}

export function printJson(node: JsonNode, indent: IndentSize = 2): string {
  const out: string[] = [];
  const unit = ' '.repeat(indent);
  const pads: string[] = [''];
  const pad = (level: number): string => (pads[level] ??= unit.repeat(level));

  const write = (n: JsonNode, level: number): void => {
    switch (n.type) {
      case 'object': {
        if (n.properties.length === 0) {
          out.push('{}');
          return;
        }
        out.push('{\n');
        n.properties.forEach((p, i) => {
          out.push(pad(level + 1), p.keyRaw, ': ');
          write(p.value, level + 1);
          out.push(i < n.properties.length - 1 ? ',\n' : '\n');
        });
        out.push(pad(level), '}');
        return;
      }
      case 'array': {
        if (n.items.length === 0) {
          out.push('[]');
          return;
        }
        out.push('[\n');
        n.items.forEach((item, i) => {
          out.push(pad(level + 1));
          write(item, level + 1);
          out.push(i < n.items.length - 1 ? ',\n' : '\n');
        });
        out.push(pad(level), ']');
        return;
      }
      case 'string':
      case 'number':
        out.push(n.raw);
        return;
      case 'boolean':
        out.push(n.value ? 'true' : 'false');
        return;
      case 'null':
        out.push('null');
        return;
    }
  };

  write(node, 0);
  return out.join('');
}

/** Serialização compacta (uma linha, com espaço após `:` e `,`), preservando tokens. */
export function compactJson(node: JsonNode, maxLength = Number.POSITIVE_INFINITY): string {
  let out = '';
  let truncated = false;

  const write = (n: JsonNode): void => {
    if (out.length > maxLength) {
      truncated = true;
      return;
    }
    switch (n.type) {
      case 'object':
        out += '{';
        n.properties.forEach((p, i) => {
          if (truncated) return;
          if (i > 0) out += ', ';
          out += p.keyRaw + ': ';
          write(p.value);
        });
        out += '}';
        return;
      case 'array':
        out += '[';
        n.items.forEach((item, i) => {
          if (truncated) return;
          if (i > 0) out += ', ';
          write(item);
        });
        out += ']';
        return;
      case 'string':
      case 'number':
        out += n.raw;
        return;
      case 'boolean':
        out += n.value ? 'true' : 'false';
        return;
      case 'null':
        out += 'null';
        return;
    }
  };

  write(node);
  return out.length > maxLength || truncated ? out.slice(0, maxLength) + '…' : out;
}

/**
 * Mapeia um offset do texto original para o texto formatado.
 *
 * A formatação só altera espaços em branco fora de strings, portanto a sequência de
 * caracteres "significativos" é idêntica nos dois textos. O cursor é preservado contando
 * quantos caracteres significativos existem antes dele.
 */
export function mapOffset(fromText: string, toText: string, offset: number): number {
  return offsetOfSignificantIndex(toText, significantIndexAt(fromText, offset));
}

function significantIndexAt(text: string, offset: number): number {
  let count = 0;
  let inString = false;
  let escaped = false;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i++) {
    const c = text[i];
    if (inString) {
      count++;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (!isJsonWhitespace(c)) {
      count++;
      if (c === '"') inString = true;
    }
  }
  return count;
}

function offsetOfSignificantIndex(text: string, index: number): number {
  if (index <= 0) return 0;
  let count = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      count++;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (!isJsonWhitespace(c)) {
      count++;
      if (c === '"') inString = true;
    } else {
      continue;
    }
    if (count === index) return i + 1;
  }
  return text.length;
}

function isJsonWhitespace(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\r' || c === '\t';
}
