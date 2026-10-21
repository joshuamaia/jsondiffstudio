import { Injectable, OnDestroy } from '@angular/core';
import { buildDiffReport } from '../engine/diff-report';
import { DiffWorkerRequest, DiffWorkerResponse } from '../engine/diff-worker.protocol';
import { IndentSize } from '../engine/json-formatter';
import { diffJson } from '../engine/json-diff.engine';
import { DiffOptions, DiffResult } from '../models/diff.model';
import { JsonNode } from '../models/json-ast.model';

/** A partir deste tamanho (soma dos dois documentos) a comparação roda em um Web Worker. */
export const WORKER_THRESHOLD_CHARS = 250_000;

/**
 * Fachada da comparação estrutural. Documentos pequenos são comparados de forma síncrona;
 * documentos grandes são enviados a um Web Worker para não travar a interface.
 */
@Injectable({ providedIn: 'root' })
export class JsonDiffService implements OnDestroy {
  private worker: Worker | null = null;
  private nextRequestId = 0;
  private readonly pending = new Map<number, (response: DiffWorkerResponse) => void>();

  diff(original: JsonNode, modified: JsonNode, options: DiffOptions): DiffResult {
    return diffJson(original, modified, options);
  }

  shouldUseWorker(totalChars: number): boolean {
    return totalChars >= WORKER_THRESHOLD_CHARS && typeof Worker !== 'undefined';
  }

  /** Compara em background. Em caso de falha do worker, recorre à comparação síncrona. */
  diffInBackground(
    originalText: string,
    modifiedText: string,
    fallback: () => DiffResult,
    options: DiffOptions,
  ): Promise<DiffResult> {
    const worker = this.getWorker();
    if (!worker) return Promise.resolve(fallback());

    const requestId = ++this.nextRequestId;
    const request: DiffWorkerRequest = {
      requestId,
      original: originalText,
      modified: modifiedText,
      options,
    };
    return new Promise<DiffResult>((resolve) => {
      this.pending.set(requestId, (response) =>
        resolve(response.ok ? response.result : fallback()),
      );
      worker.postMessage(request);
    });
  }

  buildReport(result: DiffResult, options: DiffOptions, indent: IndentSize): string {
    return buildDiffReport(result, options, indent);
  }

  ngOnDestroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }

  private getWorker(): Worker | null {
    if (this.worker) return this.worker;
    try {
      const worker = new Worker(new URL('../engine/json-diff.worker', import.meta.url), {
        type: 'module',
        name: 'json-diff',
      });
      worker.addEventListener('message', ({ data }: MessageEvent<DiffWorkerResponse>) => {
        const resolve = this.pending.get(data.requestId);
        this.pending.delete(data.requestId);
        resolve?.(data);
      });
      worker.addEventListener('error', () => {
        // Worker indisponível: resolve pendências com a comparação síncrona.
        for (const [requestId, resolve] of this.pending) {
          resolve({ requestId, ok: false, message: 'worker error' });
        }
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      });
      this.worker = worker;
      return worker;
    } catch {
      return null;
    }
  }
}
