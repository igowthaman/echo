import express from 'express';
import { ExpressPeerServer } from 'peer';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const appExpress = express();
  const handleNextUpgrade = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // PeerJS's WebSocket server answers every upgrade that isn't its own path
  // with a 400, which would break Next's dev reload socket. So it gets a
  // private server that never listens and only receives /peerjs upgrades.
  const peerSocketServer = createServer();
  const peerServer = ExpressPeerServer(peerSocketServer, {
    path: '/api',
  });

  appExpress.use('/peerjs', peerServer);

  server.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/peerjs')) {
      peerSocketServer.emit('upgrade', req, socket, head);
    } else {
      handleNextUpgrade(req, socket, head);
    }
  });

  server.listen(port);

  console.log(
    `> Server listening at http://localhost:${port} as ${
      dev ? 'development' : process.env.NODE_ENV
    }`
  );
});