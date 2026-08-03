'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const linksDir = path.join(root, 'links');
const linksIndex = path.join(linksDir, 'index.html');
const aboutDir = path.join(root, 'about');
const aboutIndex = path.join(aboutDir, 'index.html');
const projectsDir = path.join(root, 'projects');
const projectsIndex = path.join(projectsDir, 'index.html');
const generated = '<meta name="generator" content="build.js">';
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const projects = [

    {
    slug: 'pp',
    title: 'PP',
    description: 'A content-addressed, capability-scoped language.',
    slogan: 'OCaml · language runtime',
    cover: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23151820%27/%3E%3Cpath d=%27M20 25h60M20 40h45M20 55h60M20 70h35%27 stroke=%27%235b6872%27 stroke-width=%272%27/%3E%3Ctext x=%2750%27 y=%2747%27 fill=%27%23e4a6b2%27 font-family=%27monospace%27 font-size=%2721%27 text-anchor=%27middle%27%3Epp%3C/text%3E%3C/svg%3E'
  },
  {
    slug: 'forum',
    title: 'Forum Experiment',
    description: 'Forum application with Go and MongoDB.',
    slogan: 'Server-rendered discussion platform',
    cover: '/assets/forumexperiment_images/homepage.png'
  },
  {
    slug: 'embedst',
    title: 'Embedst',
    description: 'Typst rendering service for rich embeds.',
    slogan: 'TypeScript · Typst',
    cover: '/assets/embedst/embedst.png'
  },
  {
    slug: 'syn',
    title: 'SYN',
    description: 'Sign language recognition interface.',
    slogan: 'Python · React',
    cover: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23151820%27/%3E%3Ccircle cx=%2750%27 cy=%2750%27 r=%2732%27 fill=%27none%27 stroke=%27%235b6872%27 stroke-width=%272%27/%3E%3Cpath d=%27M22 61c12-23 27-23 39-3s25 20 30-3%27 fill=%27none%27 stroke=%27%23bdc3c7%27 stroke-width=%275%27/%3E%3Cpath d=%27M25 35c10 9 21 9 30 0s20-9 30 0%27 fill=%27none%27 stroke=%27%237f8a91%27 stroke-width=%273%27/%3E%3C/svg%3E'
  },
  {
    slug: 'election_model',
    title: '2024 Election Model',
    description: 'Monte Carlo election forecast.',
    slogan: 'R · Selenium',
    cover: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23151820%27/%3E%3Cpath d=%27M16 82h68%27 stroke=%27%237f8a91%27 stroke-width=%272%27/%3E%3Crect x=%2720%27 y=%2757%27 width=%2711%27 height=%2725%27 fill=%27%235b6872%27/%3E%3Crect x=%2737%27 y=%2743%27 width=%2711%27 height=%2739%27 fill=%27%23bdc3c7%27/%3E%3Crect x=%2754%27 y=%2729%27 width=%2711%27 height=%2753%27 fill=%27%237f8a91%27/%3E%3Crect x=%2771%27 y=%2748%27 width=%2711%27 height=%2734%27 fill=%27%235b6872%27/%3E%3C/svg%3E'
  },
  {
    slug: 'aplatformer',
    title: 'A Platformer',
    description: '2D platform game built with Godot.',
    slogan: 'GDScript',
    cover: 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23151820%27/%3E%3Cpath d=%27M15 20h70M15 40h70M15 60h70M15 80h70M20 15v70M40 15v70M60 15v70M80 15v70%27 stroke=%27%23353b43%27 stroke-width=%272%27/%3E%3Cpath d=%27M20 75h26V55h18V35h16%27 fill=%27none%27 stroke=%27%23bdc3c7%27 stroke-width=%275%27/%3E%3Ccircle cx=%2727%27 cy=%2765%27 r=%275%27 fill=%27%237f8a91%27/%3E%3C/svg%3E'
  },

  {
    slug: 'orchestrator',
    title: 'The Orchestrator',
    description: 'Container orchestration from scratch.',
    slogan: 'Python · MongoDB',
    cover: '/assets/orchestrator/1.png'
  }
];

const escape = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const defaultProjectCover = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E%3Crect width=%27100%27 height=%27100%27 fill=%27%23151820%27/%3E%3Cpath d=%27M15 20h70M15 40h70M15 60h70M15 80h70M20 15v70M40 15v70M60 15v70M80 15v70%27 stroke=%27%23353b43%27 stroke-width=%272%27/%3E%3C/svg%3E';

const htmlText = value => String(value)
  .replace(/<[^>]*>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function discoverProjects() {
  if (!fs.existsSync(projectsDir)) return;
  const configured = new Set(projects.map(project => project.slug));
  for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || configured.has(entry.name)) continue;
    const page = path.join(projectsDir, entry.name, 'index.html');
    if (!fs.existsSync(page)) continue;
    const raw = fs.readFileSync(page, 'utf8');
    const title = htmlText(raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
      || raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      || entry.name);
    const description = htmlText(raw.match(/<p class="muted"[^>]*>([\s\S]*?)<\/p>/i)?.[1]
      || 'Project details');
    projects.push({
      slug: entry.name,
      title,
      description,
      slogan: '',
      cover: defaultProjectCover
    });
  }
}

