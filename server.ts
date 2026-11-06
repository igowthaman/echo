import express from 'express';
import { ExpressPeerServer } from 'peer';
import { readFileSync } from 'fs';
import { createServer, type IncomingMessage, type RequestListener, type Server } from 'http';
import { createServer as createHttpsServer } from 'https';
import { networkInterfaces } from 'os';
import next from 'next';
import { SESSION_COOKIE } from './lib/auth/cookie';
import { getSessionUser } from './lib/auth/session';
import { markOffline, markOnline } from './lib/presence';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// Browsers always send Origin with a WebSocket handshake. It must be Echo's
// own address (or APP_ORIGIN, when Echo runs behind a proxy).
function isSameOrigin(req: IncomingMessage): boolean {
  const { origin, host } = req.headers;
  if (!origin || !host) return false;
  try {
    const originHost = new URL(origin).host;
    return originHost === host || (!!process.env.APP_ORIGIN && originHost === new URL(process.env.APP_ORIGIN).host);
  } catch {
    return false;
  }
}

// Only a logged-in user may register with the signalling server, and only
// under their own user ID. This must stay synchronous: PeerJS takes the
// socket as soon as this function returns.
function canUsePeerServer(req: IncomingMessage): boolean {
  if (!isSameOrigin(req)) return false;
  const user = getSessionUser(readCookie(req.headers.cookie, SESSION_COOKIE));
  if (!user) return false;
  const peerId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('id');
  return peerId === user.id;
}

app.prepare().then(() => {
  const appExpress = express();
  const handleNextUpgrade = app.getUpgradeHandler();

  const handleRequest: RequestListener = (req, res) => {
    if (req.url?.startsWith('/peerjs')) {
      appExpress(req, res);
      return;
    }
    handle(req, res);
  };

  // HTTPS_KEY_FILE + HTTPS_CERT_FILE switch on HTTPS. Phones need it to make
  // calls and install the app over Wi-Fi (npm run cert:dev makes the files).
  const { HTTPS_KEY_FILE, HTTPS_CERT_FILE } = process.env;
  const tls =
    HTTPS_KEY_FILE && HTTPS_CERT_FILE ? { key: readFileSync(HTTPS_KEY_FILE), cert: readFileSync(HTTPS_CERT_FILE) } : null;
  const server: Server = tls ? createHttpsServer(tls, handleRequest) : createServer(handleRequest);

  // PeerJS's WebSocket server answers every upgrade that isn't its own path
  // with a 400, which would break Next's dev reload socket. So it gets a
  // private server that never listens and only receives checked /peerjs upgrades.
  const peerSocketServer = createServer();
  const peerServer = ExpressPeerServer(peerSocketServer, {
    path: '/api',
  });
  peerServer.on('connection', (client) => markOnline(client.getId()));
  peerServer.on('disconnect', (client) => markOffline(client.getId()));

  appExpress.use('/peerjs', peerServer);

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/peerjs')) {
      handleNextUpgrade(req, socket, head);
      return;
    }
    if (!canUsePeerServer(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    peerSocketServer.emit('upgrade', req, socket, head);
  });

  server.listen(port, () => {
    const scheme = tls ? 'https' : 'http';
    const onNetwork = Object.values(networkInterfaces())
      .flat()
      .filter((address) => address && address.family === 'IPv4' && !address.internal)
      .map((address) => `${scheme}://${address!.address}:${port}`);
    console.log(`> Echo (${dev ? 'development' : process.env.NODE_ENV}) at ${scheme}://localhost:${port}`);
    if (onNetwork.length > 0) console.log(`> Phones on the same network: ${onNetwork.join('  ')}`);
  });
});
