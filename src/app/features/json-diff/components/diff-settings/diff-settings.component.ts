import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import {
  LucideChevronsDownUp,
  LucideChevronsUpDown,
  LucideMoon,
  LucidePlus,
  LucideSun,
  LucideUndo2,
  LucideX,
} from '@lucide/angular';
import { ThemeService } from '../../../../core/services/theme.service';
import { ArrayCompareMode } from '../../models/diff.model';
import { COMMON_IGNORED_KEYS } from '../../models/settings.model';
import { DiffSettingsService } from '../../services/diff-settings.service';
import { JsonDiffStore } from '../../services/json-diff.store';

/** Painel lateral de configurações; todas as opções são aplicadas imediatamente. */
@Component({
  selector: 'app-diff-settings',
  imports: [
    A11yModule,
    LucideChevronsDownUp,
    LucideChevronsUpDown,
    LucideMoon,
    LucidePlus,
    LucideSun,
    LucideUndo2,
    LucideX,
  ],
  templateUrl: './diff-settings.component.html',
  styleUrl: './diff-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'closed.emit()' },
})
export class DiffSettingsComponent {
  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly theme = inject(ThemeService);
  protected readonly settingsService = inject(DiffSettingsService);
  protected readonly store = inject(JsonDiffStore);
  protected readonly settings = this.settingsService.settings;

  protected readonly keySuggestions = ['id', 'codigo', 'uuid', 'sku'];
  protected readonly newIgnoredKey = signal('');
  protected readonly ignoredSuggestions = computed(() =>
    COMMON_IGNORED_KEYS.filter((k) => !this.settings().ignoredKeys.includes(k)),
  );

  protected setArrayMode(mode: ArrayCompareMode): void {
    this.settingsService.update({ arrayMode: mode });
  }

  protected setArrayKey(value: string): void {
    this.settingsService.update({ arrayKey: value });
  }

  protected addIgnoredKey(): void {
    this.newIgnoredKey()
      .split(',')
      .forEach((key) => this.settingsService.addIgnoredKey(key));
    this.newIgnoredKey.set('');
  }

  protected reset(): void {
    this.settingsService.reset();
    this.theme.set('dark');
  }
}
