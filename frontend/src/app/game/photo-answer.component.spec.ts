import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { PhotoAnswerComponent } from './photo-answer.component';

describe('PhotoAnswerComponent', () => {
  let fixture: ComponentFixture<PhotoAnswerComponent>;
  let element: HTMLElement;
  let sent: Blob[];
  let decode: ReturnType<typeof vi.fn<() => Promise<void>>>;

  const buttons = () => [...element.querySelectorAll('button')];
  const button = (name: string) => buttons().find(item => item.textContent?.trim() === name) as HTMLButtonElement;

  /** As the browser does once a file is chosen; settled when the file has been read. */
  async function pick(): Promise<void> {
    const input = element.querySelector('input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['picture'], 'tree.jpg')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    decode = vi.fn<() => Promise<void>>(() => Promise.resolve());
    HTMLImageElement.prototype.decode = decode;
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['small'], { type })));

    TestBed.configureTestingModule({ imports: [PhotoAnswerComponent] });
    fixture = TestBed.createComponent(PhotoAnswerComponent);
    sent = [];
    fixture.componentInstance.send.subscribe(photo => sent.push(photo));
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.restoreAllMocks());

  it('asks for a picture of any kind, by a button, with nothing to send yet', async () => {
    expect((element.querySelector('input') as HTMLInputElement).accept).toBe('image/*');
    expect(buttons().map(item => item.textContent?.trim())).toEqual(['Take or choose a photo']);
    await expectNoAxeViolations(element);
  });

  it('opens the device\'s picker from the button', () => {
    const open = vi.spyOn(element.querySelector('input') as HTMLInputElement, 'click').mockImplementation(() => undefined);
    button('Take or choose a photo').click();
    expect(open).toHaveBeenCalled();
  });

  it('shows the photo and sends it only when told to', async () => {
    await pick();

    expect(element.querySelector('img')?.getAttribute('src')).toBe('blob:photo');
    expect(sent).toHaveLength(0);
    await expectNoAxeViolations(element);

    button('Send photo').click();
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe('image/jpeg');
  });

  it('holds back while something is being sent', async () => {
    await pick();
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    expect(button('Send photo').disabled).toBe(true);
    expect(button('Choose another').disabled).toBe(true);
  });

  it('says so when the file cannot be read, with nothing left to send', async () => {
    decode.mockRejectedValue(new Error('broken'));
    await pick();

    expect(element.querySelector('[role=alert]')?.textContent).toContain('could not be read as a photo');
    expect(element.querySelector('img')).toBeNull();
    expect(button('Send photo')).toBeUndefined();
    await expectNoAxeViolations(element);
  });
});
