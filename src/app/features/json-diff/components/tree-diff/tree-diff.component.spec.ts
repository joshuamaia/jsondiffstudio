import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { diffJson } from '../../engine/json-diff.engine';
import { parseJson } from '../../engine/json-parser';
import { DEFAULT_DIFF_OPTIONS, DiffNode } from '../../models/diff.model';
import { TreeDiffComponent } from './tree-diff.component';

function rootOf(original: string, modified: string): DiffNode {
  const a = parseJson(original);
  const b = parseJson(modified);
  if (!a.ok || !b.ok) throw new Error();
  return diffJson(a.ast, b.ast, DEFAULT_DIFF_OPTIONS).root;
}

@Component({
  imports: [TreeDiffComponent],
  template: `
    <app-tree-diff
      [root]="root()"
      status="ready"
      [expanded]="expanded()"
      [showUnchanged]="showUnchanged()"
      (toggle)="toggle($event)"
      (locate)="located = $event"
    />
  `,
})
class HostComponent {
  readonly root = signal<DiffNode | null>(
    rootOf(
      '{"usuario": {"id": 1, "nome": "Ana", "idade": 25, "endereco": {"rua": "Rua A"}, "telefone": "1"}}',
      '{"usuario": {"id": 1, "nome": "Ana", "idade": 26, "endereco": {"rua": "Rua A", "cidade": "São Paulo"}}}',
    ),
  );
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly showUnchanged = signal(true);
  located: DiffNode | null = null;

  toggle(id: string): void {
    const next = new Set(this.expanded());
    if (!next.delete(id)) next.add(id);
    this.expanded.set(next);
  }
}

describe('TreeDiffComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const rows = () =>
      [...el.querySelectorAll('.row')].map((row) =>
        [...row.children]
          .filter((child) => child.tagName !== 'BUTTON')
          .map((child) => child.textContent?.trim())
          .filter(Boolean)
          .join(' '),
      );
    return { fixture, el, host: fixture.componentInstance, rows };
  }

  it('renderiza apenas o nível superior quando recolhido (renderização sob demanda)', async () => {
    const { rows } = await setup();
    expect(rows()).toEqual(['usuario : {4} 3 alterações']);
  });

  it('expande e recolhe nós, exibindo valores anteriores e novos', async () => {
    const { fixture, el, host, rows } = await setup();
    el.querySelector<HTMLButtonElement>('.toggle')!.click();
    await fixture.whenStable();
    expect(host.expanded().has('usuario')).toBe(true);
    expect(rows()).toEqual([
      'usuario : {4} 3 alterações',
      'id : 1',
      'nome : "Ana"',
      '~ idade : 25 → 26',
      'endereco : {2} 1 alteração',
      '− telefone : "1"',
    ]);

    host.expanded.set(new Set(['usuario', 'usuario.endereco']));
    await fixture.whenStable();
    expect(rows()).toContain('+ cidade : "São Paulo"');

    host.expanded.set(new Set());
    await fixture.whenStable();
    expect(rows()).toHaveLength(1);
  });

  it('filtra para exibir somente diferenças', async () => {
    const { fixture, host, rows } = await setup();
    host.expanded.set(new Set(['usuario']));
    host.showUnchanged.set(false);
    await fixture.whenStable();
    expect(rows()).toEqual([
      'usuario : {4} 3 alterações',
      '~ idade : 25 → 26',
      'endereco : {2} 1 alteração',
      '− telefone : "1"',
    ]);
  });

  it('emite o nó para navegação até o editor', async () => {
    const { fixture, el, host } = await setup();
    el.querySelector<HTMLButtonElement>('.locate')!.click();
    await fixture.whenStable();
    expect(host.located?.path).toBe('usuario');
  });
});
