import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import {
  LucideCircleCheck,
  LucideCircleX,
  LucideFileDown,
  LucideInfo,
  LucideLoaderCircle,
  LucideTriangleAlert,
} from '@lucide/angular';
import { DiffStats, DiffWarning } from '../../models/diff.model';
import { ComparisonStatus } from '../../services/json-diff.store';

/** Cards de resumo (total, adicionadas, modificadas, removidas) e mensagens de estado. */
@Component({
  selector: 'app-diff-summary',
  imports: [
    LucideCircleCheck,
    LucideCircleX,
    LucideFileDown,
    LucideInfo,
    LucideLoaderCircle,
    LucideTriangleAlert,
  ],
  templateUrl: './diff-summary.component.html',
  styleUrl: './diff-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffSummaryComponent {
  readonly status = input.required<ComparisonStatus>();
  readonly stats = input<DiffStats | null>(null);
  readonly stale = input(false);
  readonly warnings = input<readonly DiffWarning[]>([]);
  readonly ignoredCount = input(0);

  readonly exportReport = output<void>();
}
