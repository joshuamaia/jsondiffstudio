import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { LucideChevronRight, LucideCrosshair } from '@lucide/angular';
import { describeType, previewValue } from '../../engine/diff-report';
import { JsonNode, isContainer } from '../../models/json-ast.model';
import { DiffNode } from '../../models/diff.model';
import { TreeDiffContext, visibleChildren } from './tree-diff.context';

const CHILD_PAGE_SIZE = 150;
const MARKERS = { added: '+', removed: '−', modified: '~', unchanged: '' } as const;

function summary(node: JsonNode | null): string {
  if (!node) return '';
  if (node.type === 'object') return `{${node.properties.length}}`;
  if (node.type === 'array') return `[${node.items.length}]`;
  return previewValue(node, 100);
}

/** Nó recursivo da árvore de diferenças. Filhos só são renderizados quando expandido. */
@Component({
  selector: 'app-tree-diff-node',
  imports: [LucideChevronRight, LucideCrosshair],
  templateUrl: './tree-diff-node.component.html',
  styleUrl: './tree-diff-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeDiffNodeComponent {
  readonly node = input.required<DiffNode>();
  readonly depth = input(0);

  protected readonly ctx = inject(TreeDiffContext);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly marker = computed(() => MARKERS[this.node().kind]);
  protected readonly hasChildren = computed(() => this.node().children.length > 0);
  protected readonly expanded = computed(() => this.ctx.expanded().has(this.node().id));
  protected readonly active = computed(() => this.ctx.activeId() === this.node().id);
  protected readonly nestedChanges = computed(() => {
    const n = this.node();
    return n.kind === 'unchanged' ? n.changeCount : 0;
  });

  protected readonly children = computed(() =>
    visibleChildren(this.node(), this.ctx.showUnchanged()),
  );
  protected readonly limit = linkedSignal({
    source: this.children,
    computation: () => CHILD_PAGE_SIZE,
  });
  protected readonly shownChildren = computed(() => this.children().slice(0, this.limit()));
  protected readonly hiddenChildren = computed(() =>
    Math.max(0, this.children().length - this.limit()),
  );

  protected readonly view = computed(() => {
    const n = this.node();
    const typeChanged = n.kind === 'modified' && n.original?.type !== n.modified?.type;
    const leafPreview = (v: JsonNode | null): string =>
      isContainer(v) ? summary(v) : previewValue(v, 100);
    const segment = n.segment;
    const moved =
      segment.kind === 'match' &&
      segment.originalIndex !== null &&
      segment.modifiedIndex !== null &&
      segment.originalIndex !== segment.modifiedIndex
        ? `posição ${segment.originalIndex} → ${segment.modifiedIndex}`
        : null;
    return {
      oldValue: n.kind === 'removed' || n.kind === 'modified' ? leafPreview(n.original) : null,
      newValue: n.kind === 'added' || n.kind === 'modified' ? leafPreview(n.modified) : null,
      value: n.kind === 'unchanged' ? summary(n.modified) : null,
      typeChange: typeChanged
        ? `${describeType(n.original?.type)} → ${describeType(n.modified?.type)}`
        : null,
      moved,
    };
  });

  constructor() {
    afterRenderEffect(() => {
      if (this.active()) {
        this.host.nativeElement.firstElementChild?.scrollIntoView?.({ block: 'nearest' });
      }
    });
  }

  protected showMore(): void {
    this.limit.update((n) => n + CHILD_PAGE_SIZE);
  }
}
