import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,

  allowedDevOrigins: [
    "192.168.1.37",
    "wizard-exposure-cumulative-concept.trycloudflare.com",
  ],

  devIndicators: {
    position: "top-right",
  },
};

export default nextConfig;