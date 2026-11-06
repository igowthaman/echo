'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, GroupAvatar } from './avatar';
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
  if (echo.groupCalls.active) return <GroupCall />;
  return (
    <>
      <OneToOneCall />
      {echo.calls.state.phase === 'idle' && <GroupRingCard />}
    </>
  );
}

const floatingCard =
  'card-paper fixed inset-x-4 bottom-4 z-50 flex flex-wrap items-center gap-4 p-4 shadow-[0_18px_50px_-20px_rgba(20,24,32,0.45)] sm:left-auto sm:w-[380px]';

/** "Arjun started a video call in Weekend Sketchers", with Join and Dismiss. */
function GroupRingCard() {
  const echo = useEchoContext();
  const ring = echo.groupCalls.ring;
  if (!ring) return null;
  const group = echo.groups.list.find((g) => g.group.id === ring.groupId)?.group;
  if (!group) return null;
  const kindLabel = ring.kind === 'video' ? 'video call' : 'voice call';
  return (
    <div role="alertdialog" aria-label={`Group ${kindLabel} in ${group.name}`} className={floatingCard}>
      <GroupAvatar name={group.name} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{group.name}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          {ring.kind === 'video' ? <VideoIcon /> : <PhoneIcon />}
          <span className="truncate">
            {echo.nameOf(ring.from)} started a {kindLabel}
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={echo.groupCalls.dismiss} className="btn-quiet">
          Dismiss
        </button>
        <button type="button" onClick={() => echo.groupCalls.join(ring.groupId)} className="btn-ink" autoFocus>
          Join
        </button>
      </div>
    </div>
  );
}

function CallControls({ video, onLeave, leaveLabel }: { video: boolean; onLeave: () => void; leaveLabel: string }) {
  const { calls } = useEchoContext();
  return (
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
      <button type="button" onClick={onLeave} className="btn-danger">
        <PhoneIcon />
        {leaveLabel}
      </button>
    </div>
  );
}

/** One square on the group call screen. */
function CallTile({
  userId,
  name,
  stream,
  video,
  me = false,
}: {
  userId: string;
  name: string;
  stream: MediaStream | null;
  video: boolean;
  me?: boolean;
}) {
  const echo = useEchoContext();
  const showVideo = video && stream && !(me && echo.calls.cameraOff);
  return (
    <div className="relative grid min-h-0 place-items-center overflow-hidden rounded-[24px_18px_26px_20px/20px_26px_18px_24px] bg-[#101217]">
      {showVideo ? (
        <VideoView stream={stream} muted={me} className={`h-full w-full object-cover ${me ? '-scale-x-100' : ''}`} />
      ) : (
        <div className="grid justify-items-center gap-2">
          <Avatar userId={userId} name={name} version={echo.profileOf(userId)?.avatarVersion ?? (me ? echo.me.avatarVersion : null)} size="xl" />
          {!stream && <span className="text-xs text-[#C9CCD3]">Connecting…</span>}
        </div>
      )}
      {!me && !video && <AudioView stream={stream} />}
      <span className="absolute bottom-2 left-2 rounded-full bg-[rgba(16,18,23,0.7)] px-2.5 py-1 text-xs font-semibold text-[#F2F2F4]">
        {me ? 'You' : name}
      </span>
    </div>
  );
}

function GroupCall() {
  const echo = useEchoContext();
  const view = echo.groupCalls.active!;
  const duration = useDuration(view.startedAt);
  const group = echo.groups.list.find((g) => g.group.id === view.groupId)?.group;
  const others = Object.entries(view.streams);
  const video = view.kind === 'video';
  const name = group?.name ?? 'Group call';
  const count = others.length + 1;

  return (
    <div role="dialog" aria-label={`${video ? 'Video' : 'Voice'} call in ${name}`} className="fixed inset-0 z-50 flex flex-col bg-paper">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <GroupAvatar name={name} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-sm tabular-nums text-muted">
            {video ? 'Video call' : 'Voice call'} · {count} on the call
            {duration && ` · ${duration}`}
          </p>
        </div>
      </header>

      <div
        className={`grid min-h-0 flex-1 gap-3 p-3 sm:p-6 ${
          count === 1 ? 'grid-rows-[minmax(0,1fr)_auto]' : count === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 grid-rows-2'
        }`}
      >
        <CallTile userId={echo.me.id} name={echo.me.displayName} stream={view.local} video={video} me />
        {others.map(([peer, stream]) => (
          <CallTile key={peer} userId={peer} name={echo.nameOf(peer)} stream={stream} video={video} />
        ))}
        {others.length === 0 && (
          <p className="text-center text-sm text-muted">Waiting for others to join…</p>
        )}
      </div>

      <CallControls video={video} onLeave={echo.groupCalls.leave} leaveLabel="Leave call" />
    </div>
  );
}

function OneToOneCall() {
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
        className={floatingCard}
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

      <CallControls video={video} onLeave={calls.hangUp} leaveLabel="Hang up" />
    </div>
  );
}
