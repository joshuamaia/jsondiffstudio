import {
  JsonArrayNode,
  JsonContainerNode,
  JsonNode,
  JsonObjectNode,
  JsonPropertyNode,
  TextRange,
  isContainer,
} from '../models/json-ast.model';
import {
  DiffEntry,
  DiffKind,
  DiffNode,
  DiffOptions,
  DiffResult,
  DiffSegment,
  DiffStats,
  DiffWarning,
} from '../models/diff.model';

/**
 * Comparação estrutural recursiva entre dois ASTs JSON.
 *
 * - A ordem das propriedades de objetos é irrelevante.
 * - Propriedade ausente é diferente de propriedade com valor `null`.
 * - Números são comparados pelo valor decimal exato (`1.0` === `1`, inteiros grandes sem perda).
 * - Arrays podem ser comparados por posição ou por um campo identificador.
 *
 * Este módulo não depende de Angular nem do Monaco, podendo ser executado em um Web Worker.
 */
export function diffJson(original: JsonNode, modified: JsonNode, options: DiffOptions): DiffResult {
  const ctx = new DiffContext(options);
  const root = ctx.compare(original, modified, {
    path: '',
    label: '(raiz)',
    segment: { kind: 'root' },
    originalRange: original,
    modifiedRange: modified,
    originalParent: null,
    modifiedParent: null,
  });
  const entries = collectEntries(root);
  return {
    root,
    entries,
    stats: computeStats(entries),
    warnings: ctx.warnings,
    ignoredCount: ctx.ignoredCount,
  };
}

interface Location {
  readonly path: string;
  readonly label: string;
  readonly segment: DiffSegment;
  readonly originalRange: TextRange | null;
  readonly modifiedRange: TextRange | null;
  readonly originalParent: JsonContainerNode | null;
  readonly modifiedParent: JsonContainerNode | null;
}

class DiffContext {
  readonly warnings: DiffWarning[] = [];
  ignoredCount = 0;
  private readonly ignored: ReadonlySet<string>;

  constructor(private readonly options: DiffOptions) {
    this.ignored = new Set(options.ignoredKeys.map((k) => k.trim()).filter(Boolean));
  }

  compare(original: JsonNode | null, modified: JsonNode | null, loc: Location): DiffNode {
    if (original && !modified) return this.oneSided('removed', original, loc);
    if (!original && modified) return this.oneSided('added', modified, loc);
    if (!original || !modified) throw new Error('compare() requer ao menos um nó.');

    if (original.type !== modified.type) {
      return this.node(loc, 'modified', original, modified, []);
    }
    if (original.type === 'object' && modified.type === 'object') {
      return this.container(loc, original, modified, this.compareObjects(original, modified, loc));
    }
    if (original.type === 'array' && modified.type === 'array') {
      return this.container(loc, original, modified, this.compareArrays(original, modified, loc));
    }
    const kind: DiffKind = primitivesEqual(original, modified) ? 'unchanged' : 'modified';
    return this.node(loc, kind, original, modified, []);
  }

  private compareObjects(
    original: JsonObjectNode,
    modified: JsonObjectNode,
    loc: Location,
  ): DiffNode[] {
    const origProps = lastPropertyByKey(original);
    const modProps = lastPropertyByKey(modified);
    const children: DiffNode[] = [];

    const childLoc = (
      key: string,
      o: JsonPropertyNode | undefined,
      m: JsonPropertyNode | undefined,
    ): Location => ({
      path: joinProperty(loc.path, key),
      label: key,
      segment: { kind: 'property', key },
      originalRange: o ? { start: o.start, end: o.end } : null,
      modifiedRange: m ? { start: m.start, end: m.end } : null,
      originalParent: original,
      modifiedParent: modified,
    });

    for (const [key, m] of modProps) {
      if (this.isIgnored(key, joinProperty(loc.path, key))) continue;
      const o = origProps.get(key);
      children.push(this.compare(o?.value ?? null, m.value, childLoc(key, o, m)));
    }
    for (const [key, o] of origProps) {
      if (modProps.has(key) || this.isIgnored(key, joinProperty(loc.path, key))) continue;
      children.push(this.compare(o.value, null, childLoc(key, o, undefined)));
    }
    return children;
  }

  private compareArrays(
    original: JsonArrayNode,
    modified: JsonArrayNode,
    loc: Location,
  ): DiffNode[] {
    if (this.options.arrayMode === 'key' && this.options.arrayKey.trim()) {
      const keyed = this.compareArraysByKey(original, modified, loc, this.options.arrayKey.trim());
      if (keyed) return keyed;
    }
    const children: DiffNode[] = [];
    const length = Math.max(original.items.length, modified.items.length);
    for (let i = 0; i < length; i++) {
      const o = original.items[i] ?? null;
      const m = modified.items[i] ?? null;
      children.push(
        this.compare(o, m, {
          path: `${loc.path}[${i}]`,
          label: `[${i}]`,
          segment: { kind: 'index', index: i },
          originalRange: o,
          modifiedRange: m,
          originalParent: original,
          modifiedParent: modified,
        }),
      );
    }
    return children;
  }

