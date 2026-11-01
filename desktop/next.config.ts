import type { NextConfig } from 'next';

// The Manager's offline desktop app: the Meeting Agenda on its own, with no
// login, no repairs and no network. Built from the repo root with
// `npm run desktop:web` (which runs `next build desktop`), so it shares the
// root node_modules and imports the agenda straight from ../app and ../lib —
// one copy of the agenda logic serves both the website and this app.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  // A static export, loaded by Electron from disk (see electron/main.mjs).
  output: 'export',
  trailingSlash: true,
  transpilePackages: ['motion'],
  // Lets this app compile the shared files outside desktop/.
  experimental: { externalDir: true },
};

export default nextConfig;
