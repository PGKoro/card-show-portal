import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { ConfirmDialogProvider } from "@/components/ConfirmDialogProvider";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { AuthProvider } from "@/lib/AuthContext";

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
  title: "Showfloor",
  description: "Marketplace platform for card shows and dealers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <ConfirmDialogProvider>
            <NavBar />
            {children}
            <Footer />
          </ConfirmDialogProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
