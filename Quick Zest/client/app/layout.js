import './globals.css';
import { ToastProvider } from '@/components/ui';

export const metadata = {
  title: 'Quick Zest Admin',
  description: 'Internal operations dashboard for Quick Zest premixes',
  robots: { index: false, follow: false },
};

export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#ea6206' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
