import { DOCUMENT, Injectable, inject } from '@angular/core';

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** Leitura de arquivos locais e download de conteúdo gerado no navegador. */
@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly document = inject(DOCUMENT);

  async readText(file: File): Promise<string> {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error(
        `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`,
      );
    }
    const text = await file.text();
    // Remove a marca BOM que alguns editores adicionam a arquivos UTF-8.
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  download(fileName: string, content: string, mimeType = 'application/json'): void {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
