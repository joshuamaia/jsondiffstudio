import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideCircleCheck, LucideCircleX, LucideInfo, LucideX } from '@lucide/angular';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [LucideCircleCheck, LucideCircleX, LucideInfo, LucideX],
  template: `
    @for (toast of toastService.toasts(); track toast.id) {
      <div class="toast" [class]="'toast toast--' + toast.kind" role="status">
        @switch (toast.kind) {
          @case ('success') {
            <svg lucideCircleCheck></svg>
          }
          @case ('error') {
            <svg lucideCircleX></svg>
          }
          @default {
            <svg lucideInfo></svg>
          }
        }
        <span>{{ toast.message }}</span>
        <button
          type="button"
          class="icon-btn"
          (click)="toastService.dismiss(toast.id)"
          aria-label="Fechar"
        >
          <svg lucideX></svg>
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 1100;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: min(420px, calc(100vw - 32px));
      padding: 8px 6px 8px 12px;
      border-radius: var(--radius);
      border: 1px solid var(--border-strong);
      background: var(--bg-elevated);
      box-shadow: var(--shadow-lg);
      font-size: 13px;
      pointer-events: auto;
      animation: toast-in 0.18s ease-out;
    }
    .toast > svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    .toast span {
      flex: 1;
    }
    .toast--success > svg {
      color: var(--added);
    }
    .toast--error > svg {
      color: var(--removed);
    }
    .toast--info > svg {
      color: var(--accent);
    }
    .icon-btn {
      width: 24px;
      height: 24px;
    }
    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-live': 'polite' },
})
export class ToastHostComponent {
  protected readonly toastService = inject(ToastService);
}
