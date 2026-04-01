# Deployment Guide

This project is intended to be deployed with **Cloudflare Pages**.

The repository is a Next.js static-export site:

- build command: `npm run build`
- output directory: `out`
- required Node.js version: `22`

GitHub should be used as the **source repository only**. Do not use GitHub Pages for production hosting of this project.

## Recommended production setup

- Source repository: GitHub
- Hosting: Cloudflare Pages
- Production branch: `main`
- Custom domain: `kkshao.org.cn`

## Why not GitHub Pages

This repository does **not** publish a ready-to-serve `index.html` from the repository root or `docs/`.
The production site is generated only after running:

```bash
npm run build
```

That build outputs the site into `out/`, which Cloudflare Pages can deploy directly through Git integration.

If GitHub Pages remains enabled with this repository, your custom domain may resolve to GitHub's default `404 File not found` page.

## One-time setup

### 1. Push the repository to GitHub

Use a normal Git workflow:

```bash
git add .
git commit -m "Update site"
git push
```

### 2. Create a Cloudflare Pages project

In the Cloudflare dashboard:

1. Go to **Workers & Pages**
2. Click **Create application**
3. Choose **Pages**
4. Choose **Connect to Git**
5. Select this repository

Use these build settings:

- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `out`
- Root directory: leave empty
- Environment variable: `NODE_VERSION=22`

### 3. Disable GitHub Pages

In the GitHub repository:

1. Go to **Settings -> Pages**
2. Remove any existing custom domain such as `kkshao.org.cn`
3. Disable GitHub Pages publishing, or set the source to `None`

This step is required if the domain has ever been attached to GitHub Pages before.

### 4. Attach the custom domain in Cloudflare Pages

In your Cloudflare Pages project:

1. Open **Custom domains**
2. Add `kkshao.org.cn`
3. Wait until the status becomes active

### 5. Remove old GitHub Pages DNS records

In Cloudflare DNS, delete any records that point to GitHub Pages, including:

- `A` records pointing to `185.199.108.153` through `185.199.111.153`
- `CNAME` records pointing to `*.github.io`

Do not recreate GitHub Pages DNS records after switching to Cloudflare Pages.

## Verification checklist

After the domain is attached and DNS is clean, verify:

- `https://kkshao.org.cn/`
- `https://kkshao.org.cn/research/`
- `https://kkshao.org.cn/publications/`
- `https://kkshao.org.cn/photography/`
- `https://kkshao.org.cn/cv/`

Also confirm:

- the latest deployment is shown in Cloudflare Pages
- HTTPS is active
- the root page is no longer serving GitHub's default 404

## Ongoing updates

After setup is complete, updates are automatic.

Your normal workflow is:

```bash
git add .
git commit -m "Update site"
git push
```

Cloudflare Pages will then:

1. pull `main`
2. run `npm run build`
3. publish the new version automatically

No manual upload of `out/` is needed.
