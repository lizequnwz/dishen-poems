# Cloudflare Pages Deployment Design

**Date:** 2026-07-21  
**Status:** Approved

## Goal

Publish the existing static Astro poetry site at a stable public address, with automatic deployments from its public GitHub repository and a straightforward path to a custom domain later.

## Chosen approach

Use the public GitHub repository `lizequnwz/dishen-poems` as the source of truth and connect it directly to Cloudflare Pages. Cloudflare will build the production site from the `main` branch and create preview deployments for eligible non-production branches.

This is preferred over manual uploads because every published version remains tied to source history. It is preferred over a custom GitHub Actions deployment because Cloudflare's native Git integration requires less project-specific infrastructure and exposes build and preview status directly.

## Deployment configuration

- Git provider: GitHub
- Repository: `lizequnwz/dishen-poems`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: repository root
- Required environment secrets: none
- Initial public address: the Cloudflare-provided `*.pages.dev` address
- Future address: an optional custom domain attached in Cloudflare without changing the Git workflow

## Publishing flow

1. A validated change is committed and pushed to `main`.
2. Cloudflare checks out the repository and installs dependencies from `package-lock.json`.
3. `npm run build` runs Astro checks, the Vitest suite, and the static Astro build.
4. Cloudflare publishes the generated `dist` directory only if the build succeeds.
5. The stable production address is updated to the successful deployment.

Branch and pull-request deployments may receive temporary preview addresses without replacing production.

## Failure behavior

A failed type check, test, dependency installation, or Astro build must stop publication. The previous successful production deployment remains available. Deployment logs in Cloudflare identify the failing stage; fixes are committed to GitHub and retried through the same workflow.

## Validation

Before the first push, run the complete local build and confirm the repository contains no credentials or generated deployment output. After deployment, verify the home page, archive, poem pages, about page, credits page, favicon, script switcher, and a nonexistent route over HTTPS. Confirm that a subsequent harmless change triggers a new deployment only when such a change is naturally available; no test-only public commit is required.

## Security and ownership

The repository and published site are intentionally public. No Cloudflare credential is committed to Git. GitHub authorization is granted through Cloudflare's GitHub application, scoped to this repository where the dashboard permits it. Domain ownership remains independent of the hosting deployment and can be moved later by changing DNS.
