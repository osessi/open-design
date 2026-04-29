import Link from 'next/link';
import { getSessionFromCookies } from '@/lib/auth/session';

export default async function HomePage() {
  const session = await getSessionFromCookies();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-10 px-6 py-20">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Open Design</h1>
        <p className="mt-3 text-[var(--muted)]">
          Run AI-generated design previews on your own machine, drive it from a cloud UI.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wider text-[var(--muted)]">Get started</h2>
        {session ? (
          <div className="flex flex-col gap-3">
            <Link className="rounded bg-[var(--accent)] px-4 py-2 text-center font-medium" href="/projects">
              Go to projects
            </Link>
            <Link className="text-sm text-[var(--muted)] underline" href="/settings/daemon">
              Pair a local daemon
            </Link>
          </div>
        ) : (
          <Link className="rounded bg-[var(--accent)] px-4 py-2 text-center font-medium" href="/login">
            Sign in
          </Link>
        )}
      </section>

      <section className="space-y-3 text-sm text-[var(--muted)]">
        <h2 className="text-sm uppercase tracking-wider">CLI</h2>
        <pre className="overflow-x-auto rounded border border-white/10 bg-black/40 p-4">
{`# install
npm i -g @open-design/cli

# pair this machine to your account
od login

# run the daemon (claims tasks queued in the cloud)
od daemon`}
        </pre>
      </section>
    </main>
  );
}
