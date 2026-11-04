/** @type {import('next').NextConfig} */
const API_URL = (process.env.API_URL || 'http://localhost:5000').replace(/\/+$/, '');

// On Vercel the API address is required, otherwise the dashboard would call localhost.
if (process.env.VERCEL && !process.env.API_URL) {
  throw new Error('Set the API_URL environment variable in Vercel (e.g. https://QuickZest-api.onrender.com) and redeploy.');
}

const nextConfig = {
  // The browser talks to /api on the same domain; Next forwards it to the Express server.
  // This keeps the login cookie first-party and avoids CORS problems.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
