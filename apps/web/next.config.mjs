import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev server and production builds get separate dist dirs so a
  // verification `next build` can't clobber the running dev server's
  // incremental chunks (caused repeated "Cannot find module './NNN.js'"
  // runtime errors when both shared .next). `next start` runs with
  // NODE_ENV=production, so build+start stay consistent on .next-dist.
  distDir: process.env.NODE_ENV === "development" ? ".next" : ".next-dist",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@ofp/shared"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};
export default nextConfig;
