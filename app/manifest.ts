import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "notava",
    short_name: "notava",
    description: "Offline-ready private notebook for personal notes and study pages.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f6",
    theme_color: "#e8edf5",
    icons: [
      {
        src: "/brand/notava-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/notava-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
