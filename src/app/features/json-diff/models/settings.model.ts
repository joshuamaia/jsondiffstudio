import { IndentSize } from '../engine/json-formatter';
import { ArrayCompareMode } from './diff.model';

export interface DiffSettings {
  readonly indent: IndentSize;
  readonly autoFormatOnPaste: boolean;
  readonly arrayMode: ArrayCompareMode;
  readonly arrayKey: string;
  readonly ignoredKeys: readonly string[];
  /** Árvore: exibir também propriedades inalteradas (`false` = somente diferenças). */
  readonly showUnchanged: boolean;
}

export const DEFAULT_SETTINGS: DiffSettings = {
  indent: 2,
  autoFormatOnPaste: true,
  arrayMode: 'index',
  arrayKey: 'id',
  ignoredKeys: [],
  showUnchanged: true,
};

/** Sugestões exibidas na tela de configurações para campos frequentemente voláteis. */
export const COMMON_IGNORED_KEYS: readonly string[] = [
  'timestamp',
  'createdAt',
  'updatedAt',
  'requestId',
];
