import {
  JsonArrayNode,
  JsonNode,
  JsonObjectNode,
  JsonPropertyNode,
} from '../models/json-ast.model';
import {
  JsonErrorCode,
  JsonSyntaxError,
  JsonWarning,
  ParseResult,
} from '../models/validation.model';
import { LineIndex } from './text-location';

/**
 * Parser JSON (RFC 8259) escrito à mão, sem dependências.
 *
 * Diferente de `JSON.parse`, ele:
 * - produz um AST com offsets de cada nó (usado para destacar diferenças no editor);
 * - preserva o token original de números e strings (sem perda de precisão);
 * - gera mensagens de erro em português, específicas para os enganos mais comuns
 *   (vírgula sobrando, aspas simples, comentários, chaves não fechadas...).
 */

export const MAX_NESTING_DEPTH = 1000;

type TokenKind =
  | '{'
  | '}'
  | '['
  | ']'
  | ':'
  | ','
  | 'string'
  | 'number'
  | 'true'
  | 'false'
  | 'null'
  | 'identifier'
  | 'eof';

interface Token {
  readonly kind: TokenKind;
  readonly start: number;
  readonly end: number;
  /** Valor decodificado (apenas para strings). */
  readonly value?: string;
}

class JsonParseFailure {
  constructor(
    readonly code: JsonErrorCode,
    readonly message: string,
    readonly offset: number,
    readonly length: number,
  ) {}
}

const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const IDENTIFIER_CHAR = /[\p{L}\p{N}_$]/u;
const NUMBER_RUN_CHAR = /[0-9A-Za-z.+\-]/;

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

const INVALID_LITERAL_HINTS: Readonly<Record<string, string>> = {
  True: 'Use "true" (minúsculo).',
  TRUE: 'Use "true" (minúsculo).',
  False: 'Use "false" (minúsculo).',
  FALSE: 'Use "false" (minúsculo).',
  Null: 'Use "null" (minúsculo).',
  NULL: 'Use "null" (minúsculo).',
  None: 'Use "null" para representar ausência de valor.',
  nil: 'Use "null" para representar ausência de valor.',
  undefined: '"undefined" não existe em JSON — use null ou remova a propriedade.',
  NaN: 'NaN não é um número JSON válido — use null ou uma string.',
  Infinity: 'Infinity não é um número JSON válido — use null ou uma string.',
};

class Scanner {
  pos = 0;

  constructor(private readonly text: string) {}

