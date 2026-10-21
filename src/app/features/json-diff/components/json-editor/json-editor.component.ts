import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import {
  LucideCheck,
  LucideCopy,
  LucideDownload,
  LucideFileUp,
  LucideFoldVertical,
  LucideUnfoldVertical,
  LucideWandSparkles,
} from '@lucide/angular';
import type { IDisposable, editor as MonacoEditorNs } from 'monaco-editor/editor';
import { ThemeMode } from '../../../../core/models/theme.model';
import { FileService } from '../../../../core/services/file.service';
import { MonacoLoaderService } from '../../../../core/services/monaco-loader.service';
import {
  DARK_THEME,
  JSON_LANGUAGE_ID,
  LIGHT_THEME,
} from '../../../../core/monaco/monaco.constants';
import type { Monaco } from '../../../../core/monaco/monaco-setup';
import { ToastService } from '../../../../shared/services/toast.service';
import { IndentSize, mapOffset } from '../../engine/json-formatter';
import {
  EditorDiffMark,
  EditorFocusRequest,
  EditorSide,
  SIDE_LABEL,
  TextChange,
} from '../../models/editor.model';
import { EditorStatus, ValidationResult } from '../../models/validation.model';
import { JsonFormatterService } from '../../services/json-formatter.service';
import {
  CursorPosition,
  JsonValidationComponent,
} from '../json-validation/json-validation.component';
import { toActiveDecoration, toDiffDecorations, toMarkers, toRange } from './monaco-decorations';

const MARKER_OWNER = 'jds-json-syntax';
const ACTIVE_HIGHLIGHT_MS = 2400;

/**
 * Editor JSON baseado no Monaco: syntax highlighting, folding, Pretty Print automático ao colar,
 * diagnósticos de sintaxe e decorações de diferenças. O texto é a fonte de verdade externa
 * (`text`), e as alterações do usuário são emitidas por `textChange`.
 */
@Component({
  selector: 'app-json-editor',
  imports: [
    JsonValidationComponent,
    LucideCheck,
    LucideCopy,
    LucideDownload,
    LucideFileUp,
    LucideFoldVertical,
    LucideUnfoldVertical,
    LucideWandSparkles,
  ],
  templateUrl: './json-editor.component.html',
  styleUrl: './json-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-side]': 'side()',
    '[class.is-invalid]': "status() === 'invalid'",
    '[class.is-dragging]': 'dragging()',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'dragging.set(false)',
    '(drop)': 'onDrop($event)',
  },
})
export class JsonEditorComponent {
  readonly side = input.required<EditorSide>();
  readonly text = input.required<string>();
  readonly status = input.required<EditorStatus>();
  readonly validation = input.required<ValidationResult>();
  readonly marks = input<readonly EditorDiffMark[]>([]);
  readonly focusRequest = input<EditorFocusRequest | null>(null);
  readonly theme = input<ThemeMode>('dark');
  readonly indent = input<IndentSize>(2);
  readonly autoFormat = input(true);

  readonly textChange = output<TextChange>();
  readonly formatRequested = output<void>();
  readonly fileImported = output<string>();

  private readonly loader = inject(MonacoLoaderService);
  private readonly formatter = inject(JsonFormatterService);
  private readonly files = inject(FileService);
  private readonly clipboard = inject(Clipboard);
  private readonly toast = inject(ToastService);

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('editorHost');
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly title = computed(() => SIDE_LABEL[this.side()]);
  protected readonly ready = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly lineCount = signal(1);
  protected readonly cursor = signal<CursorPosition | null>(null);
  protected readonly copied = signal(false);
  protected readonly dragging = signal(false);
  protected readonly isEmpty = computed(() => this.text().trim() === '');

