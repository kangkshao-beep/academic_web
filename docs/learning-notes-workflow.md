# Theory Notes Workflow

The Foundations of Theoretical Physics section only publishes PDF notes that are confirmed for public release. Course handouts, reference material, and unconfirmed files are never uploaded automatically.

## File location

Place each published PDF in its course directory:

```text
public/notes/<course-id>/<YYYY.MMDD>.pdf
```

For example:

```text
public/notes/quantum-field-theory/2026.0809.pdf
```

Current course IDs:

- `quantum-field-theory`
- `gauge-field-theory`
- `particle-physics`
- `group-theory-lie-groups-and-algebras`
- `field-theory-frontiers`

## Content record

Find the matching course in `content/learning.toml` and `content_zh/learning.toml`, then update the current version and PDF path:

```toml
[[courses]]
id = "quantum-field-theory"
title = "Quantum Field Theory"
version = "2026.0809"
pdf = "/notes/quantum-field-theory/2026.0809.pdf"

[[courses.updates]]
date = "2026-08-09"
content = "Write a concise note about this update here."
```

Use `YYYY.MMDD` for `version`. Whenever a new PDF is published, replace the course's current `version` and `pdf`, then add a `courses.updates` entry. The page automatically shows the timeline with the newest date first.

Keep course IDs, versions, and PDF paths identical in the English and Chinese TOML files. Translate only course titles and update notes.

## Publishing

After confirming the PDF and update note, run the production build and push `main`. Cloudflare Pages will publish the new version automatically.
