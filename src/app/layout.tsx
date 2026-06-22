import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { ThemeManager } from "@/components/ThemeManager";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rangrooh · Stock Manager",
  description: "Simple stock tracking for Rangrooh",
};

// Applies the saved (or system) theme before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased bg-neutral-50 dark:bg-black`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeManager />
        <ToastProvider>
          <ConfirmProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 overflow-x-hidden">{children}</div>
            </div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
