import './globals.css';
import { PersistentVideoProvider } from '@/components/video/PersistentVideo';

export const metadata = {
  title: 'Magical Resort | A Sanctuary Beyond Imagination',
  description: 'Immerse yourself in tranquil coastal elegance, oceanfront dining, and world-class spa retreats at Magical Resort.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PersistentVideoProvider>
          <main>{children}</main>
        </PersistentVideoProvider>
      </body>
    </html>
  );
}
