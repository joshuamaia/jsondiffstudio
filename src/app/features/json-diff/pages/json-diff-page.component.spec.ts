import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MonacoLoaderService } from '../../../core/services/monaco-loader.service';
import { DEMO_EXAMPLES, INVALID_EXAMPLE } from '../data/examples';
import { JsonDiffStore } from '../services/json-diff.store';
import { JsonDiffPageComponent } from './json-diff-page.component';

/** O Monaco não roda em jsdom: o carregador nunca resolve e os editores ficam em "Carregando". */
const fakeLoader = { load: () => new Promise<never>(() => undefined) };

describe('JsonDiffPageComponent', () => {
  let fixture: ComponentFixture<JsonDiffPageComponent>;
  let store: JsonDiffStore;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [JsonDiffPageComponent],
      providers: [{ provide: MonacoLoaderService, useValue: fakeLoader }],
    }).compileComponents();
    fixture = TestBed.createComponent(JsonDiffPageComponent);
    store = fixture.debugElement.injector.get(JsonDiffStore);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  const text = (selector: string): string =>
    el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('exibe cabeçalho, ações e os dois editores', () => {
    expect(text('h1')).toBe('JSON Diff Studio');
    expect(el.textContent).toContain('Compare JSONs de forma inteligente e visual');
    expect(el.querySelectorAll('app-json-editor')).toHaveLength(2);
    expect(text('app-diff-summary')).toContain('Informe o JSON Original e o JSON Modificado');
  });

  it('carrega um exemplo, aplica Pretty Print e exibe o resumo e a lista', async () => {
    store.loadDocuments(DEMO_EXAMPLES[0]);
    await fixture.whenStable();

    expect(store.originalText().startsWith('{\n  "id": 1,')).toBe(true);
    const cards = [...el.querySelectorAll('.stat strong')].map((n) => n.textContent?.trim());
    expect(cards).toEqual(['4', '1', '2', '1']);
    expect(el.querySelectorAll('app-diff-list .item')).toHaveLength(4);
    expect(text('.app-footer .badge')).toBe('4 diferenças');
    expect(el.querySelectorAll('app-json-validation[data-status="valid"]')).toHaveLength(2);
  });

  it('JSON inválido: mostra o erro e suspende a comparação; corrigido, retoma', async () => {
    store.loadDocuments(INVALID_EXAMPLE);
    await fixture.whenStable();

    const invalid = el.querySelector('app-json-validation[data-status="invalid"]');
    expect(invalid?.textContent).toContain('JSON inválido');
    expect(invalid?.textContent).toContain('Vírgula desnecessária após a última propriedade.');
    expect(invalid?.textContent).toContain('Linha 6, coluna 16');
    expect(text('app-diff-summary')).toContain(
      'Comparação indisponível. Corrija o JSON inválido para continuar.',
    );
    expect(el.querySelector('app-diff-list')).toBeNull();

    store.setText('modified', store.modifiedText().replace('true,\n}', 'true\n}'), 'paste');
    await fixture.whenStable();
    expect(el.querySelector('app-json-validation[data-status="invalid"]')).toBeNull();
    expect(el.querySelectorAll('.stat strong')[0].textContent?.trim()).toBe('4');
  });

  it('informa quando os documentos são equivalentes', async () => {
    store.loadDocuments({ original: '{"a": 1, "b": 2}', modified: '{"b": 2, "a": 1}' });
    await fixture.whenStable();
    expect(text('app-diff-summary')).toContain(
      'Os documentos JSON são estruturalmente equivalentes.',
    );
  });

  it('alterna para Tree Diff mantendo os editores montados', async () => {
    store.loadDocuments(DEMO_EXAMPLES[0]);
    store.viewMode.set('tree');
    await fixture.whenStable();

    expect(el.querySelector('app-tree-diff')).not.toBeNull();
    expect(el.querySelectorAll('app-json-editor')).toHaveLength(2);
    expect(el.querySelector<HTMLElement>('section.editors')?.hidden).toBe(true);
  });

  it('navega pelas diferenças com F7 / Shift+F7', async () => {
    store.loadDocuments(DEMO_EXAMPLES[0]);
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7' }));
    await fixture.whenStable();
    expect(text('.position')).toBe('1 / 4');
    expect(el.querySelector('app-diff-list .item.active')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7', shiftKey: true }));
    await fixture.whenStable();
    expect(text('.position')).toBe('4 / 4');
  });
});
