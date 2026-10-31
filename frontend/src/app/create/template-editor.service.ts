import { HttpErrorResponse } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { GameTemplateControllerService, RouteControllerService } from '../api/generated';
import type { QuestionRules, TemplateDTO, TemplateRequest, TemplateRouteDTO } from '../api/generated';
import { AccessTokenStore } from '../auth/access-token.store';
import { QuestionSettings, questionRules, QuestionType, settingsProblem } from '../game/questions';
import { MapService } from '../map/map.service';
import { sameItems } from '../shared/guards';
import { problemDetail } from '../shared/problem-detail';
import { RouteSelectionService } from '../transit/route-selection.service';
import { AreaBounds, boundsToRing, ringToBounds } from './area-bounds';
import { TemplateAreaLayerService } from './template-area-layer.service';

export const MAX_TEMPLATE_NAME_LENGTH = 100;

export type EditorStatus = 'idle' | 'loading' | 'saving' | 'deleting';

/** Shown once on the page a save or delete navigates to. */
interface NavigationNotice {
  notice?: string;
}

/**
 * The template being edited in Create mode: a new one, or a saved one loaded by ID. One per visit to Create mode
 * (provided by the panel). While it exists, the map shows its area and draws its routes instead of the Overview
 * selection, which comes back when Create mode closes.
 */
