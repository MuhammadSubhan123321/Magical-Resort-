
import './globals.css';
import { PersistentVideoProvider } from '@/components/video/PersistentVideo';
import SmoothScroll from '@/components/common/SmoothScroll';

export const metadata = {
  title: 'Magical Resort | A Sanctuary Beyond Imagination',
  description: 'Immerse yourself in tranquil coastal elegance, oceanfront dining, and world-class spa retreats at Magical Resort.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('scrollRestoration' in history){history.scrollRestoration='manual';}window.scrollTo(0,0);`,
          }}
        />
      </head>
      <body>
        <PersistentVideoProvider>
          <SmoothScroll>
            <main>{children}</main>
          </SmoothScroll>
        </PersistentVideoProvider>
      </body>
    </html>
  );
}
