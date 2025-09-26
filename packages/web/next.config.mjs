/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Proxy toutes les requêtes /api/* vers le backend NestJS
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
