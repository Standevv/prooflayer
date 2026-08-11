import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    // The dashboard imports canonical demo certificates from the repository root.
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
