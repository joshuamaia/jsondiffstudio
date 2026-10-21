import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  LucideBraces,
  LucideChevronDown,
  LucideEraser,
  LucideFlaskConical,
  LucideMoon,
  LucideSettings,
  LucideSun,
  LucideTriangleAlert,
} from '@lucide/angular';
import { FileService } from '../../../core/services/file.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ToastService } from '../../../shared/services/toast.service';
import { DiffListComponent } from '../components/diff-list/diff-list.component';
import { DiffSettingsComponent } from '../components/diff-settings/diff-settings.component';
import { DiffSummaryComponent } from '../components/diff-summary/diff-summary.component';
import { DiffToolbarComponent } from '../components/diff-toolbar/diff-toolbar.component';
import { JsonEditorComponent } from '../components/json-editor/json-editor.component';
import { TreeDiffComponent } from '../components/tree-diff/tree-diff.component';
import { DEMO_EXAMPLES, DemoExample, INVALID_EXAMPLE } from '../data/examples';
import { DiffNode } from '../models/diff.model';
import { EditorSide, TextChange } from '../models/editor.model';
import { DiffSettingsService } from '../services/diff-settings.service';
import { JsonDiffStore } from '../services/json-diff.store';

@Component({
  selector: 'app-json-diff-page',
  imports: [
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    DiffListComponent,
    DiffSettingsComponent,
    DiffSummaryComponent,
    DiffToolbarComponent,
    JsonEditorComponent,
    TreeDiffComponent,
    LucideBraces,
    LucideChevronDown,
    LucideEraser,
    LucideFlaskConical,
    LucideMoon,
    LucideSettings,
    LucideSun,
    LucideTriangleAlert,
  ],
  templateUrl: './json-diff-page.component.html',
  styleUrl: './json-diff-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [JsonDiffStore],
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class JsonDiffPageComponent {
  protected readonly store = inject(JsonDiffStore);
  protected readonly theme = inject(ThemeService);
  protected readonly settingsService = inject(DiffSettingsService);
  private readonly files = inject(FileService);
  private readonly toast = inject(ToastService);

  protected readonly settings = this.settingsService.settings;
  protected readonly examples = DEMO_EXAMPLES;
  protected readonly invalidExample = INVALID_EXAMPLE;
  protected readonly settingsOpen = signal(false);

  protected readonly hasContent = computed(
    () => this.store.originalText().trim() !== '' || this.store.modifiedText().trim() !== '',
  );

  protected readonly footerSummary = computed(() => {
    const s = this.settings();
    const parts = ['Comparação estrutural'];
    parts.push(
      s.arrayMode === 'key'
        ? `arrays por identificador "${s.arrayKey || '—'}"`
        : 'arrays por posição',
    );
    if (s.ignoredKeys.length > 0) {
      parts.push(
        `${s.ignoredKeys.length} ${s.ignoredKeys.length === 1 ? 'campo ignorado' : 'campos ignorados'}`,
      );
    }
    return parts.join(' · ');
  });

  protected readonly footerBadge = computed(() => {
    const status = this.store.comparisonStatus();
    const stats = this.store.stats();
    if (status === 'invalid') return 'JSON inválido';
    if (!stats) return status === 'waiting' ? 'Aguardando' : 'Comparando…';
    if (stats.total === 0) return 'Equivalentes';
    return `${stats.total} ${stats.total === 1 ? 'diferença' : 'diferenças'}`;
  });

  protected onTextChange(side: EditorSide, change: TextChange): void {
    this.store.setText(side, change.text, change.source);
  }

  protected onFormat(side: EditorSide): void {
    if (!this.store.format(side)) {
      this.toast.error('JSON inválido: corrija o erro indicado antes de formatar.');
    }
  }

  protected onImport(side: EditorSide, text: string): void {
    this.store.load(side, text, 'import');
  }

  protected loadExample(example: DemoExample): void {
    this.store.loadDocuments(example);
    this.store.viewMode.set('side-by-side');
    this.toast.show(`Exemplo "${example.title}" carregado.`, 'info');
  }

  protected clear(): void {
    this.store.clear();
    this.toast.show('Editores limpos.', 'info');
  }

  protected locate(node: DiffNode): void {
    this.store.focus(node, { switchToEditors: true });
  }

  protected exportReport(): void {
    const report = this.store.buildReport();
    if (!report) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    this.files.download(`relatorio-diferencas-${stamp}.json`, report);
    this.toast.show('Relatório de diferenças exportado.');
  }

  /** F7 / Shift+F7: próxima / anterior diferença (atalho inspirado no VS Code). */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'F7' || this.settingsOpen()) return;
    event.preventDefault();
    if (event.shiftKey) this.store.previous();
    else this.store.next();
  }
}
