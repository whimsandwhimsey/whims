import type { Metadata } from 'next';
import { Inter, Baloo_2 } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const baloo = Baloo_2({
  subsets: ['latin'],
  variable: '--font-baloo',
  weight: ['600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Whims & Whimsey — Order Management',
  description: 'Order, payment, and deposit management for Whims & Whimsey bookstore.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${baloo.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
