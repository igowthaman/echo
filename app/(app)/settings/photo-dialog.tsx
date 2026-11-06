'use client';

import { useEffect, useRef, useState } from 'react';
import { removeAvatar, uploadAvatar } from '@/app/actions/settings';
import { Avatar } from '../_chat/avatar';
import { CloseIcon } from '../_chat/icons';

const OUTPUT_SIZE = 256;
const PREVIEW_SIZE = 240;
const MAX_ZOOM = 3;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const KEY_STEP = 12;

/** The square of the source image that becomes the photo: its centre (in source pixels) and zoom. */
type Crop = { zoom: number; x: number; y: number };

const cropSide = (image: ImageBitmap, zoom: number) => Math.min(image.width, image.height) / zoom;

// Keep the square inside the image.
function clampCrop(image: ImageBitmap, crop: Crop): Crop {
  const half = cropSide(image, crop.zoom) / 2;
  return {
    zoom: crop.zoom,
    x: Math.min(Math.max(crop.x, half), image.width - half),
    y: Math.min(Math.max(crop.y, half), image.height - half),
  };
}

function drawCrop(canvas: HTMLCanvasElement, image: ImageBitmap, crop: Crop, size: number) {
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.imageSmoothingQuality = 'high';
  const side = cropSide(image, crop.zoom);
  context.drawImage(image, crop.x - side / 2, crop.y - side / 2, side, side, 0, 0, size, size);
}

/** Renders the chosen square at 256 px as WebP, or JPEG where the browser can't make WebP. */
async function encodePhoto(image: ImageBitmap, crop: Crop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawCrop(canvas, image, crop, OUTPUT_SIZE);
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await encode('image/webp', 0.86);
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg', 0.88);
  if (!jpeg) throw new Error('Could not encode the photo');
  return jpeg;
}

export default function PhotoDialog({
  open,
  onClose,
  userId,
  name,
  avatarVersion,
}: {
  open: boolean;
  /** Called when the dialog closes; message describes what changed, if anything. */
  onClose: (message?: string) => void;
  userId: string;
  name: string;
  avatarVersion: number | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Listen to the dialog itself: Escape closes it natively. Some browsers fire only
  // "cancel" for that, so both events count as closing.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('cancel', handleClose);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('cancel', handleClose);
      dialog.removeEventListener('close', handleClose);
    };
  }, []);

  // Open and close the native modal dialog (it traps focus and handles Escape).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (!open) {
      setImage((previous) => {
        previous?.close();
        return null;
      });
      setError('');
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (image && previewRef.current) {
      drawCrop(previewRef.current, image, crop, PREVIEW_SIZE * Math.min(2, Math.ceil(window.devicePixelRatio || 1)));
    }
  }, [image, crop]);

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError('That photo is over 20 MB. Choose a smaller one.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      setImage((previous) => {
        previous?.close();
        return bitmap;
      });
      setCrop({ zoom: 1, x: bitmap.width / 2, y: bitmap.height / 2 });
      setError('');
    } catch {
      setError("Couldn't read that image. Try a JPG or PNG.");
    }
  };

  // Moving the pointer right moves the photo right, so the square moves left.
  const moveBy = (dx: number, dy: number) => {
    if (!image) return;
    setCrop((current) => {
      const scale = cropSide(image, current.zoom) / PREVIEW_SIZE;
      return clampCrop(image, { ...current, x: current.x - dx * scale, y: current.y - dy * scale });
    });
  };

  const save = async () => {
    if (!image) return;
    setBusy(true);
    setError('');
    try {
      const photo = await encodePhoto(image, crop);
      const form = new FormData();
      form.append('avatar', photo, photo.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg');
      const result = await uploadAvatar(form);
      if (result.error) setError(result.error);
      else onClose('Photo updated.');
    } catch {
      setError("Couldn't save that photo. Try another one.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    const result = await removeAvatar().catch(() => ({ error: "Couldn't remove your photo. Try again." }));
    setBusy(false);
    if (result.error) setError(result.error);
    else onClose('Photo removed.');
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="photo-dialog-title"
      // A click on the dialog element itself is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className="card-paper w-[min(400px,calc(100vw-2rem))] p-0 text-fg backdrop:bg-[rgba(16,18,24,0.55)]"
    >
      <div className="grid gap-5 p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="photo-dialog-title" className="font-display text-xl">
            Profile photo
          </h2>
          <button type="button" onClick={() => onClose()} aria-label="Close" className="btn-quiet -mr-2 p-2">
            <CloseIcon />
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={chooseFile}
        />

        {image ? (
          <div className="grid justify-items-center gap-4">
            <canvas
              ref={previewRef}
              tabIndex={0}
              role="img"
              aria-label="Photo preview. Drag, or use the arrow keys, to move the photo."
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
              }}
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (!drag || drag.pointerId !== event.pointerId) return;
                moveBy(event.clientX - drag.x, event.clientY - drag.y);
                dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
              }}
              onPointerUp={() => (dragRef.current = null)}
              onPointerCancel={() => (dragRef.current = null)}
              onKeyDown={(event) => {
                const step = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[
                  event.key
                ];
                if (!step) return;
                event.preventDefault();
                moveBy(step[0], step[1]);
              }}
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              className="max-w-full cursor-grab touch-none rounded-full ring-1 ring-line active:cursor-grabbing"
            />
            <p className="text-xs text-muted">Drag to position your photo.</p>
            <label className="grid w-full gap-1.5 text-sm font-semibold">
              Zoom
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={crop.zoom}
                onChange={(event) => setCrop((current) => clampCrop(image, { ...current, zoom: Number(event.target.value) }))}
                className="w-full accent-[var(--ink)]"
              />
            </label>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-quiet text-sm">
              Choose a different photo
            </button>
          </div>
        ) : (
          <div className="grid justify-items-center gap-4 text-center">
            <Avatar userId={userId} name={name} version={avatarVersion} size="2xl" />
            <p className="text-sm text-muted">
              Pick a JPG, PNG or WebP. You can zoom and position it before saving.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {image ? (
            <>
              <button type="button" onClick={() => onClose()} disabled={busy} className="btn-quiet">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={busy} className="btn-ink">
                {busy ? 'Saving…' : 'Save photo'}
              </button>
            </>
          ) : (
            <>
              {avatarVersion && (
                <button type="button" onClick={remove} disabled={busy} className="btn-quiet mr-auto">
                  {busy ? 'Removing…' : 'Remove photo'}
                </button>
              )}
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-ink">
                {avatarVersion ? 'Choose a new photo' : 'Choose a photo'}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
