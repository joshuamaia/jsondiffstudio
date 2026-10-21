import {
  DestroyRef,
  Injectable,
  Signal,
  WritableSignal,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { IndentSize } from '../engine/json-formatter';
import { ChangeKind, DiffEntry, DiffNode, DiffOptions, DiffResult } from '../models/diff.model';
import {
  EditorDiffMark,
  EditorFocusRequest,
  EditorSide,
  TextChangeSource,
} from '../models/editor.model';
import { JsonNode, isContainer } from '../models/json-ast.model';
import { EditorStatus, ValidationResult } from '../models/validation.model';
import { DiffSettingsService } from './diff-settings.service';
import { buildEditorMarks, focusRequestFor } from './editor-marks';
import { JsonDiffService } from './json-diff.service';
import { JsonFormatterService } from './json-formatter.service';
import { JsonValidatorService } from './json-validator.service';

export type ViewMode = 'side-by-side' | 'tree';
export type DiffFilter = 'all' | ChangeKind;
/** `waiting`: algum documento vazio; `invalid`: algum documento com erro de sintaxe. */
export type ComparisonStatus = 'waiting' | 'invalid' | 'processing' | 'ready';

export const VALIDATION_DEBOUNCE_MS = 300;

interface DiffInput {
  readonly original: JsonNode;
  readonly modified: JsonNode;
  readonly originalText: string;
  readonly modifiedText: string;
  readonly options: DiffOptions;
  readonly background: boolean;
}

export interface DemoDocuments {
  readonly original: string;
  readonly modified: string;
}

/**
 * Estado da tela de comparação, 100% baseado em Signals.
 *
 * Fluxo: texto do editor → (debounce durante digitação) → texto confirmado → validação
 * (`computed`) → comparação (`computed`, ou Web Worker para documentos grandes) →
 * resumo, lista, árvore e decorações (`computed`).
 */
@Injectable()
export class JsonDiffStore {
  private readonly validator = inject(JsonValidatorService);
  private readonly formatter = inject(JsonFormatterService);
  private readonly diffService = inject(JsonDiffService);
  private readonly settingsService = inject(DiffSettingsService);

  readonly settings = this.settingsService.settings;

  // ---------------------------------------------------------------- textos e validação
  private readonly texts: Record<EditorSide, WritableSignal<string>> = {
    original: signal(''),
    modified: signal(''),
  };
  /** Texto efetivamente validado/comparado (após debounce). */
  private readonly committed: Record<EditorSide, WritableSignal<string>> = {
    original: signal(''),
    modified: signal(''),
  };
  private readonly timers: Partial<Record<EditorSide, ReturnType<typeof setTimeout>>> = {};

  readonly originalText = this.texts.original.asReadonly();
  readonly modifiedText = this.texts.modified.asReadonly();

  readonly originalValidation = computed(() => this.validator.validate(this.committed.original()));
  readonly modifiedValidation = computed(() => this.validator.validate(this.committed.modified()));

  readonly originalStatus = this.statusOf('original', this.originalValidation);
  readonly modifiedStatus = this.statusOf('modified', this.modifiedValidation);

  // ---------------------------------------------------------------- comparação
  private readonly diffInput = computed<DiffInput | null>(() => {
    const a = this.originalValidation();
    const b = this.modifiedValidation();
    if (!a.ast || !b.ast) return null;
    const originalText = this.committed.original();
    const modifiedText = this.committed.modified();
    return {
      original: a.ast,
      modified: b.ast,
      originalText,
      modifiedText,
      options: this.settingsService.diffOptions(),
      background: this.diffService.shouldUseWorker(originalText.length + modifiedText.length),
    };
  });

  private readonly backgroundResult = signal<{ input: DiffInput; result: DiffResult } | null>(null);
  private backgroundRequest = 0;

  /** Resultado atual (ou `null` enquanto indisponível / calculando em background). */
  readonly diffResult = computed<DiffResult | null>(() => {
    const input = this.diffInput();
    if (!input) return null;
    if (!input.background)
      return this.diffService.diff(input.original, input.modified, input.options);
    const done = this.backgroundResult();
    return done?.input === input ? done.result : null;
  });

  readonly comparisonStatus = computed<ComparisonStatus>(() => {
    const statuses = [this.originalStatus(), this.modifiedStatus()];
    if (statuses.includes('invalid')) return 'invalid';
    if (statuses.includes('processing')) return 'processing';
    if (statuses.includes('empty')) return 'waiting';
    return this.diffResult() ? 'ready' : 'processing';
  });

  /**
   * Resultado exibido. Durante o debounce da digitação o texto confirmado não muda, então o
   * último resultado válido continua visível (sinalizado como desatualizado por `isStale`).
   * Com documento inválido ou vazio nada é exibido.
   */
  readonly visibleResult = computed<DiffResult | null>(() => {
    const status = this.comparisonStatus();
    return status === 'ready' || status === 'processing' ? this.diffResult() : null;
  });

  readonly isStale = computed(
    () => this.comparisonStatus() === 'processing' && !!this.visibleResult(),
  );
  readonly entries = computed<readonly DiffEntry[]>(() => this.visibleResult()?.entries ?? []);
  readonly stats = computed(() => this.visibleResult()?.stats ?? null);
  readonly warnings = computed(() => this.visibleResult()?.warnings ?? []);
  readonly ignoredCount = computed(() => this.visibleResult()?.ignoredCount ?? 0);

  // ---------------------------------------------------------------- lista e navegação
  readonly viewMode = signal<ViewMode>('side-by-side');
  readonly filter = signal<DiffFilter>('all');
  readonly filteredEntries = computed(() => {
    const filter = this.filter();
    const entries = this.entries();
    return filter === 'all' ? entries : entries.filter((e) => e.kind === filter);
  });

  readonly activeId = signal<string | null>(null);
  readonly activeIndex = computed(() => {
    const id = this.activeId();
    return id === null ? -1 : this.filteredEntries().findIndex((e) => e.id === id);
  });

  private focusNonce = 0;
  readonly originalFocus = signal<EditorFocusRequest | null>(null);
  readonly modifiedFocus = signal<EditorFocusRequest | null>(null);

  readonly originalMarks = computed<EditorDiffMark[]>(() =>
    buildEditorMarks(this.entries(), 'original'),
  );
  readonly modifiedMarks = computed<EditorDiffMark[]>(() =>
    buildEditorMarks(this.entries(), 'modified'),
  );

  // ---------------------------------------------------------------- árvore
  readonly expanded = linkedSignal<DiffNode | null, ReadonlySet<string>>({
    source: () => this.visibleResult()?.root ?? null,
    computation: (root, previous) => {
      const ids = new Set(previous?.value ?? []);
      if (root) collectChangedContainers(root, ids);
      return ids;
    },
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() =>
      (['original', 'modified'] as const).forEach((s) => clearTimeout(this.timers[s])),
    );

    // Comparação em Web Worker para documentos grandes, com proteção contra respostas obsoletas.
    effect(() => {
      const input = this.diffInput();
      if (!input?.background) return;
      untracked(() => {
        const request = ++this.backgroundRequest;
        void this.diffService
          .diffInBackground(
            input.originalText,
            input.modifiedText,
            () => this.diffService.diff(input.original, input.modified, input.options),
            input.options,
          )
          .then((result) => {
            if (request === this.backgroundRequest) this.backgroundResult.set({ input, result });
          });
      });
    });
  }

  // ---------------------------------------------------------------- edição
  text(side: EditorSide): Signal<string> {
    return this.texts[side];
  }

  validation(side: EditorSide): Signal<ValidationResult> {
    return side === 'original' ? this.originalValidation : this.modifiedValidation;
  }

  /** Atualiza o texto de um editor. Digitação é validada com debounce; demais origens, na hora. */
  setText(side: EditorSide, text: string, source: TextChangeSource = 'typing'): void {
    // O editor usa LF; normalizar evita divergência de offsets entre parser e Monaco.
    this.texts[side].set(text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text);
    clearTimeout(this.timers[side]);
    if (source === 'typing' && text.trim() !== '') {
      this.timers[side] = setTimeout(() => this.commit(side), VALIDATION_DEBOUNCE_MS);
    } else {
      this.commit(side);
    }
  }

  /** Valida imediatamente o texto atual de um editor (encerra o debounce). */
  commit(side: EditorSide): void {
    clearTimeout(this.timers[side]);
    this.timers[side] = undefined;
    this.committed[side].set(this.texts[side]());
  }

  /** Carrega um texto externo (arquivo/exemplo), aplicando Pretty Print quando válido. */
  load(side: EditorSide, text: string, source: TextChangeSource = 'import'): void {
    this.setText(side, this.formatter.formatIfValid(text, this.settings().indent), source);
  }

  loadDocuments(docs: DemoDocuments): void {
    this.load('original', docs.original, 'example');
    this.load('modified', docs.modified, 'example');
    this.activeId.set(null);
    this.filter.set('all');
  }

  /** Formatação manual. Retorna `false` se o documento for inválido (o erro é exibido). */
  format(side: EditorSide): boolean {
    const result = this.formatter.format(this.texts[side](), this.settings().indent);
    if (!result.ok) {
      this.commit(side);
      return false;
    }
    this.setText(side, result.text, 'format');
    return true;
  }

  clear(): void {
    this.setText('original', '', 'clear');
    this.setText('modified', '', 'clear');
    this.activeId.set(null);
    this.filter.set('all');
    this.originalFocus.set(null);
    this.modifiedFocus.set(null);
  }

  /** Altera a indentação e reformata os documentos válidos. */
  setIndent(indent: IndentSize): void {
    this.settingsService.update({ indent });
    for (const side of ['original', 'modified'] as const) {
      if (
        this.validation(side)().status === 'valid' &&
        this.texts[side]() === this.committed[side]()
      ) {
        this.format(side);
      }
    }
  }

  // ---------------------------------------------------------------- navegação
  next(): void {
    this.step(1);
  }

  previous(): void {
    this.step(-1);
  }

  private step(direction: 1 | -1): void {
    const list = this.filteredEntries();
    if (list.length === 0) return;
    const current = this.activeIndex();
    const index =
      current < 0
        ? direction === 1
          ? 0
          : list.length - 1
        : (current + direction + list.length) % list.length;
    this.focus(list[index]);
  }

  /** Seleciona um nó: rola os editores até ele e expande seus ancestrais na árvore. */
  focus(node: DiffNode, options: { switchToEditors?: boolean } = {}): void {
    if (options.switchToEditors) this.viewMode.set('side-by-side');
    this.activeId.set(node.id);
    const nonce = ++this.focusNonce;
    this.originalFocus.set(focusRequestFor(node, 'original', nonce));
    this.modifiedFocus.set(focusRequestFor(node, 'modified', nonce));
    const root = this.visibleResult()?.root;
    const ancestors = root ? findAncestors(root, node.id) : null;
    if (ancestors?.length) {
      this.expanded.update((set) => new Set([...set, ...ancestors.map((a) => a.id)]));
    }
  }

  // ---------------------------------------------------------------- árvore
  toggleNode(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  expandAll(): void {
    const root = this.visibleResult()?.root;
    if (!root) return;
    const ids = new Set<string>();
    const visit = (node: DiffNode): void => {
      if (node.children.length === 0) return;
      ids.add(node.id);
      node.children.forEach(visit);
    };
    visit(root);
    this.expanded.set(ids);
  }

  collapseAll(): void {
    this.expanded.set(new Set());
  }

  // ---------------------------------------------------------------- relatório
  buildReport(): string | null {
    const result = this.visibleResult();
    if (!result || this.comparisonStatus() !== 'ready') return null;
    return this.diffService.buildReport(
      result,
      this.settingsService.diffOptions(),
      this.settings().indent,
    );
  }

  private statusOf(side: EditorSide, validation: Signal<ValidationResult>): Signal<EditorStatus> {
    return computed(() => {
      if (this.texts[side]() !== this.committed[side]()) return 'processing';
      return validation().status;
    });
  }
}

function collectChangedContainers(node: DiffNode, ids: Set<string>): void {
  if (node.kind !== 'unchanged' || node.children.length === 0) return;
  if (node.changeCount > 0 || node.segment.kind === 'root') ids.add(node.id);
  if (node.changeCount > 0) node.children.forEach((c) => collectChangedContainers(c, ids));
}

/** Ancestrais (da raiz ao pai) de um nó, ou `null` se não encontrado. */
export function findAncestors(root: DiffNode, id: string): DiffNode[] | null {
  const path: DiffNode[] = [];
  const visit = (node: DiffNode): boolean => {
    if (node.id === id) return true;
    if (!isContainer(node.original) && !isContainer(node.modified)) return false;
    path.push(node);
    for (const child of node.children) if (visit(child)) return true;
    path.pop();
    return false;
  };
  return visit(root) ? path : null;
}
