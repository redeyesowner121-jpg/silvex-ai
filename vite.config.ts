// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const nodeBuild = !!process.env['NITRO_PRESET'];

export default defineConfig({
  // Outside Lovable (e.g. Railway/CI) honour NITRO_PRESET, otherwise keep defaults.
  ...(nodeBuild ? { nitro: { preset: process.env['NITRO_PRESET'] } } : {}),
  // Cloudflare-only mailer swapped for a nodemailer-backed shim on Node hosts.
  ...(nodeBuild
    ? {
        vite: {
          resolve: {
            alias: { "worker-mailer": "/src/lib/worker-mailer-node.ts" },
          },
        },
      }
    : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
