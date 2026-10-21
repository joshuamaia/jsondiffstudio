/// <reference lib="webworker" />

import { DiffWorkerRequest, DiffWorkerResponse } from './diff-worker.protocol';
import { diffJson } from './json-diff.engine';
import { parseJson } from './json-parser';

/** Executa parsing + comparação fora da thread principal para documentos grandes. */
addEventListener('message', ({ data }: MessageEvent<DiffWorkerRequest>) => {
  const { requestId } = data;
  let response: DiffWorkerResponse;
  try {
    const original = parseJson(data.original);
    const modified = parseJson(data.modified);
    response =
      original.ok && modified.ok
        ? { requestId, ok: true, result: diffJson(original.ast, modified.ast, data.options) }
        : { requestId, ok: false, message: 'Documento inválido.' };
  } catch (e) {
    response = { requestId, ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  postMessage(response);
});
