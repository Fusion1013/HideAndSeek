import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { ModeService } from './mode.service';

@Component({ template: '' })
class EmptyComponent {}

describe('ModeService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', component: EmptyComponent, data: { mode: 'overview' } },
          { path: 'create', component: EmptyComponent, data: { mode: 'create' } },
          {
            path: 'game',
            data: { mode: 'game' },
            children: [{ path: ':gameId', component: EmptyComponent }]
          },
          { path: 'plain', component: EmptyComponent }
        ])
      ]
    });
  });

  async function navigate(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
  }

  it('takes the mode from the active route, including a parent route', async () => {
    const mode = TestBed.inject(ModeService).mode;
    expect(mode()).toBe('overview');

    await navigate('/create');
    expect(mode()).toBe('create');

    await navigate('/game/abc');
    expect(mode()).toBe('game');

    await navigate('/plain');
    expect(mode()).toBe('overview');
  });

  it('offers each mode its own tabs, keeping the open tab when the next mode has it', async () => {
    const controls = TestBed.inject(ControlsPanelService);
    await navigate('/');
    controls.select('vehicles');

    await navigate('/create');
    expect(controls.tabs()).toEqual(['template', 'layers']);
    expect(controls.activeMenu()).toBe('template');

    controls.select('layers');
    await navigate('/game/abc');
    expect(controls.hasTab('game')).toBe(true);
    expect(controls.hasTab('transit')).toBe(false);
    expect(controls.activeMenu()).toBe('layers');

    await navigate('/');
    expect(controls.activeMenu()).toBe('layers');
  });
});
