# AGENTS.md

## Mission
Build and maintain a personal website for **Prof Shao** with two primary sections:

1. **Academic homepage**
   - About / bio
   - Research interests
   - Publications
   - Talks / presentations
   - CV
   - Contact
2. **Photography portfolio**
   - Gallery index
   - Project / album pages
   - Optimized image delivery
   - Future-friendly structure for many photos

This repository should prioritize:
- fast loading
- low maintenance burden
- clean visual design
- easy future expansion
- stable deployment with a custom domain

## Product constraints
- The site is primarily a **content-driven showcase site**, not a heavy web app.
- Prefer a **static-first architecture**.
- Separate **site code** from **image asset storage**.
- The recommended production architecture is:
  - **Domain:** `kkshao.org.cn`
  - **Frontend hosting:** static hosting platform or Hong Kong-hosted deployment
  - **Image storage:** object storage / CDN-backed asset storage
- Do **not** couple large photography assets to the web server filesystem unless explicitly asked.
- Optimize for later growth of the photography section.

## Preferred architecture
Unless the user explicitly requests a different stack, optimize around this default:

### Frontend
- Use **Next.js** with static generation where possible.
- Prefer the **App Router** if already present.
- Keep the site exportable or deployable on static-oriented hosting when feasible.
- Avoid unnecessary server-side complexity.

### Styling
- Clean, minimal, editorial aesthetic.
- Good typography, generous whitespace, restrained motion.
- Mobile-first and responsive.
- Accessibility is required.

### Content model
Organize content so that academic and photography content are easy to update independently.
Preferred structure example:

```text
/content
  /research
  /publications
  /talks
  /pages
  /photography
    /albums
    /images
```

Or, if the project uses a data-driven pattern:

```text
/data
  research.json
  publications.json
  talks.json
  photography.json
```

Choose whichever pattern best matches the existing repo, but keep it consistent.

## Image strategy
Photography will likely grow substantially. Therefore:

- Do **not** store original full-resolution images directly in the app bundle.
- Use separate storage for large media.
- Generate and use multiple sizes when appropriate:
  - thumbnail
  - grid / card image
  - detail page image
  - optional high-resolution original
- Prefer modern image formats when practical.
- Preserve filenames and metadata in a structured way.
- Avoid breaking URLs once image links are published.

Recommended asset conventions:

```text
/photography/{album-slug}/{image-slug}/thumb.webp
/photography/{album-slug}/{image-slug}/display.webp
/photography/{album-slug}/{image-slug}/full.jpg
```

Maintain a manifest for image metadata where helpful:
- title
- date
- location
- camera / lens (optional)
- width / height
- alt text
- tags
- storage URL(s)

## Deployment assumptions
Target deployment should remain compatible with the following direction:

- Custom domain: `kkshao.org.cn`
- Frontend on a static hosting platform or a lightweight server
- Image assets on object storage
- Domain DNS should be easy to point at frontend hosting and asset hosting separately if needed

When implementing deployment-related code:
- keep environment variables clearly documented
- never hardcode secrets
- provide `.env.example` if needed
- document required DNS records

## Working rules for Codex
When modifying the repository:

1. **Inspect existing structure first**
   - understand current framework, build system, and routing
   - do not rewrite the whole project unnecessarily

2. **Prefer minimal, high-leverage changes**
   - improve the current codebase rather than replacing it wholesale
   - preserve working features unless explicitly asked to redesign

3. **Explain architecture choices in code comments only when useful**
   - avoid noisy comments
   - keep code readable

4. **Keep file organization clean**
   - avoid dumping many unrelated utilities into one file
   - co-locate related components, styles, and data where sensible

5. **Respect design consistency**
   - reuse components
   - keep spacing, typography, and image presentation coherent

6. **Preserve performance**
   - lazy-load heavy media where appropriate
   - avoid massive client bundles
   - prefer static data loading when possible

7. **Do not invent content**
   - when biography, publication entries, talk details, or project text are missing, use clearly marked placeholders or TODOs
   - do not fabricate publication metadata, dates, venues, or awards

## Execution workflow
For non-trivial changes, follow this sequence:

1. Read the current repository structure.
2. Identify the minimal set of files to change.
3. State the intended plan briefly.
4. Implement.
5. Run relevant checks.
6. Summarize exactly what changed.

## Required checks
Run the relevant checks after modifications whenever the tooling exists:

- install dependencies only if needed
- run lint
- run typecheck
- run build

Prefer these commands when available:

```bash
npm run lint
npm run typecheck
npm run build
```

If the repository uses a different package manager or script set, detect and use the existing convention.

If a command fails:
- report the exact failure
- do not pretend the task is complete
- fix issues when feasible within scope

## UI guidance
### Academic section
The academic pages should feel:
- professional
- calm
- readable
- structured

Suggested sections:
- hero / introduction
- research overview
- selected publications
- talks / presentations
- CV / links
- contact

### Photography section
The photography pages should feel:
- visual-first
- uncluttered
- elegant
- immersive but still fast

Suggested patterns:
- masonry or disciplined grid for gallery index
- album/project pages
- detail view with keyboard-friendly navigation if implemented
- strong alt text support
- simple metadata presentation

## SEO and metadata
Implement sensible defaults where appropriate:
- page title templates
- description metadata
- Open Graph metadata
- social preview image fallback
- favicon/app icons if the repo supports them
- canonical URLs when appropriate

Do not over-engineer SEO.

## Accessibility
Minimum expectations:
- semantic HTML
- keyboard navigability
- alt text for images
- sufficient contrast
- visible focus states
- no motion that harms usability

## Git hygiene
- Make focused edits.
- Avoid unrelated refactors.
- Do not commit generated secrets.
- Do not delete user content without explicit instruction.
- Do not rename major content directories unless necessary.

## When creating new features
If asked to add a new feature, prefer this order of priority:
1. simple implementation
2. maintainable structure
3. visual polish
4. extensibility
5. extra abstraction only when justified

## When uncertainty exists
If repository conventions are unclear, infer from the existing codebase instead of introducing a brand-new style.
If content is missing, leave a clear placeholder.
If deployment target is ambiguous, keep the implementation hosting-agnostic unless the user specifies a platform.

## Deliverables expectation
When finishing a task, report:
- what files changed
- what behavior changed
- what checks were run
- any follow-up items still needed

## Nice-to-have future directions
These are valid future additions, but should not be forced unless requested:
- CMS-like content workflow
- searchable publications list
- photography tag filtering
- lightbox/detail navigation
- analytics
- image manifest generation scripts
- automatic image optimization pipeline

## Non-goals unless explicitly requested
- user accounts
- comment systems
- heavy database-backed features
- complex admin dashboards
- unnecessary backend APIs
- storing large original media directly in the web app repository
