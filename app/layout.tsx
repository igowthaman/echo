"use client";
import "./globals.css";
import AuthProvider from "./lib/auth";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>
          <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
