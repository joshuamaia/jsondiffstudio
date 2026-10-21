import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  LucideCircleCheck,
  LucideCircleDashed,
  LucideCircleX,
  LucideLoaderCircle,
  LucideTriangleAlert,
} from '@lucide/angular';
import { EditorStatus, ValidationResult } from '../../models/validation.model';

export interface CursorPosition {
  readonly line: number;
  readonly column: number;
}

/** Barra de status de um editor: estado do documento, erro com linha/coluna e contadores. */
@Component({
  selector: 'app-json-validation',
  imports: [
    LucideCircleCheck,
    LucideCircleDashed,
    LucideCircleX,
    LucideLoaderCircle,
    LucideTriangleAlert,
  ],
  templateUrl: './json-validation.component.html',
  styleUrl: './json-validation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', 'aria-live': 'polite', '[attr.data-status]': 'status()' },
})
export class JsonValidationComponent {
  readonly status = input.required<EditorStatus>();
  readonly validation = input.required<ValidationResult>();
  readonly lineCount = input(0);
  readonly cursor = input<CursorPosition | null>(null);
  readonly autoFormat = input(true);

  /** Solicita ao editor que posicione o cursor no erro (ou no primeiro aviso). */
  readonly locate = output<void>();

  protected readonly error = computed(() => this.validation().error);
  protected readonly warnings = computed(() => this.validation().warnings);
}
