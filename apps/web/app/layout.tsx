import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Open Design',
  description: 'Cloud + local AI design product. Pair the cloud UI with a local `od` daemon.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
