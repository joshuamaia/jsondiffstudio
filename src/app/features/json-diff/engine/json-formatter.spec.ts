import { compactJson, formatJson, mapOffset } from './json-formatter';
import { parseJson } from './json-parser';

describe('formatJson', () => {
  it('aplica Pretty Print com 2 espaços', () => {
    const result = formatJson('{"id":1,"nome":"Ana","ativo":true}');
    expect(result).toEqual({
      ok: true,
      text: '{\n  "id": 1,\n  "nome": "Ana",\n  "ativo": true\n}',
    });
  });

  it('aplica Pretty Print com 4 espaços e estruturas aninhadas', () => {
    const result = formatJson('{"a":[1,{"b":null}],"c":{},"d":[]}', 4);
    expect(result.ok && result.text).toBe(
      '{\n    "a": [\n        1,\n        {\n            "b": null\n        }\n    ],\n    "c": {},\n    "d": []\n}',
    );
  });

  it('não altera números, escapes ou espaços dentro de strings', () => {
    const input = '{"big":12345678901234567890,"d":1.50,"e":1E+3,"s":"a  b\\u00e9\\n"}';
    const result = formatJson(input);
    expect(result.ok && result.text).toBe(
      '{\n  "big": 12345678901234567890,\n  "d": 1.50,\n  "e": 1E+3,\n  "s": "a  b\\u00e9\\n"\n}',
    );
  });

  it('é idempotente', () => {
    const once = formatJson('[{"a":1},{"b":[2,3]}]');
    const twice = once.ok ? formatJson(once.text) : once;
    expect(twice).toEqual(once);
  });

  it('não formata (nem corrige) JSON inválido', () => {
    const result = formatJson('{"a": 1,}');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('trailing-comma');
  });
});

describe('mapOffset', () => {
  it('preserva a posição relativa do cursor após a formatação', () => {
    const before = '{"id":1,"nome":"Ana"}';
    const formatted = formatJson(before);
    if (!formatted.ok) throw new Error();
    // Cursor logo após "Ana" (antes de "}")
    const cursor = before.indexOf('"Ana"') + 5;
    const mapped = mapOffset(before, formatted.text, cursor);
    expect(formatted.text.slice(0, mapped).endsWith('"Ana"')).toBe(true);
  });

  it('considera espaços dentro de strings como significativos', () => {
    const before = '{"a":"x y"}';
    const after = '{\n  "a": "x y"\n}';
    const cursor = before.indexOf('y');
    expect(after[mapOffset(before, after, cursor)]).toBe('y');
  });

  it('limita offsets ao tamanho do documento', () => {
    expect(mapOffset('[1]', '[\n  1\n]', 999)).toBe(7);
    expect(mapOffset('[1]', '[\n  1\n]', 0)).toBe(0);
  });
});

describe('compactJson', () => {
  it('gera representação compacta preservando tokens e trunca textos longos', () => {
    const parsed = parseJson('{\n "a": [1, 2.0],\n "b": "x"\n}');
    if (!parsed.ok) throw new Error();
    expect(compactJson(parsed.ast)).toBe('{"a": [1, 2.0], "b": "x"}');
    expect(compactJson(parsed.ast, 8)).toBe('{"a": [1…');
  });
});
