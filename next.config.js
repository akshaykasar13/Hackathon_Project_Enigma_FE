/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://15.206.213.150:8000/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