  next(): Token {
    this.skipWhitespace();
    const { text } = this;
    const start = this.pos;
    if (start >= text.length) return { kind: 'eof', start, end: start };

    const ch = text[start];
    switch (ch) {
      case '{':
      case '}':
      case '[':
      case ']':
      case ':':
      case ',':
        this.pos++;
        return { kind: ch, start, end: this.pos };
      case '"':
        return this.scanString(start);
      case "'":
        throw new JsonParseFailure(
          'single-quotes',
          'Aspas simples não são permitidas: strings e nomes de propriedades devem usar aspas duplas (").',
          start,
          this.lengthUntilQuote(start, "'"),
        );
      case '/':
        if (text[start + 1] === '/' || text[start + 1] === '*') {
          throw new JsonParseFailure(
            'comment',
            'Comentários não são permitidos em JSON.',
            start,
            this.commentLength(start),
          );
        }
        break;
    }

    if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
      return this.scanNumber(start);
    }
    if (IDENTIFIER_CHAR.test(ch)) {
      return this.scanIdentifier(start);
    }
    throw new JsonParseFailure(
      'unexpected-character',
      `Caractere inesperado ${describeChar(ch)}.`,
      start,
      ch.length,
    );
  }

  private skipWhitespace(): void {
    const { text } = this;
    while (this.pos < text.length) {
      const c = text.charCodeAt(this.pos);
      if (c === 32 || c === 9 || c === 10 || c === 13) this.pos++;
      else break;
    }
  }

  private scanString(start: number): Token {
    const { text } = this;
    let pos = start + 1;
    let value = '';
    let segmentStart = pos;

    while (true) {
      if (pos >= text.length) {
        throw new JsonParseFailure(
          'unterminated-string',
          'String não fechada: falta a aspa dupla (") de fechamento.',
          start,
          pos - start,
        );
      }
      const c = text.charCodeAt(pos);
      if (c === 34 /* " */) {
        value += text.slice(segmentStart, pos);
        this.pos = pos + 1;
        return { kind: 'string', start, end: this.pos, value };
      }
      if (c === 92 /* \ */) {
        value += text.slice(segmentStart, pos);
        const esc = text[pos + 1];
        if (esc === undefined) {
          throw new JsonParseFailure(
            'unterminated-string',
            'String não fechada: falta a aspa dupla (") de fechamento.',
            start,
            pos + 1 - start,
          );
        }
        if (esc === 'u') {
          const hex = text.slice(pos + 2, pos + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            throw new JsonParseFailure(
              'invalid-escape',
              'Sequência de escape Unicode inválida: use \\u seguido de 4 dígitos hexadecimais (ex.: \\u00e9).',
              pos,
              2 + (hex.match(/^[0-9a-fA-F]*/)?.[0].length ?? 0),
            );
          }
          value += String.fromCharCode(parseInt(hex, 16));
          pos += 6;
        } else if (esc in SIMPLE_ESCAPES) {
          value += SIMPLE_ESCAPES[esc];
          pos += 2;
        } else {
          throw new JsonParseFailure(
            'invalid-escape',
            `Sequência de escape inválida "\\${esc}". Escapes válidos: \\" \\\\ \\/ \\b \\f \\n \\r \\t \\uXXXX.`,
            pos,
            2,
          );
        }
        segmentStart = pos;
        continue;
      }
      if (c === 10 || c === 13) {
        throw new JsonParseFailure(
          'unterminated-string',
          'String não fechada: falta a aspa dupla (") de fechamento antes da quebra de linha.',
          start,
          pos - start,
        );
      }
      if (c < 0x20) {
        throw new JsonParseFailure(
          'control-character',
          'Caractere de controle não escapado dentro da string. Use \\t, \\n ou \\uXXXX.',
          pos,
          1,
        );
      }
      pos++;
    }
  }

  private scanNumber(start: number): Token {
    const { text } = this;
    let pos = start;
    while (pos < text.length && NUMBER_RUN_CHAR.test(text[pos])) pos++;
    const raw = text.slice(start, pos);
    if (NUMBER_PATTERN.test(raw)) {
      this.pos = pos;
      return { kind: 'number', start, end: pos };
    }
    const unsigned = raw.replace(/^-/, '');
    if (/^[A-Za-z]/.test(unsigned) && unsigned !== raw) {
      const hint = INVALID_LITERAL_HINTS[unsigned];
      throw new JsonParseFailure(
        'invalid-value',
        `Valor inválido "${raw}".${hint ? ' ' + hint : ''}`,
        start,
        raw.length,
      );
    }
    throw new JsonParseFailure('invalid-number', describeInvalidNumber(raw), start, raw.length);
  }

  private scanIdentifier(start: number): Token {
    const { text } = this;
    let pos = start;
    while (pos < text.length && IDENTIFIER_CHAR.test(text[pos])) pos++;
    this.pos = pos;
    const word = text.slice(start, pos);
    if (word === 'true' || word === 'false' || word === 'null') {
      return { kind: word, start, end: pos };
    }
    return { kind: 'identifier', start, end: pos };
  }

  private lengthUntilQuote(start: number, quote: string): number {
    const end = this.text.indexOf(quote, start + 1);
    const lineEnd = this.lineEnd(start);
    return end !== -1 && end < lineEnd ? end + 1 - start : 1;
  }

  private commentLength(start: number): number {
    if (this.text[start + 1] === '*') {
      const end = this.text.indexOf('*/', start + 2);
      return end === -1 ? this.text.length - start : end + 2 - start;
    }
    return this.lineEnd(start) - start;
  }

  private lineEnd(from: number): number {
    const match = /[\r\n]/.exec(this.text.slice(from));
    return match ? from + match.index : this.text.length;
  }
}

function describeChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  const hex = 'U+' + code.toString(16).toUpperCase().padStart(4, '0');
  if (code === 0xfeff) return `(marca BOM ${hex})`;
  if (code === 0xa0) return `(espaço não separável ${hex})`;
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return `(caractere de controle ${hex})`;
  if (ch === '=') return `"=" — use ":" para separar nome e valor`;
  if (ch === ';') return `";" — use "," para separar itens`;
  if (ch === '“' || ch === '”') return `"${ch}" (aspas tipográficas) — use aspas duplas retas (")`;
  return `"${ch}"`;
}

function describeInvalidNumber(raw: string): string {
  const body = raw.replace(/^-/, '');
  if (raw.startsWith('+'))
    return `Número inválido "${raw}": números JSON não podem começar com "+".`;
  if (raw === '-') return 'Número inválido: o sinal "-" deve ser seguido de dígitos.';
  if (/^0[xX]/.test(body))
    return `Número inválido "${raw}": números hexadecimais não são permitidos em JSON.`;
  if (body.startsWith('.')) {
    return `Número inválido "${raw}": é necessário ao menos um dígito antes do ponto decimal (ex.: 0.5).`;
  }
  if (/^0\d/.test(body)) return `Número inválido "${raw}": zeros à esquerda não são permitidos.`;
  if (/\.($|[eE])/.test(body)) {
    return `Número inválido "${raw}": o ponto decimal deve ser seguido de dígitos (ex.: 1.0).`;
  }
  if (/[eE][+-]?$/.test(body)) return `Número inválido "${raw}": expoente incompleto.`;
  return `Número inválido "${raw}".`;
}

class Parser {
  private readonly scanner: Scanner;
  private readonly lines: LineIndex;
  private tok!: Token;
  private depth = 0;
  readonly warnings: JsonWarning[] = [];

  constructor(private readonly text: string) {
    this.scanner = new Scanner(text);
    this.lines = new LineIndex(text);
  }

  parseDocument(): JsonNode {
    this.advance();
    const root = this.parseValue();
    if (this.kind() !== 'eof') {
      const t = this.tok;
      const message =
        t.kind === ','
          ? 'Vírgula desnecessária após o fim do documento JSON.'
          : 'Conteúdo adicional após o fim do documento JSON. Um documento deve conter um único valor raiz.';
      throw new JsonParseFailure(
        'trailing-content',
        message,
        t.start,
        Math.max(1, t.end - t.start),
      );
    }
    return root;
  }

  toError(failure: JsonParseFailure): JsonSyntaxError {
    const location = this.lines.location(failure.offset, failure.length);
    return { code: failure.code, message: failure.message, ...location };
  }

  /** Lido via método para que o TypeScript não estreite o tipo entre chamadas a advance(). */
  private kind(): TokenKind {
    return this.tok.kind;
  }

  private advance(): void {
    this.tok = this.scanner.next();
  }

  private parseValue(): JsonNode {
    const t = this.tok;
    switch (t.kind) {
      case '{':
        return this.parseObject();
      case '[':
        return this.parseArray();
      case 'string':
        this.advance();
        return {
          type: 'string',
          start: t.start,
          end: t.end,
          value: t.value ?? '',
          raw: this.text.slice(t.start, t.end),
        };
      case 'number':
        this.advance();
        return { type: 'number', start: t.start, end: t.end, raw: this.text.slice(t.start, t.end) };
      case 'true':
      case 'false':
        this.advance();
        return { type: 'boolean', start: t.start, end: t.end, value: t.kind === 'true' };
      case 'null':
        this.advance();
        return { type: 'null', start: t.start, end: t.end };
      case 'identifier': {
        const word = this.tokenText(t);
        const hint = INVALID_LITERAL_HINTS[word];
        throw new JsonParseFailure(
          'invalid-value',
          `Valor inválido "${word}". ${hint ?? 'Strings devem estar entre aspas duplas; valores literais válidos são true, false e null.'}`,
          t.start,
          t.end - t.start,
        );
      }
      case 'eof':
        throw new JsonParseFailure(
          'unexpected-end',
          'Fim inesperado do documento: era esperado um valor.',
          Math.max(0, this.text.length - 1),
          1,
        );
      default:
        throw new JsonParseFailure(
          'unexpected-token',
          `Era esperado um valor, mas foi encontrado "${this.tokenText(t)}".`,
          t.start,
          t.end - t.start,
        );
    }
  }

