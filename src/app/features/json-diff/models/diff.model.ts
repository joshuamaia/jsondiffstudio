import { JsonNode, TextRange } from './json-ast.model';

export type DiffKind = 'added' | 'removed' | 'modified' | 'unchanged';
export type ChangeKind = Exclude<DiffKind, 'unchanged'>;
export type ArrayCompareMode = 'index' | 'key';

export interface DiffOptions {
  /** `index`: compara elementos pela posição; `key`: emparelha objetos por um campo identificador. */
  readonly arrayMode: ArrayCompareMode;
  /** Campo identificador usado quando `arrayMode === 'key'` (ex.: `id`, `codigo`, `uuid`). */
  readonly arrayKey: string;
  /** Nomes (`updatedAt`) ou caminhos completos (`meta.requestId`) a ignorar. */
  readonly ignoredKeys: readonly string[];
}

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  arrayMode: 'index',
  arrayKey: 'id',
  ignoredKeys: [],
};

export type DiffSegment =
  | { readonly kind: 'root' }
  | { readonly kind: 'property'; readonly key: string }
  | { readonly kind: 'index'; readonly index: number }
  | {
      readonly kind: 'match';
      readonly field: string;
      /** Token do identificador, ex.: `2` ou `"abc"`. */
      readonly value: string;
      readonly originalIndex: number | null;
      readonly modifiedIndex: number | null;
    };

export interface DiffNode {
  /** Caminho único do nó; também usado como identificador estável. */
  readonly id: string;
  /** Caminho legível (`usuario.endereco.cidade`, `itens[id=2].nome`). Vazio para a raiz. */
  readonly path: string;
  /** Rótulo exibido na árvore (`cidade`, `[1]`, `[id=2]`). */
  readonly label: string;
  readonly segment: DiffSegment;
  readonly kind: DiffKind;
  readonly original: JsonNode | null;
  readonly modified: JsonNode | null;
  /** Trecho do documento original (inclui o nome da propriedade). */
  readonly originalRange: TextRange | null;
  readonly modifiedRange: TextRange | null;
  /** Onde indicar a ausência quando o nó não existe naquele documento. */
  readonly originalAnchor: TextRange | null;
  readonly modifiedAnchor: TextRange | null;
  readonly children: readonly DiffNode[];
  /** Quantidade de diferenças neste nó e em seus descendentes. */
  readonly changeCount: number;
}

/** Uma diferença reportada (nó cujo `kind` não é `unchanged`). */
export type DiffEntry = DiffNode & { readonly kind: ChangeKind };

export interface DiffStats {
  readonly total: number;
  readonly added: number;
  readonly removed: number;
  readonly modified: number;
}

export interface DiffWarning {
  readonly path: string;
  readonly message: string;
}

export interface DiffResult {
  readonly root: DiffNode;
  readonly entries: readonly DiffEntry[];
  readonly stats: DiffStats;
  readonly warnings: readonly DiffWarning[];
  /** Quantidade de propriedades ignoradas pelas configurações. */
  readonly ignoredCount: number;
}
