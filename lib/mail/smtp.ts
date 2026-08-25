import nodemailer from 'nodemailer';
import type { Mailer, Mail } from './types';

/**
 * Real mailer. Server-side only — never import into a 'use client' file.
 *
 * Generic SMTP transport (not tied to one provider) so it works with Gmail
 * SMTP, Office 365, Amazon SES's SMTP interface, or any other provider's
 * standard SMTP endpoint — whatever SMTP_HOST points at.
 */
let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587/STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

export const smtpMailer: Mailer = {
  async send(mail: Mail) {
    try {
      const info = await getTransport().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });
      // The SMTP server accepting the message is not proof of an inbox
      // landing — this confirms the handoff succeeded, spam filtering
      // happens after. messageId is what to search server-side logs for if
      // a provider's dashboard shows the send but the recipient never saw it.
      console.log(`[mail] sent to ${mail.to} — messageId=${info.messageId}`);
    } catch (err) {
      // Surface clearly rather than an unhandled rejection buried in a
      // generic 500 — this is what actually distinguishes "SMTP rejected
      // it" (config/auth problem, fix now) from "sent, check spam" (not a
      // code problem at all).
      console.error(`[mail] FAILED to send to ${mail.to}:`, err);
      throw err;
    }
  },
};
