import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "notava",
    short_name: "notava",
    description:
      "فضای خصوصی notava برای یادداشت‌ها، مجموعه‌ها، زیرمجموعه‌ها و صفحه‌ها.",
    start_url: "/workspace",
    display: "standalone",
    background_color: "#f7f7ff",
    theme_color: "#b5baff",
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
