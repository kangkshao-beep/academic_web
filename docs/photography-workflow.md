# Photography Workflow

This repository currently uses a **curated photography workflow**.

The photography page is a selected showcase, not an automatic archive. Raw files and website assets are intentionally separated.

## Directory roles

- `PHOTO/`
  - Local raw photo library
  - Not tracked by Git
  - Not deployed to the website
- `public/photography/full/`
  - Web-sized images used by the site
  - Tracked by Git
  - Deployed
- `public/photography/thumbs/`
  - Thumbnail images used by the site
  - Tracked by Git
  - Deployed
- `content/photography.toml`
  - English photography index and metadata
- `content_zh/photography.toml`
  - Chinese photography index and metadata

## Why new files in `PHOTO/` do not appear in `git status`

`PHOTO/` is intentionally ignored by Git in `.gitignore`.

This is expected behavior. Adding a new file to `PHOTO/` only updates the local raw library. It does not mean the image has been added to the website.

## Publishing a new photograph

The current publishing workflow is:

1. Put the original file in `PHOTO/`.
2. Decide which file should go on the website.
3. Generate:
   - one web-sized image in `public/photography/full/`
   - one thumbnail in `public/photography/thumbs/`
4. Add a matching item to:
   - `content/photography.toml`
   - `content_zh/photography.toml`
5. Verify the site locally with `npm run build` or `npm run dev`.
6. Commit and push the generated assets and metadata.

## Metadata expectations

Each published photograph should include confirmed metadata when available:

- title
- date
- location
- camera
- lens
- alt text
- short description

If the source file does not preserve complete EXIF data, do not guess missing values. Only add information that can be confirmed.

## Working agreement

The expected workflow between the user and Codex is:

1. The user places originals in `PHOTO/`.
2. The user tells Codex which files should be published.
3. Codex prepares deployable images and updates the photography index files.

This keeps the selected photography page lightweight while preserving a larger local raw library outside the deployed site.