  private parseObject(): JsonObjectNode {
    const open = this.tok;
    this.enter(open);
    this.advance();
    const properties: JsonPropertyNode[] = [];
    const seen = new Set<string>();

    if (this.kind() === '}') {
      const end = this.tok.end;
      this.advance();
      this.depth--;
      return { type: 'object', start: open.start, end, properties };
    }

    while (true) {
      const keyTok = this.tok;
      if (keyTok.kind === 'eof') throw this.unclosed(open, 'object');
      if (keyTok.kind !== 'string') {
        if (['identifier', 'true', 'false', 'null', 'number'].includes(keyTok.kind)) {
          const word = this.tokenText(keyTok);
          throw new JsonParseFailure(
            'unquoted-key',
            `Nome de propriedade sem aspas: ${word}. Em JSON, use "${word}".`,
            keyTok.start,
            keyTok.end - keyTok.start,
          );
        }
        throw new JsonParseFailure(
          'unexpected-token',
          `Era esperado o nome de uma propriedade entre aspas duplas, mas foi encontrado "${this.tokenText(keyTok)}".`,
          keyTok.start,
          keyTok.end - keyTok.start,
        );
      }
      const key = keyTok.value ?? '';
      this.advance();

      if (this.kind() !== ':') {
        if (this.kind() === 'eof') throw this.unclosed(open, 'object');
        throw new JsonParseFailure(
          'missing-colon',
          `Era esperado ":" após o nome da propriedade "${key}".`,
          this.tok.start,
          Math.max(1, this.tok.end - this.tok.start),
        );
      }
      this.advance();

      if (this.kind() === '}' || this.kind() === ',') {
        throw new JsonParseFailure(
          'missing-value',
          `Valor ausente para a propriedade "${key}".`,
          this.tok.start,
          1,
        );
      }
      if (this.kind() === 'eof') throw this.unclosed(open, 'object');
      const value = this.parseValue();

      if (seen.has(key)) {
        this.warnings.push({
          code: 'duplicate-key',
          message: `Propriedade "${key}" duplicada: apenas a última ocorrência é considerada na comparação.`,
          ...this.lines.location(keyTok.start, keyTok.end - keyTok.start),
        });
      }
      seen.add(key);
      properties.push({
        key,
        keyRaw: this.text.slice(keyTok.start, keyTok.end),
        keyStart: keyTok.start,
        keyEnd: keyTok.end,
        value,
        start: keyTok.start,
        end: value.end,
      });

      const sep = this.tok;
      if (sep.kind === ',') {
        this.advance();
        if (this.kind() === '}') {
          throw new JsonParseFailure(
            'trailing-comma',
            'Vírgula desnecessária após a última propriedade.',
            sep.start,
            1,
          );
        }
        continue;
      }
      if (sep.kind === '}') {
        this.advance();
        this.depth--;
        return { type: 'object', start: open.start, end: sep.end, properties };
      }
      if (sep.kind === 'eof') throw this.unclosed(open, 'object');
      if (sep.kind === ']' || sep.kind === ':') {
        throw new JsonParseFailure(
          'unexpected-token',
          `Era esperado "," ou "}", mas foi encontrado "${sep.kind}". Verifique o fechamento da chave "{" da linha ${this.lineOf(open)}.`,
          sep.start,
          1,
        );
      }
      throw new JsonParseFailure(
        'missing-comma',
        sep.kind === 'string'
          ? `Vírgula ausente entre propriedades: esperado "," antes de ${this.tokenText(sep)}.`
          : 'Vírgula ausente entre propriedades: esperado "," ou "}".',
        sep.start,
        Math.max(1, sep.end - sep.start),
      );
    }
  }

