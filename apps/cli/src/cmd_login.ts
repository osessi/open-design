// Browser-callback OAuth-style flow (mirrors multica's resolveCallbackBinding).
// 1. Bind 127.0.0.1:<random> with a one-shot HTTP listener
// 2. Open ${appUrl}/login?cli_callback=<listener>&cli_state=<rand>
// 3. After user verifies, web app redirects to listener?token=<pat>&state=...
// 4. Verify state, persist PAT to ~/.od/profiles/<name>/config.json
import http from 'node:http';
import { AddressInfo } from 'node:net';
import open from 'open';
import { randomBytes } from 'node:crypto';
import { loadProfile, saveProfile } from './profile.js';

interface Args {
  profile: string;
  appUrl?: string;
}

export async function login({ profile, appUrl }: Args): Promise<void> {
  const p = await loadProfile(profile);
  if (appUrl) p.appUrl = appUrl;
  const state = randomBytes(16).toString('hex');

  const result = await new Promise<{ token: string; userId: string; email: string }>(
    (resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url ?? '/', `http://localhost`);
          if (url.pathname !== '/callback') {
            res.writeHead(404);
            res.end('not found');
            return;
          }
          const token = url.searchParams.get('token');
          const gotState = url.searchParams.get('state');
          const userId = url.searchParams.get('user_id');
          const email = url.searchParams.get('email');
          if (!token || gotState !== state || !userId || !email) {
            res.writeHead(400);
            res.end('Bad callback');
            reject(new Error('bad callback'));
            return;
          }
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(
            `<!doctype html><meta charset="utf-8"><title>od signed in</title><style>body{font:16px system-ui;padding:40px;background:#0b0b0d;color:#e7e7ea}</style><h1>You're signed in.</h1><p>You can close this window and return to your terminal.</p>`,
          );
          resolve({ token, userId, email });
        } catch (e) {
          reject(e as Error);
        } finally {
          setTimeout(() => server.close(), 100);
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port;
        const cb = `http://127.0.0.1:${port}/callback`;
        const dest = `${p.appUrl}/login?cli_callback=${encodeURIComponent(cb)}&cli_state=${state}`;
        // eslint-disable-next-line no-console
        console.log(`Opening ${dest}`);
        open(dest).catch(() => {
          // eslint-disable-next-line no-console
          console.log(`Open this URL manually:\n${dest}`);
        });
      });
      setTimeout(() => {
        server.close();
        reject(new Error('login timed out after 5 minutes'));
      }, 5 * 60_000);
    },
  );

  p.pat = result.token;
  p.userId = result.userId;
  p.email = result.email;
  await saveProfile(p);
  // eslint-disable-next-line no-console
  console.log(`Signed in as ${result.email}. PAT saved to profile "${p.name}".`);
}
