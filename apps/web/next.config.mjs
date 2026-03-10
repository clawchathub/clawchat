/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@clawchat/core'],
  output: 'export',
  basePath: '/clawchat',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;