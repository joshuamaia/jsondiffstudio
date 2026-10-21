import { diffJson } from '../engine/json-diff.engine';
import { parseJson } from '../engine/json-parser';
import { DEFAULT_DIFF_OPTIONS } from '../models/diff.model';
import { buildEditorMarks, focusRequestFor } from './editor-marks';

function entriesOf(original: string, modified: string) {
  const a = parseJson(original);
  const b = parseJson(modified);
  if (!a.ok || !b.ok) throw new Error();
  return diffJson(a.ast, b.ast, DEFAULT_DIFF_OPTIONS).entries;
}

describe('buildEditorMarks', () => {
  const original = '{\n  "id": 1,\n  "idade": 25,\n  "telefone": "1"\n}';
  const modified = '{\n  "id": 1,\n  "idade": 26,\n  "cidade": "SP"\n}';
  const entries = entriesOf(original, modified);

  it('marca alterações e remoções no editor original, com indicador de ausência', () => {
    const marks = buildEditorMarks(entries, 'original');
    expect(marks.map((m) => `${m.type}:${m.kind}:${m.id}`)).toEqual([
      'change:modified:idade',
      'change:removed:telefone',
      `absent:added:absent:original:${original.length - 1}`,
    ]);
    const modifiedMark = marks[0];
    expect(original.slice(modifiedMark.range.start, modifiedMark.range.end)).toBe('"idade": 25');
    expect(original.slice(modifiedMark.valueRange!.start, modifiedMark.valueRange!.end)).toBe('25');
    expect(marks[2].label).toContain('cidade');
    expect(marks[2].hover).toContain('Ausente neste documento');
  });

  it('marca alterações e adições no editor modificado', () => {
    const marks = buildEditorMarks(entries, 'modified');
    expect(marks.filter((m) => m.type === 'change').map((m) => `${m.kind}:${m.id}`)).toEqual([
      'modified:idade',
      'added:cidade',
    ]);
    expect(marks.find((m) => m.type === 'absent')?.label).toContain('telefone');
    expect(marks[0].hover).toContain('25');
    expect(marks[0].hover).toContain('26');
  });

  it('agrupa várias ausências na mesma posição', () => {
    const grouped = entriesOf('{}', '{"a": 1, "b": 2}');
    const absent = buildEditorMarks(grouped, 'original').filter((m) => m.type === 'absent');
    expect(absent).toHaveLength(1);
    expect(absent[0].label).toContain('2 ausentes');
  });

  it('cria pedido de foco no trecho existente ou na âncora de ausência', () => {
    const added = entries.find((e) => e.kind === 'added')!;
    expect(focusRequestFor(added, 'modified', 1)).toMatchObject({ absent: false, nonce: 1 });
    expect(focusRequestFor(added, 'original', 1)).toMatchObject({ absent: true });
  });
});
