import { Injectable, inject } from '@angular/core';
import { ValidationResult } from '../models/validation.model';
import { JsonParserService } from './json-parser.service';

export const EMPTY_VALIDATION: ValidationResult = {
  status: 'empty',
  ast: null,
  error: null,
  warnings: [],
};

/**
 * Valida um documento JSON e classifica seu estado: vazio, válido ou inválido
 * (com mensagem, linha e coluna do erro). Nunca altera nem corrige o conteúdo.
 */
@Injectable({ providedIn: 'root' })
export class JsonValidatorService {
  private readonly parser = inject(JsonParserService);

  validate(text: string): ValidationResult {
    if (text.trim() === '') return EMPTY_VALIDATION;
    const result = this.parser.parse(text);
    return result.ok
      ? { status: 'valid', ast: result.ast, error: null, warnings: result.warnings }
      : { status: 'invalid', ast: null, error: result.error, warnings: [] };
  }
}
