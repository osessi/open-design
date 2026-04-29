import { login } from './cmd_login.js';
import { daemon } from './cmd_daemon.js';

const HELP = `od — Open Design CLI

Usage:
  od login [--profile <name>] [--app-url <url>]   Pair this machine with a cloud account
  od daemon [--profile <name>]                    Run the daemon (claim & run tasks)
  od setup                                        login + daemon

Env:
  OD_APP_URL   default app URL for new profiles (e.g. https://open-design.app)`;

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseFlags(argv.slice(1));
  const profile = (args.profile as string | undefined) ?? 'default';

  switch (cmd) {
    case 'login':
      await login({ profile, appUrl: args['app-url'] as string | undefined });
      return;
    case 'daemon':
      await daemon({ profile });
      return;
    case 'setup':
      await login({ profile, appUrl: args['app-url'] as string | undefined });
      await daemon({ profile });
      return;
    case undefined:
    case '-h':
    case '--help':
      // eslint-disable-next-line no-console
      console.log(HELP);
      return;
    default:
      // eslint-disable-next-line no-console
      console.error(`Unknown command: ${cmd}\n\n${HELP}`);
      process.exit(2);
  }
}

function parseFlags(tokens: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const next = tokens[i + 1];
      if (next && !next.startsWith('--')) {
        out[k] = next;
        i++;
      } else {
        out[k] = true;
      }
    }
  }
  return out;
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
