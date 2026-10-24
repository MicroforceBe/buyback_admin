/** @type {import('next').NextConfig} */
// Same-origin actions; allow a 2 MiB file plus multipart metadata.
const nextConfig = { experimental: { serverActions: { bodySizeLimit: '3mb' } } };
module.exports = nextConfig;
