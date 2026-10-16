import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both pages are fully client-side WebGL, so we ship plain static files (to `out/`),
  // served by Cloudflare Workers static assets — see wrangler.jsonc.
  output: "export",
  // cacheComponents / partialPrefetching (create-next-app defaults) enable PPR,
  // which static export does not support — and nothing here needs a server.
};

export default nextConfig;
