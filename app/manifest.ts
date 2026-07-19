import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PowerTrain XR",
    short_name: "PowerTrain XR",
    description:
      "Mobile and WebXR industrial training for medium-voltage switching, synchronous motor controls, protection, and LOTO.",
    start_url: "/motor-floor-vr",
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
