/**
 * Ponto de entrada (carregado sob demanda) do Monaco Editor.
 *
 * Em vez de `editor.main` — que inclui ~80 linguagens e clientes LSP — importamos apenas a
 * API e as contribuições usadas pelo JSON Diff Studio. A validação de JSON é feita pelo
 * parser próprio da aplicação, portanto o serviço de linguagem JSON do Monaco não é necessário.
 */
import * as monaco from 'monaco-editor/editor';
import { DARK_THEME, JSON_LANGUAGE_ID, LIGHT_THEME } from './monaco.constants';

import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/editor/contrib/comment/browser/comment';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo';
import 'monaco-editor/editor/contrib/folding/browser/folding';
import 'monaco-editor/editor/contrib/fontZoom/browser/fontZoom';
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/editor/contrib/indentation/browser/indentation';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations';
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor';
import 'monaco-editor/editor/contrib/placeholderText/browser/placeholderText.contribution';
import 'monaco-editor/editor/contrib/smartSelect/browser/smartSelect';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations';
import 'monaco-editor/editor/browser/coreCommands';
import 'monaco-editor/editor/contrib/dropOrPasteInto/browser/copyPasteContribution';
import 'monaco-editor/editor/contrib/find/browser/findController';
import 'monaco-editor/editor/contrib/gotoError/browser/markerSelectionStatus';
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess';
import 'monaco-editor/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess';
import 'monaco-editor/editor/common/standaloneStrings';

export type Monaco = typeof monaco;

globalThis.MonacoEnvironment = {
  getWorker: () =>
    new Worker(new URL('./monaco-editor.worker', import.meta.url), {
      type: 'module',
      name: 'monaco-editor',
    }),
};

monaco.languages.register({
  id: JSON_LANGUAGE_ID,
  extensions: ['.json'],
  aliases: ['JSON', 'json'],
  mimetypes: ['application/json'],
});

monaco.languages.setLanguageConfiguration(JSON_LANGUAGE_ID, {
  brackets: [
    ['{', '}'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}', notIn: ['string'] },
    { open: '[', close: ']', notIn: ['string'] },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '"', close: '"' },
  ],
});

monaco.languages.setMonarchTokensProvider(JSON_LANGUAGE_ID, {
  defaultToken: 'invalid',
  tokenizer: {
    root: [
      [/\s+/, 'white'],
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'key'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/"(?:[^"\\]|\\.)*$/, 'string.invalid'],
      [/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/\b(?:true|false)\b/, 'keyword'],
      [/\bnull\b/, 'keyword.null'],
      [/[{}[\]]/, '@brackets'],
      [/[,:]/, 'delimiter'],
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
    ],
    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
});

monaco.editor.defineTheme(DARK_THEME, {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'key', foreground: '7DD3FC' },
    { token: 'string', foreground: 'FDE68A' },
    { token: 'number', foreground: 'A7F3D0' },
    { token: 'keyword', foreground: 'C4B5FD' },
    { token: 'keyword.null', foreground: 'F9A8D4' },
    { token: 'delimiter', foreground: '94A3B8' },
    { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
  ],
  colors: {
    'editor.background': '#0B1220',
    'editor.foreground': '#E2E8F0',
    'editorLineNumber.foreground': '#475569',
    'editorLineNumber.activeForeground': '#CBD5E1',
    'editor.lineHighlightBackground': '#1E293B80',
    'editor.selectionBackground': '#3B82F655',
    'editorCursor.foreground': '#60A5FA',
    'editorIndentGuide.background1': '#1E293B',
    'editorGutter.background': '#0B1220',
    'editorWidget.background': '#111A2E',
    'scrollbarSlider.background': '#33415580',
  },
});

monaco.editor.defineTheme(LIGHT_THEME, {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'key', foreground: '0451A5' },
    { token: 'string', foreground: 'A31515' },
    { token: 'number', foreground: '098658' },
    { token: 'keyword', foreground: '7C3AED' },
    { token: 'keyword.null', foreground: 'BE185D' },
    { token: 'delimiter', foreground: '64748B' },
    { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editorLineNumber.foreground': '#94A3B8',
    'editor.lineHighlightBackground': '#F1F5F9',
  },
});

export { monaco };
