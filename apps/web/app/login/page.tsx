import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ cli_callback?: string; cli_state?: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <Suspense fallback={null}>
        <SearchParamsBridge sp={searchParams} />
      </Suspense>
    </main>
  );
}

async function SearchParamsBridge({
  sp,
}: {
  sp: Promise<{ cli_callback?: string; cli_state?: string }>;
}) {
  const { cli_callback, cli_state } = await sp;
  return <LoginForm cliCallback={cli_callback} cliState={cli_state} />;
}
