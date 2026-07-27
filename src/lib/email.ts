// Thin wrapper around the Resend REST API (no SDK dependency needed for a
// single "send this email" call). Used by scheduled automations to deliver
// reports. Requires RESEND_API_KEY; without a verified sending domain,
// Resend's shared address only delivers to the account's own verified email —
// set RESEND_FROM_EMAIL once a custom domain is verified in the Resend
// dashboard to send to arbitrary recipients.

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const from = process.env.RESEND_FROM_EMAIL || 'Invictus <onboarding@resend.dev>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: (data as { message?: string }).message || `Resend error (${res.status})` };
    }
    return { ok: true, id: (data as { id?: string }).id };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
