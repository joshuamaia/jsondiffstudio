import { LineIndex } from '../../engine/text-location';
import { EditorDiffMark } from '../../models/editor.model';
import { parseJson } from '../../engine/json-parser';
import {
  PositionResolver,
  toActiveDecoration,
  toDiffDecorations,
  toMarkers,
} from './monaco-decorations';

function resolver(text: string): PositionResolver {
  const index = new LineIndex(text);
  return {
    getPositionAt: (offset) => {
      const { line, column } = index.positionAt(offset);
      return { lineNumber: line, column };
    },
  };
}

describe('decorações do Monaco', () => {
  const text = '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }\n}';
  const model = resolver(text);

  const modifiedMark: EditorDiffMark = {
    id: 'a',
    kind: 'modified',
    type: 'change',
    range: { start: text.indexOf('"a"'), end: text.indexOf('1,') + 1 },
    valueRange: { start: text.indexOf('1,'), end: text.indexOf('1,') + 1 },
    label: '',
    hover: '**Alterado**',
  };
  const addedBlock: EditorDiffMark = {
    id: 'b',
    kind: 'added',
    type: 'change',
    range: { start: text.indexOf('"b"'), end: text.lastIndexOf('}', text.length - 2) + 1 },
    valueRange: null,
    label: '',
    hover: '**Adicionado**',
  };

  it('destaca linhas inteiras com a cor do tipo de diferença e o valor alterado', () => {
    const decorations = toDiffDecorations(model, [modifiedMark]);
    expect(decorations).toHaveLength(2);
    expect(decorations[0].range).toMatchObject({ startLineNumber: 2, endLineNumber: 2 });
    expect(decorations[0].options).toMatchObject({
      isWholeLine: true,
      className: 'jds-diff-line--modified',
      linesDecorationsClassName: 'jds-diff-gutter jds-diff-gutter--modified',
    });
    expect(decorations[1].options.inlineClassName).toBe('jds-diff-value--modified');
    expect(decorations[1].range).toMatchObject({
      startLineNumber: 2,
      startColumn: 8,
      endColumn: 9,
    });
  });

  it('cobre todas as linhas de um objeto adicionado', () => {
    const [decoration] = toDiffDecorations(model, [addedBlock]);
    expect(decoration.range).toMatchObject({ startLineNumber: 3, endLineNumber: 5 });
    expect(decoration.options.className).toBe('jds-diff-line--added');
    expect(decoration.options.overviewRuler?.color).toBe('#10b981');
  });

  it('indicador de ausência usa texto injetado, não a classe de linha', () => {
    const absent: EditorDiffMark = {
      ...modifiedMark,
      type: 'absent',
      label: '  ← falta: x',
      valueRange: null,
    };
    const [decoration] = toDiffDecorations(model, [absent]);
    expect(decoration.options.isWholeLine).toBeUndefined();
    expect(decoration.options.after?.content).toBe('  ← falta: x');
  });

  it('substitui completamente as decorações a cada atualização', () => {
    const collection = {
      current: [] as unknown[],
      set(d: unknown[]) {
        this.current = d;
      },
    };
    collection.set(toDiffDecorations(model, [modifiedMark, addedBlock]));
    expect(collection.current).toHaveLength(3);
    collection.set(toDiffDecorations(model, [addedBlock]));
    expect(collection.current).toHaveLength(1);
    collection.set(toDiffDecorations(model, []));
    expect(collection.current).toHaveLength(0);
  });

  it('destaque temporário da diferença selecionada', () => {
    const decoration = toActiveDecoration(model, addedBlock.range, 'added');
    expect(decoration.options.className).toContain('jds-diff-line--active');
    expect(decoration.range.startLineNumber).toBe(3);
  });
});

describe('marcadores de erro de sintaxe', () => {
  it('posiciona o erro na linha/coluna corretas com severidade de erro', () => {
    const text = '{\n  "id": 1,\n}';
    const parsed = parseJson(text);
    const error = parsed.ok ? null : parsed.error;
    const [marker] = toMarkers(resolver(text), error, []);
    expect(marker).toMatchObject({
      severity: 8,
      startLineNumber: 2,
      startColumn: 10,
      endLineNumber: 2,
      endColumn: 11,
    });
    expect(marker.message).toBe('JSON inválido — Vírgula desnecessária após a última propriedade.');
  });

  it('sem erro, nenhum marcador (remoção ao corrigir)', () => {
    expect(toMarkers(resolver('{}'), null, [])).toEqual([]);
  });
});