  private parseArray(): JsonArrayNode {
    const open = this.tok;
    this.enter(open);
    this.advance();
    const items: JsonNode[] = [];

    if (this.kind() === ']') {
      const end = this.tok.end;
      this.advance();
      this.depth--;
      return { type: 'array', start: open.start, end, items };
    }

    while (true) {
      if (this.kind() === 'eof') throw this.unclosed(open, 'array');
      if (this.kind() === ',') {
        throw new JsonParseFailure(
          'missing-value',
          'Elemento ausente no array: há uma vírgula sem valor antes dela.',
          this.tok.start,
          1,
        );
      }
      items.push(this.parseValue());

      const sep = this.tok;
      if (sep.kind === ',') {
        this.advance();
        if (this.kind() === ']') {
          throw new JsonParseFailure(
            'trailing-comma',
            'Vírgula desnecessária após o último elemento do array.',
            sep.start,
            1,
          );
        }
        continue;
      }
      if (sep.kind === ']') {
        this.advance();
        this.depth--;
        return { type: 'array', start: open.start, end: sep.end, items };
      }
      if (sep.kind === 'eof') throw this.unclosed(open, 'array');
      if (sep.kind === ':') {
        throw new JsonParseFailure(
          'unexpected-token',
          'Era esperado "," ou "]", mas foi encontrado ":". Arrays não possuem pares nome/valor — use um objeto {}.',
          sep.start,
          1,
        );
      }
      if (sep.kind === '}') {
        throw new JsonParseFailure(
          'unexpected-token',
          `Era esperado "," ou "]", mas foi encontrado "}". Verifique o fechamento do colchete "[" da linha ${this.lineOf(open)}.`,
          sep.start,
          1,
        );
      }
      throw new JsonParseFailure(
        'missing-comma',
        'Vírgula ausente entre elementos do array: esperado "," ou "]".',
        sep.start,
        Math.max(1, sep.end - sep.start),
      );
    }
  }

  private enter(open: Token): void {
    if (++this.depth > MAX_NESTING_DEPTH) {
      throw new JsonParseFailure(
        'too-deep',
        `Documento excessivamente aninhado (mais de ${MAX_NESTING_DEPTH} níveis).`,
        open.start,
        1,
      );
    }
  }

  private unclosed(open: Token, kind: 'object' | 'array'): JsonParseFailure {
    const { line, column } = this.lines.positionAt(open.start);
    return kind === 'object'
      ? new JsonParseFailure(
          'unclosed-object',
          `Chave "{" aberta na linha ${line}, coluna ${column} não foi fechada: falta "}".`,
          open.start,
          1,
        )
      : new JsonParseFailure(
          'unclosed-array',
          `Colchete "[" aberto na linha ${line}, coluna ${column} não foi fechado: falta "]".`,
          open.start,
          1,
        );
  }

  private lineOf(t: Token): number {
    return this.lines.positionAt(t.start).line;
  }

  private tokenText(t: Token): string {
    if (t.kind === 'eof') return 'fim do documento';
    const raw = this.text.slice(t.start, t.end);
    return raw.length > 30 ? raw.slice(0, 30) + '…' : raw;
  }
}

/**
 * Faz o parsing completo do texto. Nunca lança exceções: erros de sintaxe são retornados
 * em `ParseResult` com mensagem, linha e coluna.
 */
export function parseJson(text: string): ParseResult {
  const parser = new Parser(text);
  try {
    const ast = parser.parseDocument();
    return { ok: true, ast, warnings: parser.warnings };
  } catch (e) {
    if (e instanceof JsonParseFailure) return { ok: false, error: parser.toError(e) };
    if (e instanceof RangeError) {
      return {
        ok: false,
        error: parser.toError(
          new JsonParseFailure('too-deep', 'Documento excessivamente aninhado.', 0, 1),
        ),
      };
    }
    throw e;
  }
}
