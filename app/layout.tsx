import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://synchronous-pump-trainer.nayteward.chatgpt.site"),
  title: {
    default: "Medium-Voltage Motor Training Simulator · Naythan Ward",
    template: "%s · Naythan Ward Training Concepts",
  },
  description:
    "Explore Naythan Ward's interactive concept for medium-voltage synchronous motor, excitation, protection, DCS, troubleshooting, and LOTO training.",
  applicationName: "MV Motor Training Simulator",
  authors: [{ name: "Naythan Ward" }],
  creator: "Naythan Ward",
  keywords: ["electrical training", "synchronous motor", "medium voltage", "motor protection", "WebXR", "digital twin", "lockout tagout"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "Medium-Voltage Motor Training Simulator",
    description: "An interactive electrical-training concept by Naythan Ward: operate, troubleshoot, and explore a representative synchronous motor system.",
    siteName: "Naythan Ward Training Concepts",
    images: [{
      url: "/electrical-room.png",
      width: 1680,
      height: 944,
      alt: "Illustrative legacy medium-voltage control cabinets",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Medium-Voltage Motor Training Simulator",
    description: "An interactive electrical-training concept by Naythan Ward.",
    images: ["/electrical-room.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MV Motor Trainer",
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/app-icon.svg",
    shortcut: "/app-icon.svg",
    apple: "/app-icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b100f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
