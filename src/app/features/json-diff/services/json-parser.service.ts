import { Injectable } from '@angular/core';
import { parseJson } from '../engine/json-parser';
import { ParseResult } from '../models/validation.model';

/** Parsing de JSON para AST com posições (ver `engine/json-parser.ts`). */
@Injectable({ providedIn: 'root' })
export class JsonParserService {
  parse(text: string): ParseResult {
    return parseJson(text);
  }
}
