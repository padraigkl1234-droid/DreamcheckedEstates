import nodemailer, { type Transporter } from 'nodemailer';

// Sends mail via Gmail SMTP using an account you control — no domain
// verification needed, unlike Resend/SendGrid's default sandbox mode, so it
// can deliver to any recipient immediately. Requires GMAIL_USER (the sending
// Gmail address) and GMAIL_APP_PASSWORD (a 16-character App Password from
// myaccount.google.com/apppasswords — only available once 2-Step
// Verification is on; your normal Google password won't work here).

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

// A fresh transporter per send (not cached) — this is a low-volume weekly
// job, not a hot path, so there's no reason to risk a stale instance ever
// holding onto credentials from before an env var change.
function getTransporter(user: string, pass: string): Transporter {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { ok: false, error: 'GMAIL_USER / GMAIL_APP_PASSWORD not configured' };

  try {
    const info = await getTransporter(user, pass).sendMail({
      from: `Invictus <${user}>`,
      to,
      subject,
      html,
    });
    return { ok: true, id: info.messageId };
  } catch (error) {
    // Include exactly what this deployment is using (never the password
    // itself) so a stale-env-var vs. wrong-password mismatch is visible
    // straight from the master console, without a Vercel dashboard trip.
    const diag = `[GMAIL_USER=${user}, app password length=${pass.length}, has whitespace=${/\s/.test(pass)}]`;
    return { ok: false, error: `${(error as Error).message} ${diag}` };
  }
}
