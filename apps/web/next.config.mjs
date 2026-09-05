/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@barber/types', '@barber/validators', '@barber/business-rules'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.jsx': ['.tsx', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
