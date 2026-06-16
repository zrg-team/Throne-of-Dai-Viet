import packageJson from './package.json';
import { defineConfig } from 'vite';

const homepagePath = (() => {
  if (typeof packageJson.homepage !== 'string' || packageJson.homepage.length === 0) {
    return '/';
  }

  const { pathname } = new URL(packageJson.homepage);
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
})();

export default defineConfig(({ command }) => ({
  base: command === 'build' ? homepagePath : '/',
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
}));
