import type { editor as MonacoEditorNs } from 'monaco-editor/editor';
import { TextRange } from '../../models/json-ast.model';
import { ChangeKind, DiffKind } from '../../models/diff.model';
import { EditorDiffMark } from '../../models/editor.model';
import { JsonSyntaxError, JsonWarning } from '../../models/validation.model';

type IRange = MonacoEditorNs.IModelDeltaDecoration['range'];

/** Subconjunto do `ITextModel` necessário para converter offsets — facilita testes. */
export interface PositionResolver {
  getPositionAt(offset: number): { lineNumber: number; column: number };
}

// Valores das enums do Monaco, replicados para manter este módulo livre de dependência em runtime.
const OVERVIEW_RULER_FULL = 7; // editor.OverviewRulerLane.Full
const MINIMAP_INLINE = 1; // editor.MinimapPosition.Inline
const NEVER_GROWS = 1; // editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
const SEVERITY_ERROR = 8; // MarkerSeverity.Error
const SEVERITY_WARNING = 4; // MarkerSeverity.Warning

export const DIFF_COLORS: Readonly<Record<ChangeKind, string>> = {
  added: '#10b981',
  removed: '#ef4444',
  modified: '#f59e0b',
};

export function toRange(model: PositionResolver, range: TextRange): IRange {
  const start = model.getPositionAt(range.start);
  const end = model.getPositionAt(Math.max(range.start, range.end));
  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
}

/** Converte as marcações de diferença em decorações do Monaco (linhas, valor, régua, minimapa). */
export function toDiffDecorations(
  model: PositionResolver,
  marks: readonly EditorDiffMark[],
): MonacoEditorNs.IModelDeltaDecoration[] {
  const decorations: MonacoEditorNs.IModelDeltaDecoration[] = [];
  for (const mark of marks) {
    const range = toRange(model, mark.range);
    const color = DIFF_COLORS[mark.kind];
    const common = {
      stickiness: NEVER_GROWS,
      overviewRuler: { color, position: OVERVIEW_RULER_FULL },
      minimap: { color, position: MINIMAP_INLINE },
      hoverMessage: { value: mark.hover },
    } satisfies MonacoEditorNs.IModelDecorationOptions;

    if (mark.type === 'absent') {
      decorations.push({
        range,
        options: {
          ...common,
          linesDecorationsClassName: `jds-diff-gutter jds-diff-gutter--absent-${mark.kind}`,
          after: {
            content: mark.label,
            inlineClassName: `jds-absent-text jds-absent-text--${mark.kind}`,
          },
        },
      });
      continue;
    }

    decorations.push({
      range,
      options: {
        ...common,
        isWholeLine: true,
        className: `jds-diff-line--${mark.kind}`,
        linesDecorationsClassName: `jds-diff-gutter jds-diff-gutter--${mark.kind}`,
      },
    });
    if (mark.valueRange) {
      decorations.push({
        range: toRange(model, mark.valueRange),
        options: { inlineClassName: `jds-diff-value--${mark.kind}` },
      });
    }
  }
  return decorations;
}

export function toActiveDecoration(
  model: PositionResolver,
  range: TextRange,
  kind: DiffKind,
): MonacoEditorNs.IModelDeltaDecoration {
  return {
    range: toRange(model, range),
    options: {
      isWholeLine: true,
      className: `jds-diff-line--active jds-diff-line--active-${kind}`,
      stickiness: NEVER_GROWS,
    },
  };
}

/** Diagnósticos de sintaxe (sublinhado vermelho, margem, tooltip, régua de visão geral). */
export function toMarkers(
  model: PositionResolver,
  error: JsonSyntaxError | null,
  warnings: readonly JsonWarning[],
): MonacoEditorNs.IMarkerData[] {
  const markers: MonacoEditorNs.IMarkerData[] = [];
  if (error) {
    markers.push({
      severity: SEVERITY_ERROR,
      message: `JSON inválido — ${error.message}`,
      source: 'JSON Diff Studio',
      code: error.code,
      ...toRange(model, { start: error.offset, end: error.offset + Math.max(1, error.length) }),
    });
  }
  for (const w of warnings) {
    markers.push({
      severity: SEVERITY_WARNING,
      message: w.message,
      source: 'JSON Diff Studio',
      code: w.code,
      ...toRange(model, { start: w.offset, end: w.offset + Math.max(1, w.length) }),
    });
  }
  return markers;
}
