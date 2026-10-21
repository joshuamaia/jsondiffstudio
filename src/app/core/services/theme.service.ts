import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';
import { ThemeMode } from '../models/theme.model';
import { StorageService } from './storage.service';

const STORAGE_KEY = 'jds.theme';

/** Tema da aplicação (escuro por padrão), persistido e aplicado em `<html data-theme>`. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(StorageService);

  readonly theme = signal<ThemeMode>(
    this.storage.read<ThemeMode>(STORAGE_KEY) === 'light' ? 'light' : 'dark',
  );

  constructor() {
    effect(() => {
      const theme = this.theme();
      this.document.documentElement.dataset['theme'] = theme;
      this.document.documentElement.style.colorScheme = theme;
      this.storage.write(STORAGE_KEY, theme);
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  set(theme: ThemeMode): void {
    this.theme.set(theme);
  }
}
