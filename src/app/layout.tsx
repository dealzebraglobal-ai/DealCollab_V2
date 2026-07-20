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

export const metadata: Metadata = {
  title: "DealCollab AI",
  description: "AI-powered proposal analysis",
  icons: {
    icon: "/earth-poster.png",
    apple: "/earth-poster.png",
  },
};

import { NotificationProvider } from '@/components/NotificationProvider';
import { UserProvider } from '@/components/UserProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';

import { ExtensionNoiseReducer } from '@/components/ExtensionNoiseReducer';

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
