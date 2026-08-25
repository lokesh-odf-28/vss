import { consoleMailer } from './console';
import { smtpMailer } from './smtp';
import type { Mailer } from './types';

/**
 * SMTP_HOST unset → console mailer (codes land in the server log)
 * SMTP_HOST set   → real SMTP send
 *
 * Nothing else in the app knows which is active.
 */
export const useRealMail = Boolean(process.env.SMTP_HOST);
export const mailer: Mailer = useRealMail ? smtpMailer : consoleMailer;

export * from './types';
