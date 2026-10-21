import { previewValue } from '../engine/diff-report';
import { isContainer } from '../models/json-ast.model';
import { DiffEntry, DiffNode } from '../models/diff.model';
import { EditorDiffMark, EditorFocusRequest, EditorSide } from '../models/editor.model';

const KIND_TITLE = { added: 'Adicionado', removed: 'Removido', modified: 'Alterado' } as const;

/**
 * Converte as diferenças em marcações de um dos editores:
 * - `change` para trechos que existem naquele documento;
 * - `absent` (agrupadas por posição) para indicar onde falta uma propriedade.
 */
export function buildEditorMarks(
  entries: readonly DiffEntry[],
  side: EditorSide,
): EditorDiffMark[] {
  const marks: EditorDiffMark[] = [];
  const absent = new Map<number, { range: DiffEntry['originalAnchor']; entries: DiffEntry[] }>();

  for (const entry of entries) {
    const range = side === 'original' ? entry.originalRange : entry.modifiedRange;
    if (range) {
      const node = side === 'original' ? entry.original : entry.modified;
      marks.push({
        id: entry.id,
        kind: entry.kind,
        type: 'change',
        range,
        valueRange: entry.kind === 'modified' && node && !isContainer(node) ? node : null,
        label: '',
        hover: changeHover(entry),
      });
      continue;
    }
    const anchor = side === 'original' ? entry.originalAnchor : entry.modifiedAnchor;
    if (!anchor) continue;
    const group = absent.get(anchor.start) ?? { range: anchor, entries: [] };
    group.entries.push(entry);
    absent.set(anchor.start, group);
  }

  for (const group of absent.values()) {
    const first = group.entries[0];
    const names = group.entries.map((e) => e.label);
    const label =
      names.length === 1
        ? `  ← ${first.kind === 'added' ? 'falta' : 'removido'}: ${names[0]}`
        : `  ← ${names.length} ${first.kind === 'added' ? 'ausentes' : 'removidos'}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;
    marks.push({
      id: `absent:${side}:${group.range!.start}`,
      kind: first.kind,
      type: 'absent',
      range: group.range!,
      valueRange: null,
      label,
      hover: absentHover(group.entries, side),
    });
  }
  return marks;
}

export function focusRequestFor(
  node: DiffNode,
  side: EditorSide,
  nonce: number,
): EditorFocusRequest | null {
  const range = side === 'original' ? node.originalRange : node.modifiedRange;
  if (range) return { nonce, range, kind: node.kind, absent: false };
  const anchor = side === 'original' ? node.originalAnchor : node.modifiedAnchor;
  return anchor ? { nonce, range: anchor, kind: node.kind, absent: true } : null;
}

function changeHover(entry: DiffEntry): string {
  const path = '`' + (entry.path || '(raiz)') + '`';
  const value = (n: DiffEntry['original']): string =>
    '`' + previewValue(n, 120).replace(/`/g, "'") + '`';
  switch (entry.kind) {
    case 'added':
      return `**${KIND_TITLE.added}** ${path}\n\nNovo: ${value(entry.modified)}`;
    case 'removed':
      return `**${KIND_TITLE.removed}** ${path}\n\nAnterior: ${value(entry.original)}`;
    case 'modified':
      return `**${KIND_TITLE.modified}** ${path}\n\n${value(entry.original)} → ${value(entry.modified)}`;
  }
}

function absentHover(entries: readonly DiffEntry[], side: EditorSide): string {
  const other = side === 'original' ? 'JSON Modificado' : 'JSON Original';
  const lines = entries.map((e) => `- \`${e.path}\``);
  return `**Ausente neste documento** (existe apenas no ${other}):\n\n${lines.join('\n')}`;
}
