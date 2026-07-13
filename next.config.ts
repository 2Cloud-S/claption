import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/process": [
      "./node_modules/ffmpeg-static/**",
      "./node_modules/ffprobe-static/**"
    ]
  }
};

export default nextConfig;
