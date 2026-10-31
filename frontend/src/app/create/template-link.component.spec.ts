import { DOCUMENT } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { TemplateLinkComponent } from './template-link.component';

const ID = '2e7b4cbe-4e85-42f0-9d03-cc8e7089f4e3';

describe('TemplateLinkComponent', () => {
  let writeText: ReturnType<typeof vi.fn>;
  let fixture: ComponentFixture<TemplateLinkComponent>;
  let element: HTMLElement;

  beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    const document = TestBed.inject(DOCUMENT);
    Object.defineProperty(document.defaultView!.navigator, 'clipboard', { value: { writeText }, configurable: true });
    fixture = TestBed.createComponent(TemplateLinkComponent);
    fixture.componentRef.setInput('templateId', ID);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  const link = `${location.origin}/create/${ID}`;
  const button = (label: string) => [...element.querySelectorAll('button')].find(item => item.textContent === label)!;
  const status = () => element.querySelector('[role=status]')?.textContent;

  async function click(label: string): Promise<void> {
    button(label).click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  it('shows the link and the ID', async () => {
    expect((element.querySelector('#template-link') as HTMLInputElement).value).toBe(link);
    expect((element.querySelector('#template-share-id') as HTMLInputElement).value).toBe(ID);
    await expectNoAxeViolations(element);
  });

  it('copies either one, and says so', async () => {
    await click('Copy link');
    expect(writeText).toHaveBeenLastCalledWith(link);
    expect(status()).toBe('Link copied.');

    await click('Copy ID');
    expect(writeText).toHaveBeenLastCalledWith(ID);
    expect(status()).toBe('ID copied.');
  });

  it('says what to do when the browser refuses', async () => {
    writeText.mockRejectedValue(new Error('Not allowed'));
    await click('Copy link');
    expect(status()).toBe('It could not be copied. Select the link above and copy it by hand.');
  });
});
