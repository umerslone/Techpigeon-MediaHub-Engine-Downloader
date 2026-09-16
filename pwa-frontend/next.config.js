/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
    NEXT_PUBLIC_ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS || 'true'
  }
};

module.exports = nextConfig;

