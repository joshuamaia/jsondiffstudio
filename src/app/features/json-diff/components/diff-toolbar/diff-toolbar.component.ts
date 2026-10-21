import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideColumns2,
  LucideListTree,
  LucideLoaderCircle,
} from '@lucide/angular';
import { ComparisonStatus, ViewMode } from '../../services/json-diff.store';

/** Alternância de visualização e navegação entre diferenças (anterior/próxima). */
@Component({
  selector: 'app-diff-toolbar',
  imports: [LucideChevronDown, LucideChevronUp, LucideColumns2, LucideListTree, LucideLoaderCircle],
  templateUrl: './diff-toolbar.component.html',
  styleUrl: './diff-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffToolbarComponent {
  readonly viewMode = input.required<ViewMode>();
  readonly status = input.required<ComparisonStatus>();
  /** Posição (base 0) da diferença selecionada; -1 se nenhuma. */
  readonly activeIndex = input(-1);
  readonly total = input(0);

  readonly viewModeChange = output<ViewMode>();
  readonly previous = output<void>();
  readonly next = output<void>();

  protected readonly canNavigate = computed(() => this.total() > 0);
  protected readonly position = computed(() =>
    this.total() === 0
      ? '0 / 0'
      : `${this.activeIndex() < 0 ? '–' : this.activeIndex() + 1} / ${this.total()}`,
  );
}
