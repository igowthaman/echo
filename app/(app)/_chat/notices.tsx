'use client';

import { useEchoContext } from './echo-context';

// Slim notices above the page content. Nothing renders unless there's a
// problem to explain, so the chat gets the space the rest of the time.
export default function Notices() {
  const echo = useEchoContext();

  const connection =
    echo.status === 'taken'
      ? 'Echo is open in another tab or window. Close it, then reload this page.'
      : echo.status === 'offline'
        ? "Can't reach the Echo server. Chat and calls pause until it reconnects."
        : null;

  if (!connection && !echo.error) return null;

  return (
    <div className="grid gap-2 px-4 pt-3 sm:pt-5">
      {connection && (
        <p role="status" className="rounded-[12px] border border-line bg-surface px-4 py-2.5 text-sm text-muted">
          {connection}
        </p>
      )}
      {echo.error && (
        <div className="flex items-start gap-3 rounded-[12px] border border-line bg-surface px-4 py-2.5 text-sm">
          <p role="alert" className="min-w-0 flex-1 text-danger">
            {echo.error}
          </p>
          <button type="button" onClick={echo.clearError} className="btn-quiet -my-1 -mr-2 text-xs">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
