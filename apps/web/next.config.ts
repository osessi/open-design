import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  serverExternalPackages: ['better-sqlite3', 'postgres'],
  // Skills + design-systems are repo-bundled and read at request time. They
  // live one level up from apps/web; expose their root via env so route
  // handlers can resolve them.
  env: {
    SKILLS_ROOT: process.env.SKILLS_ROOT ?? '../../skills',
    DESIGN_SYSTEMS_ROOT: process.env.DESIGN_SYSTEMS_ROOT ?? '../../design-systems',
  },
};

export default config;
