/** @type {import('next').NextConfig} */
const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
// Backend routes: /memory/episodic, /ticket, etc. (no /api prefix)
const apiPathPrefix = process.env.NEXT_PUBLIC_API_PATH_PREFIX || '';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}${apiPathPrefix}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

