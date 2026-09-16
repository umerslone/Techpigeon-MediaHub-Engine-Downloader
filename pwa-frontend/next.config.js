/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker/Standalone deployment
  output: 'standalone',
  
  // React strict mode for development
  reactStrictMode: true,
  
  // Performance: Optimize for production
  productionBrowserSourceMaps: false,
  
  // Code splitting & compression
  compress: true,
  poweredByHeader: false,
  
  // Allow local network testing during development
  allowedDevOrigins: ['192.168.10.9', '192.168.137.1'],

  // Explicit Turbopack config to avoid webpack/turbopack conflict
  turbopack: {},
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    minimumCacheTTL: 3600,
  },
  
  // Headers for security & performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, must-revalidate'
          }
        ]
      }
    ];
  },
  
  // Redirects for versioning
  async redirects() {
    return [
      {
        source: '/download-guide',
        destination: '/#ios-guide',
        permanent: false
      }
    ];
  },

  // Rewrites for API proxying (optional)
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`
        }
      ]
    };
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_APP_VERSION: '2.0.0',
    NEXT_PUBLIC_ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS || 'true'
  }
};

module.exports = nextConfig;

