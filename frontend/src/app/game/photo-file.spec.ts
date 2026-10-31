import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { blobUrl, MAX_PHOTO_SIDE, shrunkPhoto } from './photo-file';

describe('shrunkPhoto', () => {
  let width: number;
  let height: number;
  let decode: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let drawImage: ReturnType<typeof vi.fn>;
  let drawn: HTMLCanvasElement;
  let encoded: { type?: string; quality?: unknown } = {};

  beforeEach(() => {
    width = 4000;
    height = 3000;
    drawImage = vi.fn();
    encoded = {};
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picture');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    decode = vi.fn<() => Promise<void>>(() => Promise.resolve());
    HTMLImageElement.prototype.decode = decode;
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockImplementation(() => width);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      drawn = this;
      return { drawImage } as unknown as RenderingContext;
    } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type, quality) => {
      encoded = { type, quality };
      callback(new Blob(['small'], { type }));
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('makes a JPEG with the longer side within the limit, keeping the shape', async () => {
    const photo = await shrunkPhoto(new Blob(['large']));

    expect(photo.type).toBe('image/jpeg');
    expect(encoded.type).toBe('image/jpeg');
    expect([drawn.width, drawn.height]).toEqual([MAX_PHOTO_SIDE, 1536]);
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 0, 0, MAX_PHOTO_SIDE, 1536);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:picture');
  });

  it('leaves a small picture its size, though still drawn anew', async () => {
    width = 600;
    height = 800;
    await shrunkPhoto(new Blob(['small']));
    expect([drawn.width, drawn.height]).toEqual([600, 800]);
    expect(drawImage).toHaveBeenCalled();
  });

  it('fails on what the browser cannot read, without leaving its URL behind', async () => {
    decode.mockRejectedValue(new Error('broken'));
    await expect(shrunkPhoto(new Blob(['nonsense']))).rejects.toThrow('broken');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:picture');
  });
});

describe('blobUrl', () => {
  it('makes a URL for each blob, and lets go of it after', () => {
    const created = ['blob:first', 'blob:second'];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => created.shift()!);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const blob = signal<Blob | null>(new Blob(['one']));
    const url = TestBed.runInInjectionContext(() => blobUrl(blob));

    TestBed.tick();
    expect(url()).toBe('blob:first');

    blob.set(new Blob(['two']));
    TestBed.tick();
    expect(url()).toBe('blob:second');
    expect(revoke).toHaveBeenCalledWith('blob:first');

    blob.set(null);
    TestBed.tick();
    expect(url()).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:second');
    vi.restoreAllMocks();
  });
});
