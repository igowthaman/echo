'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from './avatar';
import { useEchoContext } from './echo-context';
import { CameraIcon, MicIcon, PhoneIcon, VideoIcon } from './icons';

function VideoView({ stream, muted = false, className }: { stream: MediaStream | null; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function AudioView({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function useDuration(startedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) return '';
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function CallOverlay() {
  const echo = useEchoContext();
  const { calls } = echo;
  const { state } = calls;
  const duration = useDuration(state.phase === 'active' ? state.startedAt : null);

  if (state.phase === 'idle') return null;

  const name = echo.nameOf(state.peer);
  const avatarVersion = echo.profileOf(state.peer)?.avatarVersion;
  const kindLabel = state.kind === 'video' ? 'Video call' : 'Voice call';

  if (state.phase === 'incoming' || state.phase === 'outgoing') {
    const incoming = state.phase === 'incoming';
    return (
      <div
        role={incoming ? 'alertdialog' : 'status'}
        aria-label={incoming ? `${kindLabel} from ${name}` : `Calling ${name}`}
        className="card-paper fixed inset-x-4 bottom-4 z-50 flex flex-wrap items-center gap-4 p-4 shadow-[0_18px_50px_-20px_rgba(20,24,32,0.45)] sm:left-auto sm:w-[380px]"
      >
        <Avatar userId={state.peer} name={name} version={avatarVersion} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{incoming ? `${name} is calling` : `Calling ${name}…`}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            {state.kind === 'video' ? <VideoIcon /> : <PhoneIcon />}
            {kindLabel}
          </p>
        </div>
        <div className="flex gap-2">
          {incoming ? (
            <>
              <button type="button" onClick={calls.decline} className="btn-quiet">
                Decline
              </button>
              <button type="button" onClick={calls.accept} className="btn-ink" autoFocus>
                Answer
              </button>
            </>
          ) : (
            <button type="button" onClick={calls.hangUp} className="btn-danger">
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  const video = state.kind === 'video';
  return (
    <div role="dialog" aria-label={`${kindLabel} with ${name}`} className="fixed inset-0 z-50 flex flex-col bg-paper">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <Avatar userId={state.peer} name={name} version={avatarVersion} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-sm tabular-nums text-muted">
            {kindLabel}
            {duration && ` · ${duration}`}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden p-3 sm:p-6">
        {video ? (
          <>
            <div className="relative h-full overflow-hidden rounded-[28px_20px_30px_22px/22px_30px_20px_28px] bg-[#101217]">
              {calls.remoteStream ? (
                <VideoView stream={calls.remoteStream} className="h-full w-full object-contain" />
              ) : (
                <p className="grid h-full place-items-center text-sm text-[#C9CCD3]">Connecting video…</p>
              )}
            </div>
            <div className="absolute bottom-6 right-6 w-32 overflow-hidden rounded-2xl border-2 border-surface bg-[#101217] sm:bottom-10 sm:right-10 sm:w-48">
              {calls.cameraOff ? (
                <p className="grid aspect-video place-items-center text-xs text-[#C9CCD3]">Camera off</p>
              ) : (
                <VideoView stream={calls.localStream} muted className="aspect-video w-full -scale-x-100 object-cover" />
              )}
            </div>
          </>
        ) : (
          <div className="relative grid h-full place-items-center">
            <div aria-hidden className="wash-blob wash-blob-wash h-80 w-80" />
            <div className="relative grid justify-items-center gap-4 text-center">
              <Avatar userId={state.peer} name={name} version={avatarVersion} size="2xl" />
              <p className="font-display text-3xl">{name}</p>
              <p className="text-sm text-muted">{calls.remoteStream ? 'Connected' : 'Connecting…'}</p>
            </div>
            <AudioView stream={calls.remoteStream} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line bg-surface px-4 py-4">
        <button type="button" onClick={calls.toggleMute} aria-pressed={calls.muted} className="btn-control">
          <MicIcon off={calls.muted} />
          {calls.muted ? 'Unmute' : 'Mute'}
        </button>
        {video && (
          <button type="button" onClick={calls.toggleCamera} aria-pressed={calls.cameraOff} className="btn-control">
            <CameraIcon off={calls.cameraOff} />
            {calls.cameraOff ? 'Turn camera on' : 'Turn camera off'}
          </button>
        )}
        <button type="button" onClick={calls.hangUp} className="btn-danger">
          <PhoneIcon />
          Hang up
        </button>
      </div>
    </div>
  );
}
