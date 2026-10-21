import { JsonObjectNode } from '../models/json-ast.model';
import { JsonErrorCode, JsonSyntaxError } from '../models/validation.model';
import { parseJson } from './json-parser';

function errorOf(text: string): JsonSyntaxError {
  const result = parseJson(text);
  if (result.ok) throw new Error(`Esperava erro para: ${text}`);
  return result.error;
}

function expectError(
  text: string,
  code: JsonErrorCode,
  line: number,
  column: number,
): JsonSyntaxError {
  const error = errorOf(text);
  expect(error.code).toBe(code);
  expect({ line: error.line, column: error.column }).toEqual({ line, column });
  return error;
}

describe('parseJson — JSON válido', () => {
  it('aceita todos os tipos de valores', () => {
    const result = parseJson(
      '{"s":"a\\nb","n":-1.5e3,"t":true,"f":false,"z":null,"a":[1,{}],"o":{}}',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = result.ast as JsonObjectNode;
    expect(root.properties.map((p) => p.key)).toEqual(['s', 'n', 't', 'f', 'z', 'a', 'o']);
    expect(root.properties.map((p) => p.value.type)).toEqual([
      'string',
      'number',
      'boolean',
      'boolean',
      'null',
      'array',
      'object',
    ]);
  });

  it('aceita valores primitivos na raiz e espaços em volta', () => {
    expect(parseJson('  42  ').ok).toBe(true);
    expect(parseJson('"texto"').ok).toBe(true);
    expect(parseJson('\n[]\n').ok).toBe(true);
  });

  it('decodifica escapes e preserva o token original da string', () => {
    const result = parseJson('"caf\\u00e9 \\"x\\""');
    expect(result.ok && result.ast.type === 'string' && result.ast.value).toBe('café "x"');
    expect(result.ok && result.ast.type === 'string' && result.ast.raw).toBe(
      '"caf\\u00e9 \\"x\\""',
    );
  });

  it('preserva o token numérico original (sem perda de precisão)', () => {
    const result = parseJson('{"id": 9007199254740993, "v": 1.10}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [id, v] = (result.ast as JsonObjectNode).properties;
    expect(id.value.type === 'number' && id.value.raw).toBe('9007199254740993');
    expect(v.value.type === 'number' && v.value.raw).toBe('1.10');
  });

  it('registra offsets de propriedades e valores', () => {
    const text = '{\n  "a": [1, 2]\n}';
    const result = parseJson(text);
    if (!result.ok) throw new Error();
    const prop = (result.ast as JsonObjectNode).properties[0];
    expect(text.slice(prop.start, prop.end)).toBe('"a": [1, 2]');
    expect(text.slice(prop.value.start, prop.value.end)).toBe('[1, 2]');
  });

  it('emite aviso para propriedades duplicadas sem invalidar o documento', () => {
    const result = parseJson('{"a": 1, "a": 2}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({ code: 'duplicate-key', line: 1, column: 10 });
    }
  });
});

describe('parseJson — JSON inválido', () => {
  it('vírgula sobrando após a última propriedade', () => {
    const error = expectError('{\n  "id": 1,\n  "nome": "Ana",\n}', 'trailing-comma', 3, 16);
    expect(error.message).toBe('Vírgula desnecessária após a última propriedade.');
  });

  it('vírgula sobrando após o último elemento do array', () => {
    const error = expectError('[1, 2, ]', 'trailing-comma', 1, 6);
    expect(error.message).toContain('último elemento');
  });

  it('vírgula ausente entre propriedades e entre elementos', () => {
    expectError('{\n  "a": 1\n  "b": 2\n}', 'missing-comma', 3, 3);
    expectError('[1 2]', 'missing-comma', 1, 4);
  });

  it('chaves não fechadas apontam para a chave de abertura', () => {
    const error = expectError('{\n  "a": {\n    "b": 1\n  }\n', 'unclosed-object', 1, 1);
    expect(error.message).toContain('linha 1, coluna 1');
  });

  it('colchetes não fechados', () => {
    expectError('{"itens": [1, 2', 'unclosed-array', 1, 11);
  });

  it('propriedade sem aspas', () => {
    const error = expectError('{ nome: "Ana" }', 'unquoted-key', 1, 3);
    expect(error.message).toContain('"nome"');
  });

  it('aspas simples', () => {
    expectError("{'nome': 'Ana'}", 'single-quotes', 1, 2);
    expectError('{"nome": \'Ana\'}', 'single-quotes', 1, 10);
  });

  it('string malformada (sem aspas de fechamento)', () => {
    expectError('{"nome": "Ana}', 'unterminated-string', 1, 10);
    expectError('{"nome": "Ana\n}', 'unterminated-string', 1, 10);
  });

  it('escape inválido e caractere de controle em string', () => {
    expectError('"a\\x"', 'invalid-escape', 1, 3);
    expectError('"a\tb"', 'control-character', 1, 3);
  });

  it('valores inválidos com dicas', () => {
    expect(expectError('{"a": True}', 'invalid-value', 1, 7).message).toContain('true');
    expect(expectError('{"a": undefined}', 'invalid-value', 1, 7).message).toContain('undefined');
    expectError('[NaN]', 'invalid-value', 1, 2);
    expectError('[-Infinity]', 'invalid-value', 1, 2);
  });

  it('números inválidos', () => {
    expect(errorOf('[01]').message).toContain('zeros à esquerda');
    expect(errorOf('[1.]').message).toContain('ponto decimal');
    expect(errorOf('[.5]').message).toContain('antes do ponto decimal');
    expect(errorOf('[+1]').message).toContain('"+"');
    expect(errorOf('[0x1F]').message).toContain('hexadecimais');
    expect(errorOf('[1e]').message).toContain('expoente');
  });

  it('comentários não são permitidos', () => {
    expectError('{\n  // comentário\n  "a": 1\n}', 'comment', 2, 3);
    expectError('{"a": 1 /* bloco */}', 'comment', 1, 9);
  });

  it('caracteres inesperados', () => {
    expect(expectError('{"a" = 1}', 'unexpected-character', 1, 6).message).toContain('":"');
    expect(expectError('{"a" 1}', 'missing-colon', 1, 6).message).toContain('":"');
    expect(expectError('{"a": 1;}', 'unexpected-character', 1, 8).message).toContain(',');
  });

  it('conteúdo adicional após o documento', () => {
    expectError('{"a": 1} {"b": 2}', 'trailing-content', 1, 10);
    expectError('[1],', 'trailing-content', 1, 4);
  });

  it('valor ausente e fim inesperado', () => {
    expectError('{"a": }', 'missing-value', 1, 7);
    expectError('{"a":', 'unclosed-object', 1, 1);
    expectError('[1, , 2]', 'missing-value', 1, 5);
  });

  it('fechamento trocado ("]" no lugar de "}")', () => {
    expectError('{"a": 1]', 'unexpected-token', 1, 8);
    expectError('[1, 2}', 'unexpected-token', 1, 6);
  });

  it('linhas com \\r\\n são contadas corretamente', () => {
    expectError('{\r\n  "a": 1,\r\n}', 'trailing-comma', 2, 9);
  });

  it('não lança exceção com aninhamento extremo', () => {
    const deep = '['.repeat(5000) + ']'.repeat(5000);
    const result = parseJson(deep);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('too-deep');
  });
});
