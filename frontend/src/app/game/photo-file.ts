import { effect, signal, Signal } from '@angular/core';

/** The longer side of a photo sent as an answer: enough to study it full screen, in far less than a phone's file. */
export const MAX_PHOTO_SIDE = 2048;
const JPEG_QUALITY = 0.85;

/**
 * The picture, turned the way it was taken, as a JPEG of at most {@link MAX_PHOTO_SIDE} pixels a side. Hiders may be
 * on a poor connection with the clock running; and drawing it anew leaves behind what its file says about where it
 * was taken. Rejected if the browser cannot read the picture.
 */
export async function shrunkPhoto(picture: Blob): Promise<Blob> {
  const url = URL.createObjectURL(picture);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('The picture could not be drawn')), 'image/jpeg', JPEG_QUALITY));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A URL for showing the blob, for as long as it is the one and the caller lives. Needs an injection context. */
export function blobUrl(blob: () => Blob | null): Signal<string | null> {
  const url = signal<string | null>(null);
  effect(onCleanup => {
    const current = blob();
    if (!current) {
      url.set(null);
      return;
    }
    const created = URL.createObjectURL(current);
    url.set(created);
    onCleanup(() => URL.revokeObjectURL(created));
  });
  return url.asReadonly();
}
