import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'JSON Diff Studio — Compare JSONs de forma inteligente e visual',
    loadComponent: () =>
      import('./features/json-diff/pages/json-diff-page.component').then(
        (m) => m.JsonDiffPageComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
