// Probe PATH for known code-agent CLIs. Mirrors daemon/agents.js but in TS.
import { execa } from 'execa';

const KNOWN = [
  { id: 'claude', name: 'Claude Code', bin: 'claude' },
  { id: 'codex', name: 'OpenAI Codex CLI', bin: 'codex' },
  { id: 'gemini', name: 'Gemini CLI', bin: 'gemini' },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode' },
  { id: 'cursor-agent', name: 'Cursor Agent', bin: 'cursor-agent' },
];

export interface DetectedRuntime {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  version?: string;
}

export async function detectRuntimes(): Promise<DetectedRuntime[]> {
  const out: DetectedRuntime[] = [];
  for (const r of KNOWN) {
    try {
      const { stdout } = await execa(r.bin, ['--version'], { timeout: 4000 });
      out.push({ ...r, available: true, version: stdout.trim().split('\n')[0]?.slice(0, 80) });
    } catch {
      out.push({ ...r, available: false });
    }
  }
  return out;
}
