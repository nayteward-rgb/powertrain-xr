import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Synchronous Pump Trainer",
    short_name: "Pump Trainer",
    description:
      "Scenario-based troubleshooting practice for a two-speed synchronous pump motor controller.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b100f",
    theme_color: "#0b100f",
    orientation: "any",
    icons: [
      {
        src: "/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/app-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