const slug = value => value.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'untitled';

const filesIn = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.name.startsWith('.') ? [] : entry.isDirectory() ? filesIn(file) : [file];
});

const date = value => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = value => value && `${months[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()}`;

function metadata(raw) {
  const block = raw.match(/^\s*(?:<!DOCTYPE[^>]*>\s*)?<!--([\s\S]*?)-->/);
  const result = {};
  if (!block) return result;
  for (const line of block[1].split('\n')) {
    const match = line.match(/^\s*(\w+)\s*:\s*(.*)$/);
    if (match) result[match[1].toLowerCase()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function frontmatter(raw) {
  if (!raw.startsWith('---')) return { meta: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: raw };
  const meta = {};
  for (const line of raw.slice(3, end).split('\n')) {
    const match = line.match(/^\s*(\w+)\s*:\s*(.*)$/);
    if (match) meta[match[1].toLowerCase()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { meta, body: raw.slice(end + 4) };
}

function inline(value) {
  return escape(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function markdown(source) {
  const lines = source.split(/\r?\n/);
  const html = [];
  let list;
  let quote;
  const closeList = () => { if (list) html.push(`</${list}>`); list = null; };
  const closeQuote = () => { if (quote) html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`); quote = null; };

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (/^```/.test(line.trim())) {
      closeList(); closeQuote();
      const language = line.trim().slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) code.push(lines[index++]);
      index += 1;
      html.push(`<pre><code${language ? ` data-lang="${escape(language)}"` : ''}>${escape(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList(); closeQuote();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeList(); closeQuote(); html.push('<hr>'); index += 1; continue;
    }
    if (/^\s*>\s?/.test(line)) {
      closeList(); quote ||= []; quote.push(line.replace(/^\s*>\s?/, '')); index += 1; continue;
    }
    closeQuote();
    const item = line.match(/^\s*([-*+] |\d+[.)] )(.*)$/);
    if (item) {
      const type = /^\d/.test(item[1]) ? 'ol' : 'ul';
      if (list !== type) { closeList(); html.push(`<${type}>`); list = type; }
      html.push(`<li>${inline(item[2])}</li>`); index += 1; continue;
    }
    closeList();
    if (!line.trim()) { index += 1; continue; }
    const paragraph = [];
    while (index < lines.length && lines[index].trim()) paragraph.push(lines[index++]);
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  closeList(); closeQuote();
  return html.join('\n');
}

const navHtml = `<nav class="site-nav" aria-label="Site navigation">
  <a href="/">Pranav Rao</a>
  <a href="/about/">About</a>
  <a href="/projects/">Projects</a>
  <a href="/links/">Links</a>
</nav>`;

function shell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} — Pranav Rao</title>
  <meta name="description" content="${escape(title)} — Pranav Rao.">
  ${generated}
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body class="content-page">
  <main class="content-shell">
${navHtml}
${body}
  </main>
</body>
</html>
`;
}

function renderAbout() {
  return shell('About', `<h1>About Me</h1>
<p class="about-lede">I’m a software engineer and builder. I like making useful tools, exploring new ideas, and learning by taking projects from a blank page to something people can use.</p>

<p>I spend most of my time working across software engineering, data, creative coding, and the small details that make an interface feel good. This site is a home for the things I make and the notes I keep along the way.</p>

<h2>Contact</h2>
<ul class="contact-list">
  <li><strong>Email</strong> <a href="mailto:raopranav117@gmail.com">raopranav117@gmail.com</a></li>
  <li><strong>GitHub</strong> <a href="https://github.com/pranavra0">@pranavra0</a></li>
  <li><strong>Resume</strong> <a href="https://typst.app/project/r7zenpFFvIyfrFVtpYwOCe">View my resume</a></li>
  <li><strong>Location</strong> Charlotte, North Carolina</li>
</ul>

<h2>What I’m exploring</h2>
<ol>
  <li>Practical software systems, from backend services to polished interfaces.</li>
  <li>Machine learning and data tools that make complicated information easier to understand.</li>
  <li>Games, experiments, and other small projects that teach me something new.</li>
</ol>

<p>If you want to talk about a project, <a href="mailto:raopranav117@gmail.com">send me an email</a>.</p>`);
}

const projectHtml = project => `<a class="project-card" href="/projects/${escape(project.slug)}/">
  <img class="project-cover" src="${escape(project.cover)}" alt="${escape(project.title)}" loading="lazy">
  <span>
    <strong>${escape(project.title)}</strong>
    <span>${escape(project.description)}</span>
    ${project.slogan ? `<em>${escape(project.slogan)}</em>` : ''}
  </span>
</a>`;

function renderProjects() {
  const cards = projects.map(projectHtml).join('\n\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Projects — Pranav Rao</title>
  <meta name="description" content="Projects by Pranav Rao.">
  ${generated}
  <link rel="stylesheet" href="/assets/style.css">
</head>
<body class="content-page projects-page">
  <main class="directory content-shell">
${navHtml}
    <header class="project-header">
      <h1>Projects</h1>
      <p>Software projects by Pranav Rao.</p>
    </header>
    <div class="project-list">
${cards}
    </div>
  </main>
</body>
</html>
`;
}

function collect() {
  const entries = [];
  const used = new Set();
  if (!fs.existsSync(linksDir)) return entries;
  for (const file of filesIn(linksDir)) {
    if (file === linksIndex) continue;
    const extension = path.extname(file).toLowerCase();
    const stat = fs.statSync(file);
    if (['.md', '.markdown', '.txt'].includes(extension)) {
      const raw = fs.readFileSync(file, 'utf8');
      const { meta, body } = frontmatter(raw);
      let name = slug(path.basename(file, extension));
      while (used.has(name)) name += '-2';
      used.add(name);
      const heading = body.match(/^\s*#\s+(.+)$/m);
      entries.push({ kind: 'md', file, target: path.join(linksDir, `${name}.html`), url: `/links/${name}.html`, title: meta.title || heading?.[1]?.trim() || path.basename(file, extension), date: date(meta.date) || stat.mtime });
    } else if (['.html', '.htm'].includes(extension)) {
      const raw = fs.readFileSync(file, 'utf8');
      if (raw.includes(generated)) continue;
      const meta = metadata(raw);
      const relative = path.relative(linksDir, file).split(path.sep).join('/');
      const url = `/links/${relative.endsWith('/index.html') ? relative.slice(0, -10) : relative}`;
      const title = raw.match(/<title>\s*(.*?)\s*<\/title>/i)?.[1]?.replace(/\s*&mdash;\s*Pranav\s*Rao\s*$/i, '').replace(/\s*[-—]\s*Pranav\s*Rao\s*$/i, '').trim();
      entries.push({ kind: 'html', file, url, title: meta.title || title || path.basename(file, extension), date: date(meta.date) || stat.mtime });
    }
  }
  return entries.sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
}

const entryHtml = entry => `<li>
  <time class="link-date" datetime="${entry.date.toISOString().slice(0, 10)}">${escape(formatDate(entry.date))}</time>
  <a href="${entry.url}">${escape(entry.title)}</a>
</li>`;

function renderMarkdown(entry) {
  const { body } = frontmatter(fs.readFileSync(entry.file, 'utf8'));
  const cleaned = body.replace(new RegExp(`^\\s*#\\s+${entry.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?`, 'i'), '');
  return shell(entry.title, `<h1>${escape(entry.title)}</h1>
<p class="muted">${escape(formatDate(entry.date))}</p>
${markdown(cleaned)}`);
}

function validateProjects() {
  for (const project of projects) {
    const page = path.join(projectsDir, project.slug, 'index.html');
    if (!fs.existsSync(page)) throw new Error(`Missing project page: ${page}`);
    if (project.cover.startsWith('/') && !fs.existsSync(path.join(root, project.cover.slice(1)))) {
      throw new Error(`Missing project cover: ${project.cover}`);
    }
  }
}

function build() {
  discoverProjects();
  const entries = collect();
  const written = new Set();
  validateProjects();
  fs.mkdirSync(aboutDir, { recursive: true });
  fs.writeFileSync(aboutIndex, renderAbout());
  fs.mkdirSync(linksDir, { recursive: true });
  for (const entry of entries) {
    if (entry.kind !== 'md') continue;
    fs.writeFileSync(entry.target, renderMarkdown(entry));
    written.add(entry.target);
  }
  for (const file of filesIn(linksDir)) {
    if (file !== linksIndex && !written.has(file) && /\.html?$/i.test(file) && fs.readFileSync(file, 'utf8').includes(generated)) fs.unlinkSync(file);
  }
  const list = entries.length ? `<ul class="link-list">\n${entries.map(entryHtml).join('\n')}\n</ul>` : '<p class="muted">Nothing here yet.</p>';
  const resources = `<h2>Elsewhere</h2>
<ul class="resource-list">
  <li><a href="https://github.com/pranavra0">GitHub</a> — source code and experiments</li>
  <li><a href="https://typst.app/project/r7zenpFFvIyfrFVtpYwOCe">Resume</a> — a concise work history</li>
  <li><a href="mailto:raopranav117@gmail.com">Email</a> — reach me directly</li>
</ul>`;
  fs.writeFileSync(linksIndex, shell('Links', `<h1>Links</h1>\n<p class="muted">A small index of writing, notes, and useful corners of the internet.</p>\n${list}\n${resources}`));
  fs.mkdirSync(projectsDir, { recursive: true });
  fs.writeFileSync(projectsIndex, renderProjects());
  process.stdout.write(`Built ${entries.length} link${entries.length === 1 ? '' : 's'} and ${projects.length} projects.\n`);
}

build();
