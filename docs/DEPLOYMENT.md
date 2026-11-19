# Deployment

OpenSong is static files. There is no server, database or secret to provision.

## GitHub Pages (workflow included, not yet exercised)

1. Fork or push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main`. `.github/workflows/deploy-pages.yml` runs the tests, builds with `VITE_BASE=/<repo>/` and publishes `dist/`.

The app uses hash routing (`/#/library`), so deep links work without server rewrites. A custom domain needs no code change; set `VITE_BASE` to `/` in the workflow if you serve from the domain root.

> The workflow's YAML has been syntax-checked but it has not been run on GitHub. If it fails, the logs will say where; the build commands in it are the same ones you can run locally.

## Netlify / Cloudflare Pages / any static host

```bash
npm ci && npm run build      # publish the dist/ folder
```

No special rewrites are needed. Serve over HTTPS (required for the service worker and for installing the app; `localhost` is exempt).

If your host can set headers you may add the same Content-Security-Policy as an HTTP header (see `CSP` in `vite.config.ts`); the built HTML already contains it as a `<meta>` tag.

## Before you publish a fork

- If you fork, replace `YutFi/OpenSong` in the README, `package.json` and the issue template config with your own repository.
- Do **not** commit a Jamendo client ID. If you want streaming to work for every visitor without them creating an ID, you would have to ship your ID in the public bundle; Jamendo's terms and your own risk tolerance decide whether that is acceptable. The default design asks each user to paste their own.
- Run `npm run licenses` and keep `docs/DEPENDENCY_LICENSES.md` current.
- Check each source's terms again for your use (non-commercial vs. commercial deployments differ).

## Updating

The service worker uses auto-update: visitors get the new version after they next open the app (and close old tabs). IndexedDB data is preserved; schema changes must be added as new Dexie versions with migrations, never by editing version 1.
