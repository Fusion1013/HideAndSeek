import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ControlsPanelService } from '../controls/controls-panel.service';
import { expectNoAxeViolations } from '../../testing/axe';
import { OpenTemplateComponent, templateIdIn } from './open-template.component';

const ID = '2e7b4cbe-4e85-42f0-9d03-cc8e7089f4e3';

describe('templateIdIn', () => {
  it('finds the ID on its own or in a link, however it was pasted', () => {
    expect(templateIdIn(ID)).toBe(ID);
    expect(templateIdIn(`  ${ID}\n`)).toBe(ID);
    expect(templateIdIn(ID.toUpperCase())).toBe(ID);
    expect(templateIdIn(`https://jetlag.example/create/${ID}?x=1`)).toBe(ID);
  });

  it('finds nothing in anything else', () => {
    expect(templateIdIn('')).toBeNull();
    expect(templateIdIn('ABC234')).toBeNull();
    expect(templateIdIn('https://jetlag.example/create')).toBeNull();
  });
});

describe('OpenTemplateComponent', () => {
  let navigate: ReturnType<typeof vi.fn>;
  let select: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<OpenTemplateComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    select = vi.fn();
    TestBed.configureTestingModule({
      imports: [OpenTemplateComponent],
      providers: [provideRouter([]), { provide: ControlsPanelService, useValue: { select } }]
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
    fixture = TestBed.createComponent(OpenTemplateComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  function submit(value: string): void {
    const input = element.querySelector('#open-template') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    (element.querySelector('button[type=submit]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('opens the template in the Template tab', async () => {
    submit(`http://localhost:4200/create/${ID}`);

    expect(navigate).toHaveBeenCalledWith(['/create', ID]);
    expect(select).toHaveBeenCalledWith('template');
    expect(element.querySelector('.field-error')).toBeNull();
    await expectNoAxeViolations(element);
  });

  it('explains what it cannot open, until it can', async () => {
    submit('not an id');

    expect(navigate).not.toHaveBeenCalled();
    expect(element.querySelector('.field-error')?.textContent).toContain('not a template ID or link');
    expect(element.querySelector('#open-template')?.getAttribute('aria-invalid')).toBe('true');
    await expectNoAxeViolations(element);

    submit(ID);
    expect(element.querySelector('.field-error')).toBeNull();
  });
});
