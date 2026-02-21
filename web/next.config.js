/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Server-side proxy rewrites.
   *
   * The browser always calls the same origin (port 3000).
   * Next.js Node server proxies internally over the Docker network to api:8000.
   *
   * Result:
   *   - Zero CORS issues on any network (Tailscale, Cloudflare, local)
   *   - Port 8000 never needs to be reachable from browsers
   *   - Tailscale IPs, firewall rules, CORS_ORIGINS are irrelevant
   *
   * Local dev override: set API_UPSTREAM=http://localhost:8000 in your shell.
   */
  async rewrites() {
    const upstream = process.env.API_UPSTREAM || "http://api:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${upstream}/:path*`,
      },
      {
        source: "/docs",
        destination: "http://docs:8001/",
      },
      {
        source: "/docs/:path*",
        destination: "http://docs:8001/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
