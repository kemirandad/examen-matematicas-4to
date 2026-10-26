import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  distDir: '.next-release',
  images: { unoptimized: true },
};

export default nextConfig;
