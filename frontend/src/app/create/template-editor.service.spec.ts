import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { GameTemplateControllerService, RouteControllerService } from '../api/generated';
import type { TemplateDTO } from '../api/generated';
import { AccessTokenStore, TOKEN_STORAGE } from '../auth/access-token.store';
import { MapService } from '../map/map.service';
import { RouteSelectionService } from '../transit/route-selection.service';
import { TemplateAreaLayerService } from './template-area-layer.service';
import { TemplateEditorService } from './template-editor.service';

@Component({ template: '' })
class EmptyComponent {}

const AREA = { west: 11.9, south: 57.6, east: 12.1, north: 57.8 };
const RING = [[11.9, 57.6], [12.1, 57.6], [12.1, 57.8], [11.9, 57.8], [11.9, 57.6]];

function template(overrides: Partial<TemplateDTO> = {}): TemplateDTO {
  return {
    id: 't1',
    name: 'Göteborg',
    boundary: RING,
    routes: [{ routeId: 'r6', routeShortName: '6', agencyName: 'Västtrafik', routeType: '900', available: true }],
    createdAt: '2026-10-25T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
    ...overrides
  };
}

describe('TemplateEditorService', () => {
  let templateApi: {
    getTemplate: ReturnType<typeof vi.fn>;
    createTemplate: ReturnType<typeof vi.fn>;
    updateTemplate: ReturnType<typeof vi.fn>;
    deleteTemplate: ReturnType<typeof vi.fn>;
  };
  let routeSelection: { selectedRouteIds: ReturnType<typeof signal<string[]>>; fitView: ReturnType<typeof signal<boolean>>; select: ReturnType<typeof vi.fn> };
  let editor: TemplateEditorService;
  let tokens: AccessTokenStore;

  beforeEach(() => {
    templateApi = {
      getTemplate: vi.fn(() => of(template())),
      createTemplate: vi.fn(() => of({ template: template(), ownerToken: 'owner-token' })),
      updateTemplate: vi.fn((_id: string, request: { name: string }) => of(template({ name: request.name }))),
      deleteTemplate: vi.fn(() => of(undefined))
    };
    routeSelection = { selectedRouteIds: signal(['overview-route']), fitView: signal(true), select: vi.fn() };
    const storage = new Map<string, string>();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: EmptyComponent }]),
        TemplateEditorService,
        { provide: GameTemplateControllerService, useValue: templateApi },
        { provide: RouteControllerService, useValue: { getRouteIdsWithinBounds: () => of(['r6', 'r16']) } },
        { provide: MapService, useValue: { getMap: () => null } },
        { provide: TemplateAreaLayerService, useValue: { attach: () => false, show: vi.fn(), detach: vi.fn(), fitView: vi.fn() } },
        { provide: RouteSelectionService, useValue: routeSelection },
        { provide: TOKEN_STORAGE, useValue: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } }
      ]
    });
    editor = TestBed.inject(TemplateEditorService);
    tokens = TestBed.inject(AccessTokenStore);
  });

  it('draws the template routes instead of the Overview selection, and gives that back afterwards', () => {
    editor.setRouteIds(['r6', 'r6', 'r16']);
    TestBed.tick();

    expect(routeSelection.fitView()).toBe(false);
    expect(routeSelection.select).toHaveBeenLastCalledWith(['r6', 'r16']);

    TestBed.resetTestingModule();
    expect(routeSelection.fitView()).toBe(true);
    expect(routeSelection.select).toHaveBeenLastCalledWith(['overview-route']);
  });

  it('does not save without a name and an area', () => {
    editor.save();
    expect(editor.error()).toBe('Set the play area before saving.');

    editor.setArea(AREA);
    editor.save();
    expect(editor.error()).toBe('Give the template a name before saving.');
    expect(templateApi.createTemplate).not.toHaveBeenCalled();
  });

  it('creates a template, keeps its owner token and opens it', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    editor.name.setValue('  Göteborg ');
    editor.setArea(AREA);
    editor.setRouteIds(['r6']);

    editor.save();

    expect(templateApi.createTemplate).toHaveBeenCalledWith({ name: 'Göteborg', boundary: RING, routeIds: ['r6'] });
    expect(tokens.get('templates', 't1')).toBe('owner-token');
    expect(navigate).toHaveBeenCalledWith(['/create', 't1'], expect.objectContaining({ replaceUrl: true }));
  });

  it('loads a template it owns and saves changes to it', () => {
    tokens.set('templates', 't1', 'owner-token');
    editor.load('t1');

    expect(editor.canEdit()).toBe(true);
    expect(editor.name.value).toBe('Göteborg');
    expect(editor.area()).toEqual(AREA);
    expect(editor.routeIds()).toEqual(['r6']);
    expect(editor.dirty()).toBe(false);

    editor.name.setValue('Centrum');
    expect(editor.dirty()).toBe(true);
    editor.save();

    expect(templateApi.updateTemplate).toHaveBeenCalledWith('t1', { name: 'Centrum', boundary: RING, routeIds: ['r6'] });
    expect(editor.notice()).toBe('Changes saved.');
    expect(editor.dirty()).toBe(false);
  });

  it('only shows a template whose owner token it does not hold', () => {
    editor.load('t1');
    expect(editor.canEdit()).toBe(false);
  });

  it('explains a refused save and a missing template', () => {
    tokens.set('templates', 't1', 'stale-token');
    editor.load('t1');
    templateApi.updateTemplate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    editor.save();
    expect(editor.error()).toContain('not the template\'s owner');
    expect(editor.canEdit()).toBe(false);

    templateApi.getTemplate.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    editor.load('gone');
    expect(editor.loadError()).toBe('not-found');
  });

  it('shows the reason the backend gives for a rejected template', () => {
    templateApi.createTemplate.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 400, error: { detail: 'Unknown route: r9' } })));
    editor.name.setValue('Göteborg');
    editor.setArea(AREA);
    editor.save();
    expect(editor.error()).toBe('Unknown route: r9');
    expect(editor.busy()).toBe(false);
  });

  it('deletes the template and forgets its token', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    tokens.set('templates', 't1', 'owner-token');
    editor.load('t1');

    editor.delete();

    expect(templateApi.deleteTemplate).toHaveBeenCalledWith('t1');
    expect(tokens.get('templates', 't1')).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith(['/create'], expect.anything());
  });
});
