// Per-profile config under ~/.od/profiles/<name>/config.json. Mirrors multica's
// ~/.multica/profiles/<name>/config.json layout so users can run multiple
// daemons against staging vs prod from one machine.
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Profile {
  name: string;
  appUrl: string;
  userId?: string;
  email?: string;
  pat?: string;
  daemonToken?: string;
  workspaceId?: string;
  daemonId?: string;
}

const ROOT = join(homedir(), '.od', 'profiles');

export function profileDir(name: string): string {
  return join(ROOT, name);
}

export function configPath(name: string): string {
  return join(profileDir(name), 'config.json');
}

export async function loadProfile(name: string): Promise<Profile> {
  try {
    const raw = await fs.readFile(configPath(name), 'utf8');
    return JSON.parse(raw) as Profile;
  } catch {
    return { name, appUrl: process.env.OD_APP_URL ?? 'http://localhost:3000' };
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  await fs.mkdir(profileDir(p.name), { recursive: true, mode: 0o700 });
  await fs.writeFile(configPath(p.name), JSON.stringify(p, null, 2), { mode: 0o600 });
}