  /** Retorna `null` quando o array não pode ser emparelhado por identificador (usa posição). */
  private compareArraysByKey(
    original: JsonArrayNode,
    modified: JsonArrayNode,
    loc: Location,
    field: string,
  ): DiffNode[] | null {
    const all = [...original.items, ...modified.items];
    if (!all.some((item) => item.type === 'object')) return null;

    const where = loc.path || '(raiz)';
    const origIndex = this.indexByKey(original, field, where, 'original');
    if (!origIndex) return null;
    const modIndex = this.indexByKey(modified, field, where, 'modificado');
    if (!modIndex) return null;

    const children: DiffNode[] = [];
    const childLoc = (raw: string, oi: number | null, mi: number | null): Location => {
      const o = oi === null ? null : original.items[oi];
      const m = mi === null ? null : modified.items[mi];
      return {
        path: `${loc.path}[${field}=${raw}]`,
        label: `[${field}=${raw}]`,
        segment: { kind: 'match', field, value: raw, originalIndex: oi, modifiedIndex: mi },
        originalRange: o,
        modifiedRange: m,
        originalParent: original,
        modifiedParent: modified,
      };
    };

    for (const [id, m] of modIndex) {
      const o = origIndex.get(id);
      children.push(
        this.compare(
          o ? original.items[o.index] : null,
          modified.items[m.index],
          childLoc(m.raw, o?.index ?? null, m.index),
        ),
      );
    }
    for (const [id, o] of origIndex) {
      if (modIndex.has(id)) continue;
      children.push(this.compare(original.items[o.index], null, childLoc(o.raw, o.index, null)));
    }
    return children;
  }

  private indexByKey(
    array: JsonArrayNode,
    field: string,
    where: string,
    side: string,
  ): Map<string, { index: number; raw: string }> | null {
    const index = new Map<string, { index: number; raw: string }>();
    let missing = 0;
    for (let i = 0; i < array.items.length; i++) {
      const id = identityOf(array.items[i], field);
      if (!id) {
        missing++;
        continue;
      }
      if (index.has(id.identity)) {
        this.warnings.push({
          path: where,
          message: `Array "${where}": identificador "${field}" duplicado (${id.raw}) no JSON ${side} — comparado por posição.`,
        });
        return null;
      }
      index.set(id.identity, { index: i, raw: id.raw });
    }
    if (missing > 0) {
      this.warnings.push({
        path: where,
        message: `Array "${where}": ${missing} elemento(s) sem o identificador "${field}" no JSON ${side} — comparado por posição.`,
      });
      return null;
    }
    return index;
  }

  private oneSided(kind: 'added' | 'removed', value: JsonNode, loc: Location): DiffNode {
    const children = isContainer(value) ? this.oneSidedChildren(kind, value, loc) : [];
    const anchor = (parent: JsonContainerNode | null): TextRange | null =>
      parent ? { start: parent.end - 1, end: parent.end } : null;
    return {
      id: loc.path,
      path: loc.path,
      label: loc.label,
      segment: loc.segment,
      kind,
      original: kind === 'removed' ? value : null,
      modified: kind === 'added' ? value : null,
      originalRange: kind === 'removed' ? loc.originalRange : null,
      modifiedRange: kind === 'added' ? loc.modifiedRange : null,
      originalAnchor: kind === 'added' ? anchor(loc.originalParent) : null,
      modifiedAnchor: kind === 'removed' ? anchor(loc.modifiedParent) : null,
      children,
      changeCount: 1,
    };
  }

  /** Filhos de um nó adicionado/removido, para exibição na árvore (não geram entradas próprias). */
  private oneSidedChildren(
    kind: 'added' | 'removed',
    value: JsonContainerNode,
    loc: Location,
  ): DiffNode[] {
    const side = (range: TextRange): Pick<Location, 'originalRange' | 'modifiedRange'> =>
      kind === 'removed'
        ? { originalRange: range, modifiedRange: null }
        : { originalRange: null, modifiedRange: range };
    const parents = {
      originalParent: kind === 'removed' ? value : null,
      modifiedParent: kind === 'added' ? value : null,
    };
    if (value.type === 'object') {
      return [...lastPropertyByKey(value).values()]
        .filter((p) => !this.isIgnored(p.key, joinProperty(loc.path, p.key), false))
        .map((p) =>
          this.oneSided(kind, p.value, {
            path: joinProperty(loc.path, p.key),
            label: p.key,
            segment: { kind: 'property', key: p.key },
            ...side({ start: p.start, end: p.end }),
            ...parents,
          }),
        );
    }
    return value.items.map((item, i) =>
      this.oneSided(kind, item, {
        path: `${loc.path}[${i}]`,
        label: `[${i}]`,
        segment: { kind: 'index', index: i },
        ...side(item),
        ...parents,
      }),
    );
  }

