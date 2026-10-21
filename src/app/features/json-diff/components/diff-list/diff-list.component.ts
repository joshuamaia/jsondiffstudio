import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { LucideCircleMinus, LucideCirclePlus, LucidePencil } from '@lucide/angular';
import { CHANGE_LABEL, describeType, previewValue } from '../../engine/diff-report';
import { DiffEntry, DiffStats } from '../../models/diff.model';
import { DiffFilter } from '../../services/json-diff.store';

const PAGE_SIZE = 200;

interface FilterOption {
  readonly value: DiffFilter;
  readonly label: string;
}

const FILTERS: readonly FilterOption[] = [
  { value: 'all', label: 'Todas' },
  { value: 'added', label: 'Adicionadas' },
  { value: 'removed', label: 'Removidas' },
  { value: 'modified', label: 'Modificadas' },
];

/** Lista interativa de diferenças com filtro por tipo; clicar navega até o editor. */
@Component({
  selector: 'app-diff-list',
  imports: [LucideCircleMinus, LucideCirclePlus, LucidePencil],
  templateUrl: './diff-list.component.html',
  styleUrl: './diff-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffListComponent {
  readonly entries = input.required<readonly DiffEntry[]>();
  readonly stats = input<DiffStats | null>(null);
  readonly filter = input<DiffFilter>('all');
  readonly activeId = input<string | null>(null);

  readonly filterChange = output<DiffFilter>();
  readonly entrySelect = output<DiffEntry>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly filters = FILTERS;
  protected readonly labels = CHANGE_LABEL;

  /** Renderização incremental para listas muito grandes. */
  protected readonly limit = linkedSignal({ source: this.entries, computation: () => PAGE_SIZE });

  protected readonly items = computed(() =>
    this.entries()
      .slice(0, this.limit())
      .map((entry) => ({
        entry,
        oldValue: entry.kind === 'added' ? null : previewValue(entry.original, 160),
        newValue: entry.kind === 'removed' ? null : previewValue(entry.modified, 160),
        typeChange:
          entry.kind === 'modified' && entry.original?.type !== entry.modified?.type
            ? `${describeType(entry.original?.type)} → ${describeType(entry.modified?.type)}`
            : null,
      })),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.entries().length - this.limit()),
  );

  constructor() {
    // Mantém o item selecionado visível ao navegar com anterior/próxima.
    afterRenderEffect(() => {
      const id = this.activeId();
      if (id === null) return;
      const el = this.host.nativeElement.querySelector(`[data-id="${CSS.escape(id)}"]`);
      el?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  protected count(filter: DiffFilter): number {
    const stats = this.stats();
    if (!stats) return 0;
    return filter === 'all' ? stats.total : stats[filter];
  }

  protected showMore(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }
}
