import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "offlineCache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
  ],
});

const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',      // 开启静态导出，这样 build 完才会生成类似 dist 的 out 文件夹
  images: {
    unoptimized: true,   // 静态导出必须关闭 Next.js 的默认图片优化功能
  },
};

export default withPWA(nextConfig);