  private monaco: Monaco | null = null;
  private editor: MonacoEditorNs.IStandaloneCodeEditor | null = null;
  private model: MonacoEditorNs.ITextModel | null = null;
  private diffDecorations: MonacoEditorNs.IEditorDecorationsCollection | null = null;
  private activeDecorations: MonacoEditorNs.IEditorDecorationsCollection | null = null;
  private readonly disposables: IDisposable[] = [];
  /** Evita que atualizações vindas de fora sejam reemitidas como digitação (loop Monaco ↔ Signals). */
  private applyingExternalText = false;
  private highlightTimer: ReturnType<typeof setTimeout> | undefined;
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.dispose());
    afterNextRender(() => void this.initEditor());

    effect(() => {
      const text = this.text();
      if (this.ready()) untracked(() => this.applyExternalText(text));
    });
    effect(() => {
      const theme = this.theme();
      if (this.ready()) this.monaco?.editor.setTheme(theme === 'dark' ? DARK_THEME : LIGHT_THEME);
    });
    effect(() => {
      const indent = this.indent();
      if (this.ready())
        this.model?.updateOptions({ tabSize: indent, indentSize: indent, insertSpaces: true });
    });
    effect(() => {
      const { error, warnings } = this.validation();
      if (!this.ready()) return;
      untracked(() => {
        if (!this.monaco || !this.model) return;
        this.monaco.editor.setModelMarkers(
          this.model,
          MARKER_OWNER,
          toMarkers(this.model, error, warnings),
        );
      });
    });
    effect(() => {
      const marks = this.marks();
      if (!this.ready()) return;
      untracked(() => {
        if (this.model) this.diffDecorations?.set(toDiffDecorations(this.model, marks));
      });
    });
    effect(() => {
      const request = this.focusRequest();
      if (this.ready() && request) untracked(() => this.reveal(request));
    });
  }

  // ------------------------------------------------------------------ ações públicas
  /** Posiciona o cursor no erro de sintaxe (ou no primeiro aviso). */
  goToProblem(): void {
    const { error, warnings } = this.validation();
    const target = error ?? warnings[0];
    if (!target || !this.editor || !this.model) return;
    const position = this.model.getPositionAt(target.offset);
    this.editor.setPosition(position);
    this.editor.revealPositionInCenter(position);
    this.editor.focus();
  }

  foldAll(): void {
    void this.editor?.getAction('editor.foldAll')?.run();
  }

  unfoldAll(): void {
    void this.editor?.getAction('editor.unfoldAll')?.run();
  }

  copy(): void {
    const text = this.formatter.formatIfValid(this.text(), this.indent());
    if (!text.trim()) return;
    if (this.clipboard.copy(text)) {
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 1600);
      this.toast.show(`${this.title()} copiado para a área de transferência.`);
    } else {
      this.toast.error('Não foi possível copiar para a área de transferência.');
    }
  }

  exportFile(): void {
    const text = this.text();
    if (!text.trim()) return;
    const name = this.side() === 'original' ? 'json-original.json' : 'json-modificado.json';
    this.files.download(name, text.endsWith('\n') ? text : text + '\n');
  }

  openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (file) await this.importFile(file);
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    const file = event.dataTransfer?.files?.[0];
    this.dragging.set(false);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    await this.importFile(file);
  }

  private async importFile(file: File): Promise<void> {
    try {
      const text = await this.files.readText(file);
      this.fileImported.emit(text);
      this.toast.show(`"${file.name}" importado em ${this.title()}.`, 'info');
    } catch (e) {
      this.toast.error(e instanceof Error ? e.message : 'Falha ao ler o arquivo.');
    }
  }

  // ------------------------------------------------------------------ Monaco
  private async initEditor(): Promise<void> {
    let monaco: Monaco;
    try {
      monaco = await this.loader.load();
    } catch {
      this.loadError.set(
        'Não foi possível carregar o editor. Verifique sua conexão e recarregue a página.',
      );
      return;
    }
    if (this.destroyed) return;

    const model = monaco.editor.createModel(this.text(), JSON_LANGUAGE_ID);
    // No Windows o padrão seria CRLF; os offsets do parser assumem o texto exatamente como no store (LF).
    model.setEOL(monaco.editor.EndOfLineSequence.LF);
    model.updateOptions({ tabSize: this.indent(), indentSize: this.indent(), insertSpaces: true });
    const editor = monaco.editor.create(this.host().nativeElement, {
      model,
      theme: this.theme() === 'dark' ? DARK_THEME : LIGHT_THEME,
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 20,
      tabSize: this.indent(),
      minimap: { enabled: true, renderCharacters: false, maxColumn: 60, showSlider: 'mouseover' },
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'always',
      lineDecorationsWidth: 12,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: 'active', indentation: true },
      fixedOverflowWidgets: true,
      formatOnPaste: false,
      wordWrap: 'off',
      smoothScrolling: true,
      padding: { top: 10, bottom: 10 },
      placeholder: 'Cole ou digite um JSON aqui… (Pretty Print automático ao colar)',
      ariaLabel: `${this.title()} — editor de JSON`,
      stickyScroll: { enabled: false },
    });

    this.monaco = monaco;
    this.editor = editor;
    this.model = model;
    this.diffDecorations = editor.createDecorationsCollection();
    this.activeDecorations = editor.createDecorationsCollection();
    this.lineCount.set(model.getLineCount());

    this.disposables.push(
      model.onDidChangeContent(() => {
        this.lineCount.set(model.getLineCount());
        if (!this.applyingExternalText)
          this.textChange.emit({ text: model.getValue(), source: 'typing' });
      }),
      editor.onDidPaste(() => this.handlePaste()),
      editor.onDidChangeCursorPosition(({ position }) =>
        this.cursor.set({ line: position.lineNumber, column: position.column }),
      ),
      editor.addAction({
        id: 'jds.format',
        label: 'Formatar JSON (Pretty Print)',
        keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        contextMenuGroupId: '1_modification',
        run: () => this.formatRequested.emit(),
      }),
      model,
      editor,
    );
    this.ready.set(true);
  }

  /**
   * Pretty Print automático: após colar, se o documento inteiro for JSON válido ele é
   * reformatado (preservando o cursor e permitindo desfazer com Ctrl+Z). Conteúdo inválido
   * permanece exatamente como colado.
   */
  private handlePaste(): void {
    const { editor, model } = this;
    if (!editor || !model) return;
    const text = model.getValue();
    if (this.autoFormat()) {
      const position = editor.getPosition();
      const offset = position ? model.getOffsetAt(position) : text.length;
      const pretty = this.formatter.prettyPrint(text, offset, this.indent());
      if (pretty) {
        this.replaceContent(pretty.text, pretty.cursorOffset, 'jds-paste-format');
        this.textChange.emit({ text: pretty.text, source: 'paste' });
        return;
      }
    }
    this.textChange.emit({ text, source: 'paste' });
  }

  private applyExternalText(text: string): void {
    const { editor, model } = this;
    if (!editor || !model || model.getValue() === text) return;
    const current = model.getValue();
    const position = editor.getPosition();
    const offset = position ? model.getOffsetAt(position) : 0;
    this.replaceContent(
      text,
      current.trim() ? mapOffset(current, text, offset) : 0,
      'jds-external',
    );
  }

  private replaceContent(text: string, cursorOffset: number, source: string): void {
    const { editor, model } = this;
    if (!editor || !model) return;
    this.applyingExternalText = true;
    try {
      editor.pushUndoStop();
      editor.executeEdits(source, [
        { range: model.getFullModelRange(), text, forceMoveMarkers: true },
      ]);
      editor.pushUndoStop();
    } finally {
      this.applyingExternalText = false;
    }
    const position = model.getPositionAt(cursorOffset);
    editor.setPosition(position);
    editor.revealPositionInCenterIfOutsideViewport(position);
  }

  private reveal(request: EditorFocusRequest): void {
    const { editor, model, monaco } = this;
    if (!editor || !model || !monaco) return;
    const range = toRange(model, request.range);
    editor.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth);
    this.activeDecorations?.set([toActiveDecoration(model, request.range, request.kind)]);
    clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.activeDecorations?.clear(), ACTIVE_HIGHLIGHT_MS);
  }

  private dispose(): void {
    this.destroyed = true;
    clearTimeout(this.highlightTimer);
    clearTimeout(this.copiedTimer);
    if (this.monaco && this.model) this.monaco.editor.setModelMarkers(this.model, MARKER_OWNER, []);
    this.disposables.splice(0).forEach((d) => d.dispose());
    this.editor = null;
    this.model = null;
    this.monaco = null;
  }
}
