import { Injectable } from '@angular/core';

/**
 * Acesso seguro ao `localStorage`: em modo privado, com armazenamento bloqueado ou em
 * testes, as operações falham silenciosamente e a aplicação continua com os padrões.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  read<T>(key: string): T | null {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  write(key: string, value: unknown): void {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível: ignora */
    }
  }
}
