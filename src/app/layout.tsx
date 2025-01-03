import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "What did you get done?",
  description: "Inspired by Elon Musk's 'What did you get done this week?' question, this app allows you to track your GitHub activity over the last 24 hours, week, month, or custom timeframe.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    title: `What did you get done?`,
    description: "Inspired by Elon Musk's 'What did you get done this week?' question, this app allows you to track your GitHub activity over the last 24 hours, week, month, or custom timeframe.",
    images: [
      {
        url: "https://opengraph.b-cdn.net/production/images/901d5563-70f4-49e1-b812-acf6cb93409d.png?token=H9tEmQZxE-tAtcsc53CRTpRLqlNnnLA2Jornx42YD5s&height=776&width=1200&expires=33271878873",
        width: 1200,
        height: 630,
        alt: "What did you get done?",
      },
    ],
  },
  twitter: {
    card: 'summary_large_image', 
    title: `What did you get done?`,
    description: `Inspired by Elon Musk's 'What did you get done this week?' question, this app allows you to track your GitHub activity over the last 24 hours, week, month, or custom timeframe.`,
    images: ["https://opengraph.b-cdn.net/production/images/901d5563-70f4-49e1-b812-acf6cb93409d.png?token=H9tEmQZxE-tAtcsc53CRTpRLqlNnnLA2Jornx42YD5s&height=776&width=1200&expires=33271878873"],
  },
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
