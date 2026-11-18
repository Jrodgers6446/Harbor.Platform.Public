import type { Metadata } from 'next';
import './globals.css';
import './shell.css';

export const metadata: Metadata = { title: 'Harbor', description: 'Harbor by SageWorkx: route planning, daily forms, pre-call texts and tablets for remote repair teams.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
