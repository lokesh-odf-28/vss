import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
import { ToastProvider } from '@/components/Toast';
import { ConfirmProvider } from '@/components/ConfirmDialog';

export const metadata: Metadata = {
  title: 'Video Intelligence',
  description: 'Use-case driven video analysis on NVIDIA VSS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <ConfirmProvider>
            <AppShell>{children}</AppShell>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
