<div align="center">
  <img src="./logo.png" alt="PRISM Logo" height="100"/>
</div>

# PRISM

**English** · [中文](README_cn.md) · [Demo](https://prism-demo.pages.dev)  · [Changelog](CHANGELOG.md)

**If you like this project, please give it a star ⭐️**

PRISM stands for **P**ortfolio & **R**esearch **I**nterface **S**ite **M**aker. It is a modern, configurable, and high-performance personal website template built with Next.js, Tailwind CSS, and TypeScript. It is designed for researchers, developers, and academics to showcase their work, publications, and portfolio with ease.

![PRISM Preview](screenshot.png)

## ✨ Features

*   **📄 Configuration-Driven**: Manage your entire site's content using simple `TOML`, `Markdown`, and `BibTeX` files in the `content/` directory. No code changes required for content updates!
*   **📚 BibTeX Support**: Directly render your publications from a `.bib` file. Includes search, filtering (Year, Type), and automatic citation generation.
*   **🎨 Modern Design**: Clean, responsive UI with a beautiful serif/sans-serif typography pairing, smooth animations (Framer Motion), and Dark Mode support.
*   **⚡️ High Performance**: Built on Next.js 20 with Turbopack. Static export ensures blazing fast load times and easy deployment.
*   **🔍 SEO Optimized**: Dynamic metadata generation for every page.
*   **🧩 Dynamic Routing**: Easily add new pages by simply creating a config file.

## 🚀 Getting Started

### Prerequisites

*   Node.js 22 or later
    *   **Important**: Please download and install Node.js manually from [https://nodejs.org/en/download](https://nodejs.org/en/download).
    *   Better not to use the pre-installed version on your system, as it may be outdated or incompatible.
*   npm, pnpm, or yarn

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/xyjoey/PRISM.git
    cd PRISM
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Run the development server:**

    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🛠️ Configuration

All content lives in the `content/` directory.

### 1. Global Site Config (`content/config.toml`)
Configure your site title, author details, social links, and navigation menu here.

```toml
[site]
title = "Your Name"
description = "Personal website of Your Name"
url = "https://your-website.com"

[author]
name = "Your Name"
title = "PhD Student / Researcher"
# ...

[features]
enable_likes = true
```

### 2. Homepage (`content/about.toml`)
Customize the "About" section, "News", and "Selected Publications" on the homepage.

### 3. Publications (`content/publications.bib`)
Export your publications from Google Scholar, Zotero, or Mendeley to `content/publications.bib`. PRISM automatically parses this file to generate your Publications page. Customize the display of publications by changing `selected`, `preview` and `description` keys in the bib file. 

### 4. Adding New Pages
To add a new page (e.g., "Projects"), create a TOML file in `content/` (e.g., `content/projects.toml`) and add it to the `navigation` list in `content/config.toml`.

Supported page types:
*   `text`: Renders Markdown content (Great for CVs, Bio).
*   `card`: Renders a list of cards (Great for Projects, Awards). Content of each card item supports Markdown.
*   `publication`: Renders the full publications list with filters.

### 5. I18N Support (`content_<locale>/`)
PRISM now supports i18n, i.e., multi-language.

*   Default language lives in `content/`.
*   Additional languages live in `content_<locale>/` (for example: `content_zh/`, `content_en/`).
*   Keep the same filenames across directories. Example:
    *   `content/cv.md` (default)
    *   `content_zh/cv.md`
*   If a localized file is missing, PRISM automatically falls back to the default `content/` version.

Configure language behavior in `content/config.toml`:

## 📦 Deployment

PRISM is optimized for static deployment.

```bash
npm run build
```

This generates a static `out/` directory that can be hosted anywhere.

👉 **[Read the full Deployment Guide](docs/deployment.md)** for the current **Cloudflare Pages** workflow.

## 🖼️ Photography Maintenance

This repository keeps raw photos and deployed website assets separate.

- Raw originals live in `PHOTO/` and are ignored by Git.
- Published website images live in `public/photography/`.
- Photography metadata lives in `content/photography.toml` and `content_zh/photography.toml`.

👉 **[Read the Photography Workflow Guide](docs/photography-workflow.md)** before adding new photographs to the site.

## ✍️ Updating Site Content

Most future updates do **not** require code changes. You usually only need to edit content files and push to `main`.

### Common update locations

- Homepage profile and navigation:
  - `content/config.toml`
  - `content_zh/config.toml`
- Biography:
  - `content/bio.md`
  - `content_zh/bio.md`
- Homepage sections:
  - `content/about.toml`
  - `content_zh/about.toml`
- Research:
  - `content/research.toml`
  - `content_zh/research.toml`
- Publications:
  - `content/publications.bib`
- CV:
  - `content/cv.md`
  - `content_zh/cv.md`
- News:
  - `content/news.toml`
  - `content_zh/news.toml`
- Questions:
  - `content/questions.toml`
  - `content_zh/questions.toml`
- Photography metadata:
  - `content/photography.toml`
  - `content_zh/photography.toml`

### Photography updates

- Put original files in `PHOTO/`
- Published website images belong in:
  - `public/photography/full/`
  - `public/photography/thumbs/`
- `PHOTO/` is ignored by Git, so adding files there will **not** show up in `git status`
- If you want a new photo on the site, tell Codex which file to publish and Codex can prepare the web assets and metadata entries

### Publish workflow

After editing content, run:

```bash
npm run build
git add .
git commit -m "Update site content"
git push
```

This repository is deployed through **Cloudflare Pages**. Pushing to `main` automatically triggers a new production deployment for `https://kkshao.org.cn`.

## 📂 Project Structure

```
PRISM/
├── content/              # All user-editable content (TOML, BibTeX, MD)
├── public/               # Static assets (images, papers)
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # React components
│   ├── lib/              # Utility functions (parsers, config loaders)
│   └── types/            # TypeScript definitions
├── next.config.ts        # Next.js configuration
└── tailwind.config.ts    # Tailwind CSS configuration
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
