import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { ThemeManager } from "@/components/ThemeManager";
import { getCurrentSession } from "@/lib/auth";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Middleware already gated access before this ever renders (redirects to
  // /login otherwise) — this is just reading who's logged in to filter the
  // sidebar to their role/sections, not re-deciding access itself.
  const session = await getCurrentSession();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased bg-neutral-50 dark:bg-black`}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeManager />
        <ToastProvider>
          <ConfirmProvider>
            <div className="flex min-h-screen flex-col md:flex-row">
              <Sidebar
                currentUser={
                  session ? { username: session.username, role: session.role, allowedSections: session.allowedSections } : null
                }
              />
              <div className="min-w-0 flex-1 overflow-x-hidden">{children}</div>
            </div>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