  private container(
    loc: Location,
    original: JsonContainerNode,
    modified: JsonContainerNode,
    children: DiffNode[],
  ): DiffNode {
    return this.node(loc, 'unchanged', original, modified, children);
  }

  private node(
    loc: Location,
    kind: DiffKind,
    original: JsonNode,
    modified: JsonNode,
    children: DiffNode[],
  ): DiffNode {
    const changeCount =
      kind === 'unchanged' ? children.reduce((sum, c) => sum + c.changeCount, 0) : 1;
    return {
      id: loc.path,
      path: loc.path,
      label: loc.label,
      segment: loc.segment,
      kind,
      original,
      modified,
      originalRange: loc.originalRange,
      modifiedRange: loc.modifiedRange,
      originalAnchor: null,
      modifiedAnchor: null,
      children,
      changeCount,
    };
  }

  private isIgnored(key: string, path: string, count = true): boolean {
    const ignored = this.ignored.has(key) || this.ignored.has(path);
    if (ignored && count) this.ignoredCount++;
    return ignored;
  }
}

function lastPropertyByKey(node: JsonObjectNode): Map<string, JsonPropertyNode> {
  const map = new Map<string, JsonPropertyNode>();
  for (const p of node.properties) {
    map.delete(p.key); // mantém a ordem da última ocorrência
    map.set(p.key, p);
  }
  return map;
}

const SIMPLE_KEY = /^[A-Za-z_$][\w$]*$/;

export function joinProperty(parent: string, key: string): string {
  if (SIMPLE_KEY.test(key)) return parent ? `${parent}.${key}` : key;
  return `${parent}[${JSON.stringify(key)}]`;
}

function identityOf(item: JsonNode, field: string): { identity: string; raw: string } | null {
  if (item.type !== 'object') return null;
  let prop: JsonPropertyNode | undefined;
  for (const p of item.properties) if (p.key === field) prop = p;
  const value = prop?.value;
  if (!value) return null;
  switch (value.type) {
    case 'string':
      return { identity: 's:' + value.value, raw: value.raw };
    case 'number':
      return { identity: 'n:' + canonicalNumber(value.raw), raw: value.raw };
    case 'boolean':
      return { identity: 'b:' + value.value, raw: String(value.value) };
    default:
      return null;
  }
}

export function primitivesEqual(a: JsonNode, b: JsonNode): boolean {
  switch (a.type) {
    case 'string':
      return b.type === 'string' && a.value === b.value;
    case 'number':
      return (
        b.type === 'number' &&
        (a.raw === b.raw || canonicalNumber(a.raw) === canonicalNumber(b.raw))
      );
    case 'boolean':
      return b.type === 'boolean' && a.value === b.value;
    case 'null':
      return b.type === 'null';
    default:
      return false;
  }
}

/**
 * Forma canônica e exata de um número JSON (`dígitos e expoente`), sem converter para
 * `number` — evita falsos "iguais" por perda de precisão em inteiros grandes.
 * Ex.: `1.50` → `15e-1`, `100` → `1e2`, `-0` → `0`.
 */
export function canonicalNumber(raw: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw);
  if (!match) return raw;
  const [, sign, int, frac = '', exp = '0'] = match;
  let digits = (int + frac).replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = BigInt(exp) - BigInt(frac.length);
  const trimmed = digits.replace(/0+$/, '');
  exponent += BigInt(digits.length - trimmed.length);
  digits = trimmed;
  return `${sign}${digits}e${exponent}`;
}

export function collectEntries(root: DiffNode): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const visit = (node: DiffNode): void => {
    if (node.kind !== 'unchanged') {
      entries.push(node as DiffEntry);
      return;
    }
    if (node.changeCount > 0) node.children.forEach(visit);
  };
  visit(root);
  return entries;
}

export function computeStats(entries: readonly DiffEntry[]): DiffStats {
  let added = 0;
  let removed = 0;
  let modified = 0;
  for (const e of entries) {
    if (e.kind === 'added') added++;
    else if (e.kind === 'removed') removed++;
    else modified++;
  }
  return { total: entries.length, added, removed, modified };
}
