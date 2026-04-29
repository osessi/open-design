// Pluggable email sender. In dev, prints the code to stdout. In production,
// swap in Resend/SES by setting EMAIL_PROVIDER and the matching env vars.
export async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER ?? 'console';
  if (provider === 'console') {
    // eslint-disable-next-line no-console
    console.log(`\n[email→${opts.to}] ${opts.subject}\n${opts.text}\n`);
    return;
  }
  if (provider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY missing');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'Open Design <noreply@open-design.app>',
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });
    if (!r.ok) throw new Error(`resend failed: ${r.status} ${await r.text()}`);
    return;
  }
  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}
