import { Routes } from '@angular/router';

import type { AppMode } from './mode/mode.service';

/**
 * Each mode is a route. The map stays in place across them (it lives in MapComponent); a route only supplies
 * the content of the controls panel, through the outlet inside it.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Jetlag',
    data: { mode: 'overview' satisfies AppMode },
    loadComponent: () => import('./overview/overview-panel.component')
  },
  {
    path: 'create',
    data: { mode: 'create' satisfies AppMode },
    title: 'Create a game · Jetlag',
    loadComponent: () => import('./create/create-panel.component')
  },
  {
    path: 'create/:templateId',
    data: { mode: 'create' satisfies AppMode },
    title: 'Game template · Jetlag',
    loadComponent: () => import('./create/create-panel.component')
  },
  {
    path: 'join',
    data: { mode: 'game' satisfies AppMode },
    title: 'Join a game · Jetlag',
    loadComponent: () => import('./game/game-panel.component')
  },
  {
    path: 'game/:gameId',
    data: { mode: 'game' satisfies AppMode },
    title: 'Game · Jetlag',
    loadComponent: () => import('./game/game-panel.component')
  },
  { path: '**', redirectTo: '' }
];
