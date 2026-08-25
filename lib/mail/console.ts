import type { Mailer, Mail } from './types';

/**
 * Dev mailer — logs instead of sending, so the whole OTP flow (signup
 * verification, password reset) works with zero setup, same as the mock VSS
 * client and the in-memory store. Whoever is testing reads the code off the
 * server console instead of an inbox.
 */
export const consoleMailer: Mailer = {
  async send(mail: Mail) {
    console.log(
      `\n─── MAIL (console mailer — no SMTP configured) ───\n` +
      `To:      ${mail.to}\n` +
      `Subject: ${mail.subject}\n\n${mail.text}\n` +
      `────────────────────────────────────────────────\n`,
    );
  },
};
