# Try the Look — Runway

Interactive 3D Runway lookbook and capsule storefront built with Vite, TypeScript, and custom elements.

## Local Development

```bash
npm install
npm run dev
```

Runs the local dev server at `http://localhost:3000`.

## Build & Checks

```bash
npm run lint
npm run build
npx tsx --test src/runway/runway.test.ts src/store/store.test.ts
```

## Deploy on Vercel

This repository is preconfigured for Vercel static hosting via `vercel.json` (framework: `vite`, build command: `npm run build`, output directory: `dist`).

- **Git integration**: Import the repository in the Vercel dashboard and deploy with the detected settings (`vercel.json` handles asset caching headers, clean URLs, and fallback rewrites).
- **Vercel CLI**:

```bash
npx vercel --prod
```

No runtime environment variables are required for hosting.
