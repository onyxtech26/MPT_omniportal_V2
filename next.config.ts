import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    unoptimized: true, // Next's image optimizer needs a server; a static export has none.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  // ⚠️ DO NOT REMOVE — this is not a leftover mobile flag. It is what makes
  // "the Director's sales data never leaves his machine" a structural fact
  // rather than a policy: with no server output, there is nowhere for
  // lib/salesData.ts / csvStore.ts / data-context.tsx to send the CSV to,
  // even by accident. (Mobile/Capacitor packaging that once justified this
  // comment was removed; the flag stayed for this reason instead. Repair-job
  // data lives in Supabase and is reached directly from the browser — see
  // docs/REPAIR_MODULE_SPEC.md §3 — so this app never needs its own server.)
  output: 'export',
  trailingSlash: true, // Static export routing: /dashboard/ maps to dashboard/index.html
  transpilePackages: ['motion'],
  webpack: (config, { dev }) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;