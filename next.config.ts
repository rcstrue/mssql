import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
