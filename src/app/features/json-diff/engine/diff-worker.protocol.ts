import { DiffOptions, DiffResult } from '../models/diff.model';

export interface DiffWorkerRequest {
  readonly requestId: number;
  readonly original: string;
  readonly modified: string;
  readonly options: DiffOptions;
}

export type DiffWorkerResponse =
  | { readonly requestId: number; readonly ok: true; readonly result: DiffResult }
  | { readonly requestId: number; readonly ok: false; readonly message: string };
