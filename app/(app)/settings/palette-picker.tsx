'use client';

import { useState, useTransition } from 'react';
import { savePalette } from '@/app/actions/settings';
import { paletteIds, palettes, type PaletteId } from '@/app/theme/palettes';

export default function PalettePicker({ current }: { current: PaletteId }) {
  const [chosen, setChosen] = useState<PaletteId>(current);
  const [status, setStatus] = useState('');
  const [, startTransition] = useTransition();

  const choose = (id: PaletteId) => {
    const previous = chosen;
    setChosen(id);
    // Repaint at once; the server keeps the choice for the next page load.
    document.documentElement.dataset.palette = id;
    setStatus('Saving…');
    startTransition(async () => {
      const result = await savePalette(id).catch(() => ({ ok: false }));
      if (result.ok) {
        setStatus(`Saved. Echo now uses ${palettes[id].label}.`);
      } else {
        setChosen(previous);
        document.documentElement.dataset.palette = previous;
        setStatus("Couldn't save your palette. Try again.");
      }
    });
  };

  return (
    <fieldset className="mt-5">
      <legend className="sr-only">Choose a palette</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {paletteIds.map((id) => {
          const p = palettes[id];
          const checked = id === chosen;
          return (
            <label
              key={id}
              className={`flex cursor-pointer items-center gap-4 rounded-[18px_12px_20px_14px/14px_20px_12px_18px] border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                checked ? 'border-ink bg-wash' : 'border-line hover:border-pigment'
              }`}
            >
              <input
                type="radio"
                name="palette"
                value={id}
                checked={checked}
                onChange={() => choose(id)}
                className="sr-only"
              />
              <span aria-hidden className="flex">
                {[p.wash, p.pigment, p.ink].map((color, index) => (
                  <span
                    key={color}
                    className={`h-8 w-8 rounded-full border-2 border-surface ${index > 0 ? '-ml-3' : ''}`}
                    style={{ background: color }}
                  />
                ))}
              </span>
              <span className="font-semibold">{p.label}</span>
              {checked && <span className="ml-auto text-xs font-semibold text-ink">In use</span>}
            </label>
          );
        })}
      </div>
      <p role="status" className="mt-3 min-h-5 text-sm text-muted">
        {status}
      </p>
    </fieldset>
  );
}
