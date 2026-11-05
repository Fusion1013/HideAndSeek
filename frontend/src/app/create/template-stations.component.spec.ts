import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { TemplateEditorService } from './template-editor.service';
import { TemplateStationsComponent } from './template-stations.component';

describe('TemplateStationsComponent', () => {
  let gap: ReturnType<typeof signal<number | undefined>>;
  let canEdit: ReturnType<typeof signal<boolean>>;
  let fixture: ComponentFixture<TemplateStationsComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    gap = signal<number | undefined>(undefined);
    canEdit = signal(true);
    TestBed.configureTestingModule({
      imports: [TemplateStationsComponent],
      providers: [{
        provide: TemplateEditorService,
        useValue: {
          maxStationGapMinutes: gap,
          canEdit,
          busy: signal(false),
          setMaxStationGapMinutes: (minutes: number | undefined) => gap.set(minutes)
        }
      }]
    });
    fixture = TestBed.createComponent(TemplateStationsComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  const checkbox = () => element.querySelector('input[type="checkbox"]') as HTMLInputElement;
  const minutes = () => element.querySelector('#station-gap') as HTMLInputElement;

  function toggle(): void {
    checkbox().click();
    fixture.detectChanges();
  }

  function type(value: string): void {
    minutes().value = value;
    minutes().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('is off by default, without a time to fill in', async () => {
    expect(checkbox().checked).toBe(false);
    expect(minutes()).toBeNull();
    await expectNoAxeViolations(element);
  });

  it('turns the filter on with the usual time, and off again', async () => {
    toggle();
    expect(gap()).toBe(30);
    expect(minutes().value).toBe('30');
    await expectNoAxeViolations(element);

    toggle();
    expect(gap()).toBeUndefined();
    expect(minutes()).toBeNull();
  });

  it('keeps the time whole and in range, and gives a blank field the usual time', () => {
    toggle();

    type('12.4');
    expect(gap()).toBe(12);

    type('999');
    expect(gap()).toBe(240);
    expect(minutes().value).toBe('240');

    type('0');
    expect(gap()).toBe(1);

    type('');
    expect(gap()).toBe(30);
    expect(minutes().value).toBe('30');
  });

  it('shows a template it cannot change, without letting it be changed', async () => {
    gap.set(20);
    canEdit.set(false);
    fixture.detectChanges();

    expect(checkbox().checked).toBe(true);
    expect(minutes().value).toBe('20');
    expect((element.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    await expectNoAxeViolations(element);
  });
});
