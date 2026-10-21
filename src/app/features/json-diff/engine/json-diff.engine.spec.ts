import { DEFAULT_DIFF_OPTIONS, DiffEntry, DiffOptions, DiffResult } from '../models/diff.model';
import { canonicalNumber, diffJson } from './json-diff.engine';
import { buildDiffReport, previewValue } from './diff-report';
import { parseJson } from './json-parser';

function diff(original: string, modified: string, options: Partial<DiffOptions> = {}): DiffResult {
  const a = parseJson(original);
  const b = parseJson(modified);
  if (!a.ok || !b.ok) throw new Error('JSON de teste inválido');
  return diffJson(a.ast, b.ast, { ...DEFAULT_DIFF_OPTIONS, ...options });
}

function summary(entries: readonly DiffEntry[]): string[] {
  return entries.map((e) => {
    const old = e.original ? previewValue(e.original) : '∅';
    const neu = e.modified ? previewValue(e.modified) : '∅';
    return `${e.kind} ${e.path} ${old} -> ${neu}`;
  });
}

describe('diffJson — objetos', () => {
  it('ignora a ordem das propriedades', () => {
    const result = diff('{"id": 1, "nome": "Ana"}', '{"nome": "Ana", "id": 1}');
    expect(result.entries).toHaveLength(0);
    expect(result.stats).toEqual({ total: 0, added: 0, removed: 0, modified: 0 });
  });

  it('ignora diferenças de formatação', () => {
    expect(diff('{"a":[1,2]}', '{\n  "a": [\n    1,\n    2\n  ]\n}').entries).toHaveLength(0);
  });

  it('detecta propriedades adicionadas', () => {
    const result = diff('{"id": 1}', '{"id": 1, "cidade": "SP"}');
    expect(summary(result.entries)).toEqual(['added cidade ∅ -> "SP"']);
    expect(result.stats.added).toBe(1);
  });

  it('detecta propriedades removidas', () => {
    const result = diff('{"id": 1, "telefone": "119"}', '{"id": 1}');
    expect(summary(result.entries)).toEqual(['removed telefone "119" -> ∅']);
    expect(result.stats.removed).toBe(1);
  });

  it('detecta propriedades modificadas (valor e tipo)', () => {
    const result = diff('{"idade": 25, "versao": 2}', '{"idade": 26, "versao": "2"}');
    expect(summary(result.entries)).toEqual([
      'modified idade 25 -> 26',
      'modified versao 2 -> "2"',
    ]);
    expect(result.stats.modified).toBe(2);
  });

  it('diferencia propriedade inexistente de propriedade null', () => {
    const result = diff('{"a": null, "b": 1}', '{"b": null, "c": null}');
    expect(summary(result.entries)).toEqual([
      'modified b 1 -> null',
      'added c ∅ -> null',
      'removed a null -> ∅',
    ]);
    expect(diff('{"a": null}', '{"a": null}').entries).toHaveLength(0);
  });

  it('compara objetos aninhados e informa o caminho completo', () => {
    const result = diff(
      '{"usuario": {"idade": 25, "endereco": {"rua": "A"}, "telefone": "1"}}',
      '{"usuario": {"idade": 26, "endereco": {"rua": "A", "cidade": "SP"}}}',
    );
    expect(summary(result.entries)).toEqual([
      'modified usuario.idade 25 -> 26',
      'added usuario.endereco.cidade ∅ -> "SP"',
      'removed usuario.telefone "1" -> ∅',
    ]);
    const usuario = result.root.children[0];
    expect(usuario.kind).toBe('unchanged');
    expect(usuario.changeCount).toBe(3);
  });

  it('usa notação de colchetes para nomes de propriedades especiais', () => {
    const result = diff('{"a-b": {"x y": 1}}', '{"a-b": {"x y": 2}}');
    expect(result.entries[0].path).toBe('["a-b"]["x y"]');
  });

  it('compara números pelo valor exato, inclusive inteiros grandes', () => {
    expect(diff('{"n": 1.0, "e": 100}', '{"n": 1, "e": 1e2}').entries).toHaveLength(0);
    expect(diff('{"id": 9007199254740993}', '{"id": 9007199254740992}').entries).toHaveLength(1);
  });

  it('trata mudança de objeto para array como modificação', () => {
    const result = diff('{"x": {"a": 1}}', '{"x": [1]}');
    expect(summary(result.entries)).toEqual(['modified x {"a": 1} -> [1]']);
  });

  it('marca subárvores adicionadas/removidas como uma única diferença', () => {
    const result = diff('{}', '{"novo": {"a": 1, "b": [1, 2]}}');
    expect(result.entries).toHaveLength(1);
    expect(result.root.children[0].children.map((c) => c.kind)).toEqual(['added', 'added']);
  });

  it('fornece posições e âncoras de ausência para os editores', () => {
    const original = '{\n  "id": 1\n}';
    const modified = '{\n  "id": 1,\n  "cidade": "SP"\n}';
    const [entry] = diff(original, modified).entries;
    expect(modified.slice(entry.modifiedRange!.start, entry.modifiedRange!.end)).toBe(
      '"cidade": "SP"',
    );
    expect(entry.originalRange).toBeNull();
    expect(original.slice(entry.originalAnchor!.start, entry.originalAnchor!.end)).toBe('}');
  });
});

