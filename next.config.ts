import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Keep Turbopack rooted at this app (avoids picking up a parent lockfile).
  turbopack: {
    root: rootDir,
  },
  // Allow Playwright (127.0.0.1) to load Next.js dev assets during e2e.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
