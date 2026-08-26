import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.dealcollab.org";
const SITE_NAME = "DealCollab AI";
const SITE_DESCRIPTION =
  "AI-powered deal-sourcing and matchmaking platform for India's private market — buy-side, sell-side, fundraising, debt, and strategic partnership mandates matched with counterparties using AI.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: "/earth-poster.png",
    apple: "/earth-poster.png",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [{ url: "/earth-poster.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/earth-poster.png"],
  },
};

import { NotificationProvider } from '@/components/NotificationProvider';
import { UserProvider } from '@/components/UserProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';

import { ExtensionNoiseReducer } from '@/components/ExtensionNoiseReducer';
import GoogleAnalytics from '@/components/GoogleAnalytics';

// Public, non-sensitive JSON-LD only — organization/site identity, nothing
// about deals, proposals, or any authenticated data.
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/earth-poster.png`,
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} min-h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-screen w-full m-0 p-0 bg-white" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <GoogleAnalytics />
        <ExtensionNoiseReducer />
        <AuthProvider>
          <NotificationProvider>
            <UserProvider>
              {children}
            </UserProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
