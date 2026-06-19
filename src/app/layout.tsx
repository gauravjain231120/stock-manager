import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ConfirmProvider } from "@/components/ConfirmProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stock Manager",
  description: "Multichannel inventory management for Amazon, Flipkart and Myntra",
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
      <body className="min-h-full bg-neutral-50 dark:bg-black">
        <ConfirmProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 overflow-x-hidden">{children}</div>
          </div>
        </ConfirmProvider>
      </body>
    </html>
  );
}
