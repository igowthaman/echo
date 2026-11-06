'use client';

import { useState, useTransition } from 'react';
import { logOutDevice, logOutEverywhere } from '@/app/actions/sessions';
import type { DeviceKind } from '@/lib/auth/device';
import { ComputerIcon, SmartphoneIcon } from '../_chat/icons';

export type DeviceRow = {
  id: string;
  name: string;
  kind: DeviceKind;
  current: boolean;
  /** Already worded on the server, e.g. "Active 3 hours ago". */
  active: string;
  signedIn: string;
  ip: string | null;
};

type Message = { kind: 'status' | 'error'; text: string } | null;

export default function DevicesCard({ devices }: { devices: DeviceRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const logOut = (device: DeviceRow) => {
    setBusyId(device.id);
    setMessage(null);
    startTransition(async () => {
      const result = await logOutDevice(device.id).catch(() => ({ error: "Couldn't log that device out. Try again." }));
      setBusyId(null);
      setMessage(
        result.error ? { kind: 'error', text: result.error } : { kind: 'status', text: `Logged out ${device.name}.` },
      );
    });
  };

  return (
    <section aria-labelledby="devices-heading" className="card-paper p-6 sm:p-8">
      <h2 id="devices-heading" className="font-display text-xl">
        Devices
      </h2>
      <p className="mt-1 text-sm text-muted">
        Where your account is logged in. If you don&apos;t recognise a device, log it out.
      </p>

      <ul className="mt-4 divide-y divide-line">
        {devices.map((device) => (
          <li key={device.id} className="flex flex-wrap items-center gap-3 py-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-wash text-ink">
              {device.kind === 'phone' ? <SmartphoneIcon /> : <ComputerIcon />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                <span className="truncate">{device.name}</span>
                {device.current && (
                  <span className="rounded-full bg-wash px-2 py-0.5 text-xs font-semibold text-ink">This device</span>
                )}
              </p>
              <p className="text-xs text-muted">
                {device.active} · {device.signedIn}
                {device.ip && ` · IP ${device.ip}`}
              </p>
            </div>
            {!device.current && (
              <button type="button" onClick={() => logOut(device)} disabled={pending} className="btn-control text-sm">
                {busyId === device.id ? 'Logging out…' : 'Log out'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 text-sm ${message.kind === 'error' ? 'text-danger' : 'text-muted'}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-4 border-t border-line pt-4">
        {confirming ? (
          <div className="grid gap-3">
            <p className="text-sm">
              {devices.length > 1
                ? `This logs you out on all ${devices.length} devices, including this one.`
                : 'This logs you out of this device.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={logOutEverywhere}>
                <button type="submit" className="btn-danger" autoFocus>
                  Log out everywhere
                </button>
              </form>
              <button type="button" onClick={() => setConfirming(false)} className="btn-quiet">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="btn-control">
            Log out everywhere
          </button>
        )}
      </div>
    </section>
  );
}
