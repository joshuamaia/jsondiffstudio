import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { StorageService } from '../../../core/services/storage.service';
import { DiffOptions } from '../models/diff.model';
import { DEFAULT_SETTINGS, DiffSettings } from '../models/settings.model';

const STORAGE_KEY = 'jds.settings.v1';

/** Preferências do usuário, persistidas localmente e aplicadas imediatamente. */
@Injectable({ providedIn: 'root' })
export class DiffSettingsService {
  private readonly storage = inject(StorageService);
  private readonly state = signal<DiffSettings>(this.restore());

  readonly settings = this.state.asReadonly();
  readonly indent = computed(() => this.state().indent);
  readonly showUnchanged = computed(() => this.state().showUnchanged);
  readonly autoFormatOnPaste = computed(() => this.state().autoFormatOnPaste);

  readonly diffOptions = computed<DiffOptions>(
    () => {
      const { arrayMode, arrayKey, ignoredKeys } = this.state();
      return { arrayMode, arrayKey: arrayKey.trim(), ignoredKeys };
    },
    {
      equal: (a, b) =>
        a.arrayMode === b.arrayMode &&
        a.arrayKey === b.arrayKey &&
        a.ignoredKeys.length === b.ignoredKeys.length &&
        a.ignoredKeys.every((k, i) => k === b.ignoredKeys[i]),
    },
  );

  constructor() {
    effect(() => this.storage.write(STORAGE_KEY, this.state()));
  }

  update(patch: Partial<DiffSettings>): void {
    this.state.update((s) => ({ ...s, ...patch }));
  }

  addIgnoredKey(key: string): void {
    const value = key.trim();
    if (!value) return;
    this.state.update((s) =>
      s.ignoredKeys.includes(value) ? s : { ...s, ignoredKeys: [...s.ignoredKeys, value] },
    );
  }

  removeIgnoredKey(key: string): void {
    this.state.update((s) => ({ ...s, ignoredKeys: s.ignoredKeys.filter((k) => k !== key) }));
  }

  reset(): void {
    this.state.set(DEFAULT_SETTINGS);
  }

  private restore(): DiffSettings {
    const saved = this.storage.read<Partial<DiffSettings>>(STORAGE_KEY) ?? {};
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    return {
      indent: merged.indent === 4 ? 4 : 2,
      autoFormatOnPaste: merged.autoFormatOnPaste !== false,
      arrayMode: merged.arrayMode === 'key' ? 'key' : 'index',
      arrayKey: typeof merged.arrayKey === 'string' ? merged.arrayKey : DEFAULT_SETTINGS.arrayKey,
      ignoredKeys: Array.isArray(merged.ignoredKeys)
        ? merged.ignoredKeys.filter((k): k is string => typeof k === 'string')
        : [],
      showUnchanged: merged.showUnchanged !== false,
    };
  }
}
