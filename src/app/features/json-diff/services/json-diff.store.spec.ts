import { TestBed } from '@angular/core/testing';
import { DiffSettingsService } from './diff-settings.service';
import { JsonDiffStore, VALIDATION_DEBOUNCE_MS } from './json-diff.store';

describe('JsonDiffStore', () => {
  let store: JsonDiffStore;
  let settings: DiffSettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [JsonDiffStore] });
    store = TestBed.inject(JsonDiffStore);
    settings = TestBed.inject(DiffSettingsService);
  });

  afterEach(() => vi.useRealTimers());

  function load(original: string, modified: string): void {
    store.setText('original', original, 'paste');
    store.setText('modified', modified, 'paste');
  }

  it('aguarda os dois documentos antes de comparar', () => {
    expect(store.comparisonStatus()).toBe('waiting');
    store.setText('original', '{"a": 1}', 'paste');
    expect(store.comparisonStatus()).toBe('waiting');
    expect(store.stats()).toBeNull();
  });

  it('compara automaticamente quando ambos são válidos', () => {
    load('{"a": 1, "b": 2}', '{"a": 2, "c": 3}');
    expect(store.comparisonStatus()).toBe('ready');
    expect(store.stats()).toEqual({ total: 3, added: 1, removed: 1, modified: 1 });
  });

  it('suspende a comparação com JSON inválido, sem exibir resultados antigos', () => {
    load('{"a": 1}', '{"a": 2}');
    expect(store.stats()?.total).toBe(1);

    store.setText('modified', '{"a": 2,}', 'paste');
    expect(store.modifiedStatus()).toBe('invalid');
    expect(store.comparisonStatus()).toBe('invalid');
    expect(store.visibleResult()).toBeNull();
    expect(store.stats()).toBeNull();
    expect(store.modifiedMarks()).toEqual([]);
    // O conteúdo inválido é preservado para correção.
    expect(store.modifiedText()).toBe('{"a": 2,}');
    expect(store.modifiedValidation().error?.code).toBe('trailing-comma');
  });

  it('retoma a comparação automaticamente após a correção', () => {
    load('{"a": 1}', '{"a": 2,}');
    expect(store.comparisonStatus()).toBe('invalid');

    vi.useFakeTimers();
    store.setText('modified', '{"a": 3}', 'typing');
    expect(store.modifiedStatus()).toBe('processing');
    vi.advanceTimersByTime(VALIDATION_DEBOUNCE_MS);
    expect(store.modifiedStatus()).toBe('valid');
    expect(store.comparisonStatus()).toBe('ready');
    expect(store.entries()[0].path).toBe('a');
  });

  it('aplica debounce durante a digitação e mantém o último resultado como desatualizado', () => {
    load('{"a": 1}', '{"a": 2}');
    vi.useFakeTimers();
    store.setText('modified', '{"a": 2, "b": 1}', 'typing');
    expect(store.comparisonStatus()).toBe('processing');
    expect(store.isStale()).toBe(true);
    expect(store.stats()?.total).toBe(1);

    vi.advanceTimersByTime(VALIDATION_DEBOUNCE_MS - 1);
    expect(store.stats()?.total).toBe(1);
    vi.advanceTimersByTime(1);
    expect(store.isStale()).toBe(false);
    expect(store.stats()?.total).toBe(2);
  });

  it('aplica Pretty Print ao carregar arquivos válidos e preserva os inválidos', () => {
    store.load('original', '{"a":1}');
    expect(store.originalText()).toBe('{\n  "a": 1\n}');
    store.load('modified', '{"a":1,}');
    expect(store.modifiedText()).toBe('{"a":1,}');
    expect(store.modifiedStatus()).toBe('invalid');
  });

  it('normaliza quebras de linha CRLF para LF (mesmo formato do editor)', () => {
    store.setText('original', '{\r\n  "a": 1,\r\n}', 'import');
    expect(store.originalText()).toBe('{\n  "a": 1,\n}');
    expect(store.originalValidation().error).toMatchObject({ line: 2, column: 9, offset: 10 });
  });

  it('formata manualmente e informa falha para JSON inválido', () => {
    store.setText('original', '[1,2]', 'paste');
    expect(store.format('original')).toBe(true);
    expect(store.originalText()).toBe('[\n  1,\n  2\n]');
    store.setText('original', '[1,', 'paste');
    expect(store.format('original')).toBe(false);
    expect(store.originalText()).toBe('[1,');
  });

  it('reformata documentos válidos ao mudar a indentação', () => {
    load('{"a":1}', '{"a":2}');
    store.setIndent(4);
    expect(store.originalText()).toBe('{\n    "a": 1\n}');
    expect(settings.settings().indent).toBe(4);
  });

  it('aplica configurações imediatamente (propriedades ignoradas e arrays por id)', () => {
    load(
      '{"updatedAt": 1, "itens": [{"id": 1}, {"id": 2}]}',
      '{"updatedAt": 2, "itens": [{"id": 2}, {"id": 1}]}',
    );
    expect(store.stats()?.total).toBe(3);
    settings.addIgnoredKey('updatedAt');
    expect(store.stats()?.total).toBe(2);
    settings.update({ arrayMode: 'key', arrayKey: 'id' });
    expect(store.stats()?.total).toBe(0);
  });

  it('atualiza as marcações dos editores a cada nova comparação', () => {
    load('{\n  "a": 1\n}', '{\n  "a": 2\n}');
    const first = store.modifiedMarks();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: 'modified', type: 'change' });

    store.setText('modified', '{\n  "a": 1,\n  "b": true\n}', 'paste');
    const second = store.modifiedMarks();
    expect(second).not.toBe(first);
    expect(second.map((m) => `${m.kind}:${m.type}`)).toEqual(['added:change']);
    expect(store.originalMarks().map((m) => `${m.kind}:${m.type}`)).toEqual(['added:absent']);
  });

  describe('navegação entre diferenças', () => {
    beforeEach(() => load('{"a": 1, "b": 1, "c": 1}', '{"a": 2, "b": 2, "c": 2}'));

    it('avança e retrocede de forma circular', () => {
      expect(store.activeIndex()).toBe(-1);
      store.next();
      expect(store.activeIndex()).toBe(0);
      store.next();
      store.next();
      expect(store.activeIndex()).toBe(2);
      store.next();
      expect(store.activeIndex()).toBe(0);
      store.previous();
      expect(store.activeIndex()).toBe(2);
    });

    it('emite pedidos de foco para os dois editores', () => {
      store.next();
      const original = store.originalFocus();
      const modified = store.modifiedFocus();
      expect(original?.range).toBeDefined();
      expect(modified?.nonce).toBe(original?.nonce);
      store.next();
      expect(store.modifiedFocus()?.nonce).toBeGreaterThan(modified!.nonce);
    });

    it('respeita o filtro de tipo', () => {
      store.setText('modified', '{"a": 2, "b": 1, "d": 1}', 'paste');
      store.filter.set('added');
      expect(store.filteredEntries().map((e) => e.path)).toEqual(['d']);
      store.next();
      expect(store.activeId()).toBe('d');
    });

    it('focar um nó aninhado expande seus ancestrais na árvore', () => {
      load('{"x": {"y": {"z": 1}}}', '{"x": {"y": {"z": 2}}}');
      store.collapseAll();
      store.next();
      expect([...store.expanded()]).toEqual(expect.arrayContaining(['x', 'x.y']));
    });
  });

  it('gera relatório apenas com comparação disponível', () => {
    expect(store.buildReport()).toBeNull();
    load('{"a": 1}', '{"a": 2}');
    expect(JSON.parse(store.buildReport()!).summary.total).toBe(1);
  });

  it('limpa os editores e o estado de navegação', () => {
    load('{"a": 1}', '{"a": 2}');
    store.next();
    store.clear();
    expect(store.originalText()).toBe('');
    expect(store.activeId()).toBeNull();
    expect(store.comparisonStatus()).toBe('waiting');
  });
});
