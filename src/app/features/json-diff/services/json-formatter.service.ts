import { Injectable } from '@angular/core';
import { FormatResult, IndentSize, formatJson, mapOffset } from '../engine/json-formatter';

export interface PrettyPrintResult {
  readonly text: string;
  /** Nova posição do cursor (offset) equivalente à posição anterior. */
  readonly cursorOffset: number;
}

/** Pretty print com preservação de tokens e mapeamento de cursor. */
@Injectable({ providedIn: 'root' })
export class JsonFormatterService {
  format(text: string, indent: IndentSize): FormatResult {
    return formatJson(text, indent);
  }

  /**
   * Formata o documento quando ele é válido. Retorna `null` se o conteúdo for inválido
   * (permanece intacto para correção) ou já estiver formatado.
   */
  prettyPrint(text: string, cursorOffset: number, indent: IndentSize): PrettyPrintResult | null {
    if (text.trim() === '') return null;
    const result = formatJson(text, indent);
    if (!result.ok || result.text === text) return null;
    return { text: result.text, cursorOffset: mapOffset(text, result.text, cursorOffset) };
  }

  /** Formata se válido; caso contrário devolve o texto original sem alterações. */
  formatIfValid(text: string, indent: IndentSize): string {
    const result = formatJson(text, indent);
    return result.ok ? result.text : text;
  }
}