describe('diffJson — arrays por posição', () => {
  it('compara elementos pelo índice', () => {
    const result = diff('[10, 20, 30]', '[10, 25, 30]');
    expect(summary(result.entries)).toEqual(['modified [1] 20 -> 25']);
  });

  it('detecta elementos adicionados e removidos no fim', () => {
    expect(summary(diff('[1, 2]', '[1, 2, 3]').entries)).toEqual(['added [2] ∅ -> 3']);
    expect(summary(diff('[1, 2, 3]', '[1]').entries)).toEqual([
      'removed [1] 2 -> ∅',
      'removed [2] 3 -> ∅',
    ]);
  });
});

describe('diffJson — arrays por identificador', () => {
  const original = '[{"id": 1, "nome": "Ana"}, {"id": 2, "nome": "Carlos"}]';
  const modified = '[{"id": 2, "nome": "Carlos Silva"}, {"id": 1, "nome": "Ana"}]';

  it('identifica somente a alteração real, ignorando a troca de posição', () => {
    const result = diff(original, modified, { arrayMode: 'key', arrayKey: 'id' });
    expect(summary(result.entries)).toEqual(['modified [id=2].nome "Carlos" -> "Carlos Silva"']);
    const moved = result.root.children.find((c) => c.label === '[id=1]');
    expect(moved?.segment).toEqual({
      kind: 'match',
      field: 'id',
      value: '1',
      originalIndex: 0,
      modifiedIndex: 1,
    });
  });

  it('por posição, a mesma troca gera várias diferenças', () => {
    expect(diff(original, modified).entries.length).toBeGreaterThan(1);
  });

  it('detecta itens adicionados e removidos por identificador', () => {
    const result = diff('[{"id": 1}, {"id": 2}]', '[{"id": 2}, {"id": 3}]', {
      arrayMode: 'key',
      arrayKey: 'id',
    });
    expect(summary(result.entries)).toEqual([
      'added [id=3] ∅ -> {"id": 3}',
      'removed [id=1] {"id": 1} -> ∅',
    ]);
  });

  it('usa outros campos identificadores (ex.: codigo/uuid string)', () => {
    const result = diff(
      '{"itens": [{"codigo": "A", "q": 1}, {"codigo": "B", "q": 1}]}',
      '{"itens": [{"codigo": "B", "q": 2}, {"codigo": "A", "q": 1}]}',
      { arrayMode: 'key', arrayKey: 'codigo' },
    );
    expect(summary(result.entries)).toEqual(['modified itens[codigo="B"].q 1 -> 2']);
  });

  it('identificadores ausentes: avisa e compara por posição', () => {
    const result = diff('[{"id": 1}, {"nome": "x"}]', '[{"id": 1}, {"nome": "y"}]', {
      arrayMode: 'key',
      arrayKey: 'id',
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain('sem o identificador "id"');
    expect(summary(result.entries)).toEqual(['modified [1].nome "x" -> "y"']);
  });

  it('identificadores duplicados: avisa e compara por posição', () => {
    const result = diff('[{"id": 1}, {"id": 1}]', '[{"id": 1}, {"id": 2}]', {
      arrayMode: 'key',
      arrayKey: 'id',
    });
    expect(result.warnings[0].message).toContain('duplicado');
    expect(summary(result.entries)).toEqual(['modified [1].id 1 -> 2']);
  });

  it('arrays de primitivos continuam sendo comparados por posição', () => {
    const result = diff('{"tags": ["a", "b"]}', '{"tags": ["b", "a"]}', {
      arrayMode: 'key',
      arrayKey: 'id',
    });
    expect(result.warnings).toHaveLength(0);
    expect(result.entries).toHaveLength(2);
  });
});

describe('diffJson — propriedades ignoradas', () => {
  it('ignora por nome em qualquer nível', () => {
    const result = diff(
      '{"updatedAt": "1", "meta": {"requestId": "a", "v": 1}}',
      '{"updatedAt": "2", "meta": {"requestId": "b", "v": 2}}',
      { ignoredKeys: ['updatedAt', 'requestId'] },
    );
    expect(summary(result.entries)).toEqual(['modified meta.v 1 -> 2']);
    expect(result.ignoredCount).toBe(2);
  });

  it('ignora por caminho completo', () => {
    const result = diff('{"a": {"id": 1}, "b": {"id": 1}}', '{"a": {"id": 2}, "b": {"id": 2}}', {
      ignoredKeys: ['a.id'],
    });
    expect(summary(result.entries)).toEqual(['modified b.id 1 -> 2']);
  });
});

describe('canonicalNumber', () => {
  it('normaliza representações equivalentes', () => {
    expect(canonicalNumber('1.50')).toBe(canonicalNumber('1.5'));
    expect(canonicalNumber('100')).toBe(canonicalNumber('1e2'));
    expect(canonicalNumber('-0')).toBe(canonicalNumber('0.0'));
    expect(canonicalNumber('12345678901234567891')).not.toBe(
      canonicalNumber('12345678901234567890'),
    );
  });
});

describe('buildDiffReport', () => {
  it('gera relatório JSON válido com caminhos, tipos e valores (sem perda de precisão)', () => {
    const result = diff('{"id": 9007199254740993, "a": 1}', '{"id": 9007199254740995, "b": true}');
    const report = buildDiffReport(
      result,
      DEFAULT_DIFF_OPTIONS,
      2,
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(parseJson(report).ok).toBe(true);
    expect(report).toContain('"oldValue": 9007199254740993');
    expect(report).toContain('"newValue": 9007199254740995');
    const data = JSON.parse(report);
    expect(data.summary).toEqual({ total: 3, added: 1, removed: 1, modified: 1 });
    expect(
      data.differences.map((d: { type: string; path: string }) => `${d.type} ${d.path}`),
    ).toEqual(['MODIFIED id', 'ADDED b', 'REMOVED a']);
    expect(data.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
