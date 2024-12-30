import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "What did you get done?",
  description: "Inspired by Elon Musk's 'What did you get done this week?' question, this app allows you to track your GitHub activity over the last 24 hours, week, month, or custom timeframe.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} bg-black`}>
      <body>{children}</body>
    </html>
  );
}
