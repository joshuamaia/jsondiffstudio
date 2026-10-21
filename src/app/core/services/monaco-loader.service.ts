import { DOCUMENT, Injectable, inject } from '@angular/core';
import type { Monaco } from '../monaco/monaco-setup';

/** Folha de estilo do Monaco gerada como bundle não injetado (ver `angular.json`). */
const MONACO_STYLESHEET = 'monaco-editor.css';

/**
 * Carrega o Monaco Editor sob demanda (JS e CSS em chunks separados) uma única vez por
 * aplicação. Mantém o bundle inicial pequeno e permite substituir o carregador em testes.
 */
@Injectable({ providedIn: 'root' })
export class MonacoLoaderService {
  private readonly document = inject(DOCUMENT);
  private loading: Promise<Monaco> | null = null;

  load(): Promise<Monaco> {
    this.loading ??= Promise.all([
      this.loadStylesheet(),
      import('../monaco/monaco-setup').then((m) => m.monaco),
    ]).then(([, monaco]) => monaco);
    return this.loading;
  }

  private loadStylesheet(): Promise<void> {
    return new Promise((resolve) => {
      const link = this.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = MONACO_STYLESHEET;
      // Em caso de falha o editor ainda funciona (com estilos degradados); não bloqueia.
      link.onload = link.onerror = () => resolve();
      this.document.head.appendChild(link);
    });
  }
}
