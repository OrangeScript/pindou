import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: false,
  clientsClaim: false,
  cleanupOutdatedCaches: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: ({ url, request }: { url: URL; request: Request }) =>
        url.origin === self.location.origin && request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "lazarus-pages-v1",
        networkTimeoutSeconds: 4,
        expiration: {
          maxEntries: 12,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /\/_next\/static\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: "lazarus-static-v1",
        expiration: {
          maxEntries: 80,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: ({ url, request }: { url: URL; request: Request }) =>
        url.origin === self.location.origin && request.destination === "image",
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "lazarus-images-v1",
        expiration: {
          maxEntries: 40,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  compiler: {
    removeConsole: {
      exclude: ["error"],
    },
  },
};

export default withPWA(nextConfig);
