import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parse } from 'smol-toml';

const require = createRequire(import.meta.url);
const bibtexParse = require('bibtex-parse-js');
const ROOT = process.cwd();
const CONTENT_ROOT = path.join(ROOT, 'content');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const OUTPUT = path.join(PUBLIC_ROOT, 'search-index.json');

const documents = [];
const pdfCourses = new Map();

function normalizeLocale(locale) {
  return locale.trim().replace('_', '-').toLowerCase();
}

function readLocalizedFile(filename, locale) {
  const candidates = locale
    ? [path.join(ROOT, `content_${normalizeLocale(locale)}`, filename), path.join(CONTENT_ROOT, filename)]
    : [path.join(CONTENT_ROOT, filename)];

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      return {
        content: require('node:fs').readFileSync(filePath, 'utf8'),
        filePath,
      };
    }
  }

  return { content: '', filePath: null };
}

function readToml(filename, locale) {
  const { content } = readLocalizedFile(filename, locale);
  if (!content) return null;

  try {
    return parse(content);
  } catch (error) {
    console.warn(`[search-index] Could not parse ${filename} (${locale}): ${error.message}`);
    return null;
  }
}

function cleanText(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*#>]/g, ' ')
    .replace(/\\\((.*?)\\\)/g, '$1')
    .replace(/\\\[(.*?)\\\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function routeFor(href) {
  if (href === '/') return '/';
  return href.endsWith('/') ? href : `${href}/`;
}

function headingSlug(value) {
  const normalized = cleanText(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return normalized || 'section';
}

function addDocument(document) {
  const body = cleanText(document.body);
  const title = cleanText(document.title);
  if (!title && !body) return;

  documents.push({
    id: document.id,
    canonicalId: document.canonicalId || document.id,
    locale: document.locale,
    kind: document.kind || 'page',
    title: title || document.section || 'Untitled',
    section: cleanText(document.section),
    source: cleanText(document.source),
    href: document.href,
    body,
    ...(document.page ? { page: document.page } : {}),
    ...(document.version ? { version: document.version } : {}),
  });
}

function addMarkdownDocuments({ locale, canonicalPrefix, title, source, href, headingPrefix, section }) {
  const lines = source.split(/\r?\n/);
  const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
  let current = null;
  const parts = [];

  for (const line of lines) {
    const match = line.match(headingPattern);
    if (match) {
      if (current) parts.push(current);
      const heading = cleanText(match[2]);
      const base = headingSlug(heading);
      current = {
        heading,
        id: `${headingPrefix}-${base}`,
        lines: [],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      parts.push({ heading: '', id: '', lines: [line] });
    }
  }

  if (current) parts.push(current);
  if (parts.length === 0) {
    addDocument({
      id: canonicalPrefix,
      canonicalId: canonicalPrefix,
      locale,
      title,
      section,
      href,
      body: source,
    });
    return;
  }

  parts.forEach((part, index) => {
    const partBody = part.lines.join('\n');
    if (!cleanText(partBody) && !part.heading) return;
    addDocument({
      id: `${canonicalPrefix}:${part.id || index}:${locale}`,
      canonicalId: `${canonicalPrefix}:${part.id || index}`,
      locale,
      title: part.heading || title,
      section: part.heading ? section || title : section,
      href: part.id ? `${href}#${part.id}` : href,
      body: partBody || part.heading,
    });
  });
}

function cleanBibtexString(value) {
  return cleanText(value)
    .replace(/[{}]/g, '')
    .replace(/\\(?:textbf|emph)\{([^}]*)\}/g, '$1')
    .replace(/~/g, ' ')
    .trim();
}

function collectAbout(config, locale) {
  const localizedConfig = readToml('config.toml', locale) || config;
  const about = readToml('about.toml', locale);
  if (!about) return;

  const author = localizedConfig.author || {};
  const social = localizedConfig.social || {};
  const researchInterests = about.profile?.research_interests || [];
  addDocument({
    id: `profile:${locale}`,
    canonicalId: 'profile',
    locale,
    title: author.name || localizedConfig.site?.title || 'Profile',
    section: about.title || 'About',
    href: '/#profile',
    body: [
      author.title,
      author.institution,
      ...(author.advisors || []).flatMap((advisor) => [advisor.name, advisor.institution]),
      social.location,
      ...(social.location_details || []),
      ...researchInterests,
    ].filter(Boolean).join(' '),
  });

  for (const section of about.sections || []) {
    if (section.type === 'markdown' && section.source) {
      const { content } = readLocalizedFile(section.source, locale);
      addMarkdownDocuments({
        locale,
        canonicalPrefix: `about:${section.id || section.source}`,
        title: section.title || about.title || 'About',
        source: content,
        href: '/#about',
        headingPrefix: 'about',
        section: section.title || about.title,
      });
    }

    if (section.type === 'list' && section.source) {
      const news = readToml(section.source, locale)?.news || [];
      news.forEach((item, index) => {
        const itemId = item.id || `${item.date || 'undated'}-${index + 1}`;
        addDocument({
          id: `news:${itemId}:${locale}`,
          canonicalId: `news:${itemId}`,
          locale,
          title: section.title || 'News',
          section: item.date || '',
          href: `/#news-${itemId}`,
          body: item.content,
        });
      });
    }
  }
}

function collectCardPage(target, route, pageConfig, locale) {
  addDocument({
    id: `${target}:overview:${locale}`,
    canonicalId: `${target}:overview`,
    locale,
    title: pageConfig.title,
    section: pageConfig.title,
    href: route,
    body: pageConfig.description,
  });

  (pageConfig.items || []).forEach((item, index) => {
    const itemId = item.id || `item-${index + 1}`;
    addDocument({
      id: `${target}:${itemId}:${locale}`,
      canonicalId: `${target}:${itemId}`,
      locale,
      title: item.title,
      section: pageConfig.title,
      href: `${route}#${target}-${itemId}`,
      body: [item.subtitle, item.date, item.content, ...(item.tags || [])].filter(Boolean).join(' '),
    });
  });
}

function collectLearning(route, pageConfig, locale) {
  addDocument({
    id: `learning:overview:${locale}`,
    canonicalId: 'learning:overview',
    locale,
    title: pageConfig.title,
    section: pageConfig.title,
    href: route,
    body: pageConfig.description,
  });

  (pageConfig.courses || []).forEach((course) => {
    const updateText = (course.updates || [])
      .map((update) => `${update.date || ''} ${update.content || ''}`)
      .join(' ');
    addDocument({
      id: `learning:${course.id}:${locale}`,
      canonicalId: `learning:${course.id}`,
      locale,
      title: course.title,
      section: pageConfig.title,
      href: `${route}#course-${course.id}`,
      version: course.version,
      body: [course.version, updateText].filter(Boolean).join(' '),
    });

    if (course.pdf) {
      const key = course.pdf.replace(/^\//, '');
      const entries = pdfCourses.get(key) || [];
      entries.push({ title: course.title, version: course.version, locale });
      pdfCourses.set(key, entries);
    }
  });
}

function collectQuestions(route, pageConfig, locale) {
  if (pageConfig.quote) {
    addDocument({
      id: `questions:quote:${locale}`,
      canonicalId: 'questions:quote',
      locale,
      title: pageConfig.title,
      section: pageConfig.quote.source || '',
      href: route,
      body: [pageConfig.quote.text, pageConfig.quote.german, pageConfig.quote.source].filter(Boolean).join(' '),
    });
  }

  (pageConfig.items || []).forEach((item) => {
    addDocument({
      id: `question:${item.id}:${locale}`,
      canonicalId: `question:${item.id}`,
      locale,
      title: item.question,
      section: pageConfig.title,
      href: `${route}#question-${item.id}`,
      body: [item.date, item.context, item.answer, item.answerDate, ...(item.tags || [])].filter(Boolean).join(' '),
    });
  });
}

function collectPublications(route, pageConfig, locale) {
  const { content } = readLocalizedFile(pageConfig.source, locale);
  if (!content) return;

  let entries = [];
  try {
    entries = bibtexParse.toJSON(content);
  } catch (error) {
    console.warn(`[search-index] Could not parse ${pageConfig.source}: ${error.message}`);
    return;
  }

  entries.forEach((entry, index) => {
    const tags = entry.entryTags || {};
    const id = entry.citationKey || tags.id || `publication-${index + 1}`;
    const title = cleanBibtexString(tags.title) || pageConfig.title;
    const visibleFields = [
      tags.author,
      tags.journal,
      tags.booktitle,
      tags.year,
      tags.keywords,
      tags.description,
      tags.note,
      tags.abstract,
    ].map(cleanBibtexString).filter(Boolean);

    addDocument({
      id: `publication:${id}:${locale}`,
      canonicalId: `publication:${id}`,
      locale,
      title,
      section: pageConfig.title,
      href: `${route}#publication-${id}`,
      body: visibleFields.join(' '),
    });
  });
}

function collectGallery(route, pageConfig, locale) {
  addDocument({
    id: `photography:overview:${locale}`,
    canonicalId: 'photography:overview',
    locale,
    title: pageConfig.title,
    section: pageConfig.title,
    href: route,
    body: pageConfig.description,
  });

  (pageConfig.items || []).forEach((item) => {
    addDocument({
      id: `photo:${item.id}:${locale}`,
      canonicalId: `photo:${item.id}`,
      locale,
      title: item.title,
      section: pageConfig.title,
      href: `${route}#photo-${item.id}`,
      body: [item.date, item.location, item.camera, item.lens, item.alt, item.description].filter(Boolean).join(' '),
    });
  });
}

function collectTextPage(route, pageConfig, locale) {
  const { content } = readLocalizedFile(pageConfig.source, locale);
  const headingPrefix = path.basename(pageConfig.source, path.extname(pageConfig.source));
  addMarkdownDocuments({
    locale,
    canonicalPrefix: headingPrefix,
    title: pageConfig.title,
    source: content,
    href: route,
    headingPrefix,
    section: pageConfig.title,
  });
}

async function listPdfFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listPdfFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function resolveOutline(pdf, outline) {
  const chapters = [];

  async function visit(items, level = 0) {
    for (const item of items || []) {
      let destination = item.dest;
      try {
        if (typeof destination === 'string') {
          destination = await pdf.getDestination(destination);
        }
        if (Array.isArray(destination) && destination[0]) {
          const pageIndex = await pdf.getPageIndex(destination[0]);
          chapters.push({ page: pageIndex + 1, title: cleanText(item.title), level });
        }
      } catch {
        // Some external or malformed outline targets cannot be resolved locally.
      }
      await visit(item.items, level + 1);
    }
  }

  await visit(outline);
  return chapters.sort((left, right) => left.page - right.page);
}

async function collectPdfDocuments() {
  if (!existsSync(PUBLIC_ROOT)) return;
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfFiles = await listPdfFiles(PUBLIC_ROOT);

  for (const filePath of pdfFiles) {
    const relativePath = path.relative(PUBLIC_ROOT, filePath).split(path.sep).join('/');
    const publicPath = `/${relativePath}`;
    let loadingTask;

    try {
      const bytes = new Uint8Array(await readFile(filePath));
      loadingTask = getDocument({ data: bytes, disableWorker: true, useSystemFonts: true });
      const pdf = await loadingTask.promise;
      const metadata = await pdf.getMetadata().catch(() => null);
      const outline = await pdf.getOutline().catch(() => []);
      const chapters = await resolveOutline(pdf, outline);
      const sectionChapters = chapters.some((chapter) => chapter.level > 0)
        ? chapters.filter((chapter) => chapter.level > 0)
        : chapters;
      const courseEntries = pdfCourses.get(relativePath) || [];
      const course = courseEntries.find((entry) => entry.locale === 'en') || courseEntries[0];
      const metadataTitle = cleanText(metadata?.info?.Title);
      const fallbackTitle = course?.title || path.basename(relativePath, path.extname(relativePath));
      const title = metadataTitle || fallbackTitle;
      const version = course?.version || path.basename(relativePath, path.extname(relativePath));
      let extractedPages = 0;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const text = cleanText(textContent.items
          .map((item) => `${item.str || ''}${item.hasEOL ? '\n' : ''}`)
          .join(''));
        if (!text) continue;

        extractedPages += 1;
        const chaptersOnPage = sectionChapters.filter((chapter) => chapter.page === pageNumber);
        const sectionDocuments = chaptersOnPage.length > 0
          ? chaptersOnPage.map((chapter, chapterIndex) => {
            const start = text.indexOf(chapter.title);
            const nextChapter = chaptersOnPage[chapterIndex + 1];
            const end = nextChapter ? text.indexOf(nextChapter.title, Math.max(start, 0) + chapter.title.length) : -1;
            const body = text.slice(Math.max(start, 0), end >= 0 ? end : undefined).trim() || text;
            return { section: chapter.title, body };
          })
          : [{
            section: [...sectionChapters].reverse().find((chapter) => chapter.page <= pageNumber)?.title
              || `${path.basename(relativePath)} - page ${pageNumber}`,
            body: text,
          }];

        sectionDocuments.forEach((sectionDocument, sectionIndex) => {
          addDocument({
            id: `pdf:${relativePath}:page:${pageNumber}:section:${sectionIndex + 1}`,
            canonicalId: `pdf:${relativePath}:page:${pageNumber}:section:${sectionIndex + 1}`,
            locale: 'universal',
            kind: 'pdf',
            title,
            section: sectionDocument.section,
            source: 'PDF',
            href: `${publicPath}#page=${pageNumber}`,
            page: pageNumber,
            version,
            body: sectionDocument.body,
          });
        });
      }

      if (extractedPages === 0) {
        console.warn(`[search-index] Skipped non-extractable PDF: ${publicPath}`);
      }
      await loadingTask.destroy();
    } catch (error) {
      console.warn(`[search-index] Skipped PDF ${publicPath}: ${error.message}`);
      await loadingTask?.destroy?.();
    }
  }
}

async function main() {
  const config = readToml('config.toml');
  if (!config) {
    throw new Error('content/config.toml is required to build the search index.');
  }

  const locales = config.i18n?.enabled === false
    ? [config.i18n?.default_locale || 'en']
    : (config.i18n?.locales || [config.i18n?.default_locale || 'en']);
  const navigation = (config.navigation || []).filter((item) => item.type === 'page');

  for (const locale of locales) {
    for (const navigationItem of navigation) {
      const pageConfig = readToml(`${navigationItem.target}.toml`, locale);
      if (!pageConfig) continue;
      const route = routeFor(navigationItem.href);

      if (navigationItem.target === 'about' || pageConfig.type === 'about') {
        collectAbout(config, locale);
      } else if (pageConfig.type === 'card') {
        collectCardPage(navigationItem.target, route, pageConfig, locale);
      } else if (pageConfig.type === 'learning') {
        collectLearning(route, pageConfig, locale);
      } else if (pageConfig.type === 'questions') {
        collectQuestions(route, pageConfig, locale);
      } else if (pageConfig.type === 'publication') {
        collectPublications(route, pageConfig, locale);
      } else if (pageConfig.type === 'gallery') {
        collectGallery(route, pageConfig, locale);
      } else if (pageConfig.type === 'text') {
        collectTextPage(route, pageConfig, locale);
      }
    }
  }

  await collectPdfDocuments();
  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    documents,
  };
  await writeFile(OUTPUT, `${JSON.stringify(index)}\n`, 'utf8');
  console.log(`[search-index] Wrote ${documents.length} documents to public/search-index.json.`);
}

main().catch((error) => {
  console.error(`[search-index] Failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
