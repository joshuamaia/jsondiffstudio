import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { ToastHostComponent } from './shared/components/toast-host/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent],
  template: `
    <router-outlet />
    <app-toast-host />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** Instancia o serviço de tema na inicialização para aplicar o tema salvo. */
  protected readonly theme = inject(ThemeService);
}
