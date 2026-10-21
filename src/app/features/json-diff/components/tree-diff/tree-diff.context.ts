import { Signal } from '@angular/core';
import { DiffNode } from '../../models/diff.model';

/**
 * Estado compartilhado pelos nós recursivos da árvore, fornecido pelo `TreeDiffComponent`.
 * Evita repassar inputs/outputs por todos os níveis da recursão.
 */
export abstract class TreeDiffContext {
  abstract readonly expanded: Signal<ReadonlySet<string>>;
  abstract readonly activeId: Signal<string | null>;
  abstract readonly showUnchanged: Signal<boolean>;
  abstract toggleNode(id: string): void;
  abstract locateNode(node: DiffNode): void;
}

/** Filhos exibidos conforme o filtro "somente diferenças". */
export function visibleChildren(node: DiffNode, showUnchanged: boolean): readonly DiffNode[] {
  if (showUnchanged || node.kind !== 'unchanged') return node.children;
  return node.children.filter((c) => c.kind !== 'unchanged' || c.changeCount > 0);
}
