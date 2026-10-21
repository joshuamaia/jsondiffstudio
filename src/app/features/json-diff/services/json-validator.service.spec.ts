import { TestBed } from '@angular/core/testing';
import { JsonValidatorService } from './json-validator.service';
import { JsonFormatterService } from './json-formatter.service';

describe('JsonValidatorService', () => {
  let validator: JsonValidatorService;

  beforeEach(() => {
    validator = TestBed.inject(JsonValidatorService);
  });

  it('classifica conteúdo vazio ou só com espaços como "empty"', () => {
    expect(validator.validate('').status).toBe('empty');
    expect(validator.validate('  \n\t').status).toBe('empty');
  });

  it('JSON válido retorna AST e nenhum erro', () => {
    const result = validator.validate('{"a": 1}');
    expect(result.status).toBe('valid');
    expect(result.ast?.type).toBe('object');
    expect(result.error).toBeNull();
  });

  it('JSON inválido retorna mensagem, linha e coluna', () => {
    const result = validator.validate('{\n  "id": 1,\n  "nome": "Ana",\n}');
    expect(result.status).toBe('invalid');
    expect(result.ast).toBeNull();
    expect(result.error).toMatchObject({
      code: 'trailing-comma',
      message: 'Vírgula desnecessária após a última propriedade.',
      line: 3,
      column: 16,
    });
  });
});

describe('JsonFormatterService — Pretty Print automático', () => {
  let formatter: JsonFormatterService;

  beforeEach(() => {
    formatter = TestBed.inject(JsonFormatterService);
  });

  it('formata JSON colado em uma linha e reposiciona o cursor no fim', () => {
    const pasted = '{"id":1,"nome":"Ana","ativo":true}';
    const result = formatter.prettyPrint(pasted, pasted.length, 2);
    expect(result?.text).toBe('{\n  "id": 1,\n  "nome": "Ana",\n  "ativo": true\n}');
    expect(result?.cursorOffset).toBe(result?.text.length);
  });

  it('respeita a indentação configurada', () => {
    expect(formatter.prettyPrint('[1]', 0, 4)?.text).toBe('[\n    1\n]');
  });

  it('não altera conteúdo inválido (preservado para correção)', () => {
    expect(formatter.prettyPrint('{"id": 1,}', 5, 2)).toBeNull();
    expect(formatter.formatIfValid('{"id": 1,}', 2)).toBe('{"id": 1,}');
  });

  it('não faz nada se o documento já está formatado ou vazio', () => {
    expect(formatter.prettyPrint('{\n  "a": 1\n}', 0, 2)).toBeNull();
    expect(formatter.prettyPrint('   ', 0, 2)).toBeNull();
  });
});