@Injectable()
export class TemplateEditorService {
  private readonly templateApi = inject(GameTemplateControllerService);
  private readonly routeApi = inject(RouteControllerService);
  private readonly tokens = inject(AccessTokenStore);
  private readonly router = inject(Router);
  private readonly mapService = inject(MapService);
  private readonly areaLayer = inject(TemplateAreaLayerService);
  private readonly routeSelection = inject(RouteSelectionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, notBlank, Validators.maxLength(MAX_TEMPLATE_NAME_LENGTH)]
  });

  /** Undefined until a new template is first saved. */
  readonly templateId = signal<string | undefined>(undefined);
  readonly area = signal<AreaBounds | null>(null);
  readonly routeIds = signal<string[]>([], { equal: sameItems });
  /** The saved template's routes with the names they were saved with, for routes the timetable no longer has. */
  readonly savedRoutes = signal<readonly TemplateRouteDTO[]>([]);
  readonly questions = signal<QuestionSettings>({});

  readonly status = signal<EditorStatus>('idle');
  /** A saved template that could not be loaded. */
  readonly loadError = signal<'not-found' | 'failed' | null>(null);
  /** The outcome of the last action, for a polite live region. */
  readonly notice = signal('');
  readonly error = signal('');
  readonly dirty = signal(false);
  private readonly ownerToken = signal<string | undefined>(undefined);

  /** A new template, or a saved one this browser holds the owner token for. */
  readonly canEdit = computed(() => this.templateId() === undefined || this.ownerToken() !== undefined);
  readonly busy = computed(() => this.status() !== 'idle');

  /** IDs of the routes serving a stop inside the area. */
  private readonly routesInArea = rxResource({
    params: () => this.area() ?? undefined,
    stream: ({ params: area }) =>
      this.routeApi.getRouteIdsWithinBounds(area.south, area.north, area.west, area.east)
  });

  readonly routeIdsInArea = computed<ReadonlySet<string>>(() =>
    new Set(this.routesInArea.hasValue() ? this.routesInArea.value() : []));
  readonly routesInAreaLoading = this.routesInArea.isLoading;
  readonly routesInAreaFailed = computed(() => this.routesInArea.error() !== undefined);

  constructor() {
    const notice = (this.router.currentNavigation()?.extras.state as NavigationNotice | undefined)?.notice;
    if (notice) this.notice.set(notice);

    this.name.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.dirty.set(true));

    // The area on the map, once the map exists
    effect(() => {
      const area = this.area();
      if (this.mapService.getMap() && this.areaLayer.attach()) this.areaLayer.show(area);
    });

    // The template's routes take the place of the Overview selection
    const overviewRouteIds = untracked(this.routeSelection.selectedRouteIds);
    this.routeSelection.fitView.set(false);
    effect(() => this.routeSelection.select(this.routeIds()));

    this.destroyRef.onDestroy(() => {
      this.areaLayer.detach();
      this.routeSelection.fitView.set(true);
      this.routeSelection.select(overviewRouteIds);
    });
  }

  load(templateId: string): void {
    this.templateId.set(templateId);
    this.ownerToken.set(this.tokens.get('templates', templateId));
    this.status.set('loading');
    this.loadError.set(null);
    this.templateApi.getTemplate(templateId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: template => {
        this.apply(template);
        this.status.set('idle');
        const area = this.area();
        if (area) this.areaLayer.fitView(area);
      },
      error: (error: unknown) => {
        this.loadError.set(error instanceof HttpErrorResponse && error.status === 404 ? 'not-found' : 'failed');
        this.status.set('idle');
      }
    });
  }

  setArea(area: AreaBounds): void {
    this.area.set(area);
    this.markChanged();
  }

  setRouteIds(routeIds: readonly string[]): void {
    this.routeIds.set([...new Set(routeIds)]);
    this.markChanged();
  }

  setQuestionRules(type: QuestionType, change: Partial<QuestionRules>): void {
    this.questions.update(questions => ({ ...questions, [type]: { ...questionRules(questions, type), ...change } }));
    this.markChanged();
  }

  /** Creates the template, or saves the changes to it. A new template's owner token is kept in this browser. */
  save(): void {
    const area = this.area();
    this.name.markAsTouched();
    if (this.name.invalid || !area) {
      this.error.set(!area ? 'Set the play area before saving.' : 'Give the template a name before saving.');
      return;
    }

    const problem = settingsProblem(this.questions());
    if (problem) {
      this.error.set(problem);
      return;
    }

    const request: TemplateRequest = {
      name: this.name.value.trim(),
      boundary: boundsToRing(area),
      routeIds: this.routeIds(),
      settings: { questions: this.questions() }
    };
    const templateId = this.templateId();
    this.status.set('saving');
    this.error.set('');

    if (templateId === undefined) {
      this.templateApi.createTemplate(request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: ({ template, ownerToken }) => {
          this.tokens.set('templates', template.id, ownerToken);
          this.dirty.set(false);
          void this.router.navigate(['/create', template.id], {
            replaceUrl: true,
            state: { notice: 'Template created.' } satisfies NavigationNotice
          });
        },
        error: (error: unknown) => this.fail(error, 'The template could not be created.')
      });
      return;
    }

    this.templateApi.updateTemplate(templateId, request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: template => {
        this.apply(template);
        this.status.set('idle');
        this.notice.set('Changes saved.');
      },
      error: (error: unknown) => this.fail(error, 'The changes could not be saved.')
    });
  }

  delete(): void {
    const templateId = this.templateId();
    if (templateId === undefined) return;
    this.status.set('deleting');
    this.error.set('');
    this.templateApi.deleteTemplate(templateId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.tokens.remove('templates', templateId);
        this.dirty.set(false);
        void this.router.navigate(['/create'], { state: { notice: 'Template deleted.' } satisfies NavigationNotice });
      },
      error: (error: unknown) => this.fail(error, 'The template could not be deleted.')
    });
  }

  private apply(template: TemplateDTO): void {
    this.name.setValue(template.name, { emitEvent: false });
    this.area.set(ringToBounds(template.boundary));
    this.routeIds.set(template.routes.map(route => route.routeId));
    this.savedRoutes.set(template.routes);
    this.questions.set(template.settings.questions);
    this.dirty.set(false);
  }

  private markChanged(): void {
    this.dirty.set(true);
    this.notice.set('');
  }

  private fail(error: unknown, fallback: string): void {
    this.status.set('idle');
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.ownerToken.set(undefined);
      this.error.set('This browser is not the template\'s owner, so it cannot change it.');
      return;
    }
    this.error.set(problemDetail(error) ?? fallback);
  }
}

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length === 0 ? { required: true } : null;
}
