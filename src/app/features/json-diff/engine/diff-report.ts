import { JsonNode, JsonValueType } from '../models/json-ast.model';
import { ChangeKind, DiffOptions, DiffResult } from '../models/diff.model';
import { IndentSize, compactJson, formatJson } from './json-formatter';

export const CHANGE_LABEL: Readonly<Record<ChangeKind, string>> = {
  added: 'ADDED',
  removed: 'REMOVED',
  modified: 'MODIFIED',
};

/** Representação curta de um valor para listas, árvore e tooltips. */
export function previewValue(node: JsonNode | null, maxLength = 80): string {
  if (!node) return '';
  return compactJson(node, maxLength);
}

export function describeType(type: JsonValueType | undefined): string {
  switch (type) {
    case 'object':
      return 'objeto';
    case 'array':
      return 'array';
    case 'string':
      return 'string';
    case 'number':
      return 'número';
    case 'boolean':
      return 'booleano';
    case 'null':
      return 'null';
    default:
      return '';
  }
}

/**
 * Relatório de diferenças em JSON. Os valores anteriores/novos são emitidos a partir dos
 * tokens originais (sem `JSON.parse`), preservando números grandes e escapes.
 */
export function buildDiffReport(
  result: DiffResult,
  options: DiffOptions,
  indent: IndentSize = 2,
  generatedAt: Date = new Date(),
): string {
  const str = (value: string): string => JSON.stringify(value);
  const value = (node: JsonNode | null): string => (node ? compactJson(node) : 'null');

  const differences = result.entries.map((e) => {
    const fields = [`"type": ${str(CHANGE_LABEL[e.kind])}`, `"path": ${str(e.path || '$')}`];
    if (e.kind !== 'added') fields.push(`"oldValue": ${value(e.original)}`);
    if (e.kind !== 'removed') fields.push(`"newValue": ${value(e.modified)}`);
    if (e.kind === 'modified' && e.original?.type !== e.modified?.type) {
      fields.push(
        `"oldType": ${str(e.original?.type ?? '')}`,
        `"newType": ${str(e.modified?.type ?? '')}`,
      );
    }
    return `{${fields.join(', ')}}`;
  });

  const text = `{
    "tool": "JSON Diff Studio",
    "generatedAt": ${str(generatedAt.toISOString())},
    "options": ${JSON.stringify({
      arrayMode: options.arrayMode,
      arrayKey: options.arrayMode === 'key' ? options.arrayKey : null,
      ignoredKeys: options.ignoredKeys,
    })},
    "summary": ${JSON.stringify(result.stats)},
    "warnings": ${JSON.stringify(result.warnings.map((w) => w.message))},
    "differences": [${differences.join(', ')}]
  }`;

  const formatted = formatJson(text, indent);
  if (!formatted.ok) throw new Error('Falha ao gerar relatório: ' + formatted.error.message);
  return formatted.text + '\n';
}
