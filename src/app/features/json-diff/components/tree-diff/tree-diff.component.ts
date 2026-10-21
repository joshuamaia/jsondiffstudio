import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideChevronsDownUp, LucideChevronsUpDown } from '@lucide/angular';
import { DiffNode } from '../../models/diff.model';
import { ComparisonStatus } from '../../services/json-diff.store';
import { TreeDiffNodeComponent } from './tree-diff-node.component';
import { TreeDiffContext, visibleChildren } from './tree-diff.context';

/** Visualização hierárquica (Tree Diff) com expandir/recolher e filtro de diferenças. */
@Component({
  selector: 'app-tree-diff',
  imports: [TreeDiffNodeComponent, LucideChevronsDownUp, LucideChevronsUpDown],
  templateUrl: './tree-diff.component.html',
  styleUrl: './tree-diff.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: TreeDiffContext, useExisting: TreeDiffComponent }],
})
export class TreeDiffComponent implements TreeDiffContext {
  readonly root = input<DiffNode | null>(null);
  readonly status = input.required<ComparisonStatus>();
  readonly stale = input(false);
  readonly expanded = input<ReadonlySet<string>>(new Set());
  readonly activeId = input<string | null>(null);
  readonly showUnchanged = input(true);

  readonly toggle = output<string>();
  readonly locate = output<DiffNode>();
  readonly expandAll = output<void>();
  readonly collapseAll = output<void>();
  readonly showUnchangedChange = output<boolean>();

  /** A raiz é omitida quando é um contêiner comum aos dois lados: exibimos seus filhos. */
  protected readonly topLevel = computed<readonly DiffNode[]>(() => {
    const root = this.root();
    if (!root) return [];
    if (root.kind === 'unchanged' && root.children.length > 0) {
      return visibleChildren(root, this.showUnchanged());
    }
    return [root];
  });

  toggleNode(id: string): void {
    this.toggle.emit(id);
  }

  locateNode(node: DiffNode): void {
    this.locate.emit(node);
  }
}
