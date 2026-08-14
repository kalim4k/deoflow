import type { Metadata, Viewport } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { CreditsProvider } from '@/contexts/CreditsContext';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { NavProgressProvider } from '@/components/NavProgress';

// Une seule police chargée, deux graisses, sous-ensemble latin : la cible est
// sur navigateur mobile en 4G instable. Le corps de texte utilise la police
// système (0 octet) — voir --font-sans dans globals.css.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Deoflow — Créez vos images et vidéos IA, payez en mobile money',
    template: '%s · Deoflow',
  },
  description:
    'Les meilleurs modèles de génération d’images et de vidéos IA, dans une seule interface, payables en Mobile Money. Sans carte bancaire.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fafafa',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `data-scroll-behavior` : réclamé par Next.js dès que le CSS pose
  // scroll-behavior: smooth sur <html>, pour piloter le défilement lors des
  // transitions de route (nextjs.org/docs/messages/missing-data-scroll-behavior).
  return (
    <html lang="fr" data-scroll-behavior="smooth" className={spaceGrotesk.variable}>
      <body className="min-h-screen bg-canvas font-sans text-ink-900 antialiased">
        <ToastProvider>
          <AuthProvider>
            {/* Dans AuthProvider : le solde ne se charge qu'une fois la
                session connue, et se remet à zéro à la déconnexion. */}
            <CreditsProvider>
              {/* Même dépendance à la session : rien n'est sondé tant qu'on ne
                  sait pas qui regarde. */}
              <NotificationsProvider>
                <NavProgressProvider>{children}</NavProgressProvider>
              </NotificationsProvider>
            </CreditsProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
