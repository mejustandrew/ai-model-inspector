import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  ['/', 'index.html'],
  ['/gguf-viewer', 'public/gguf-viewer.html'],
  ['/onnx-viewer', 'public/onnx-viewer.html'],
  ['/llm-memory-estimator', 'llm-memory-estimator.html'],
  ['/docs', 'public/docs/index.html'],
  ['/docs/gguf', 'public/docs/gguf.html'],
  ['/docs/gguf-metadata', 'public/docs/gguf-metadata.html'],
  ['/docs/gguf-quantization', 'public/docs/gguf-quantization.html'],
  ['/docs/onnx', 'public/docs/onnx.html'],
  ['/docs/onnx-graphs', 'public/docs/onnx-graphs.html'],
  ['/docs/inference-memory', 'public/docs/inference-memory.html'],
  ['/docs/compare-models', 'public/docs/compare-models.html'],
  ['/about', 'public/about.html'],
  ['/privacy', 'public/privacy.html'],
];

function count(html, pattern) {
  return [...html.matchAll(pattern)].length;
}

test('homepage runtime preserves the static affiliate message', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const script = await readFile(path.join(root, 'src/main.js'), 'utf8');
  const message = html.match(/<p class="affiliate-message">[\s\S]*?<\/p>/)?.[0];
  assert.ok(message, 'static homepage needs the affiliate message');
  const template = script.slice(script.indexOf('app.innerHTML = `'), script.indexOf('`;'));
  assert.ok(template.includes(message), 'homepage render must preserve the affiliate message');
});

test('every public page has unique crawlable metadata and one h1', async () => {
  const titles = new Set();
  const canonicals = new Set();

  for (const [route, filename] of pages) {
    const html = await readFile(path.join(root, filename), 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];

    assert.ok(title, `${route} needs a title`);
    assert.ok(canonical, `${route} needs a canonical URL`);
    assert.equal(canonical, `https://ai-model-inspector.com${route}`);
    assert.doesNotMatch(html, /noindex|nofollow/i);
    assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/i, `${route} needs a description`);
    assert.match(html, /<meta\s+property="og:title"\s+content="[^"]+"/i, `${route} needs Open Graph data`);
    assert.equal(count(html, /<h1(?:\s[^>]*)?>/gi), 1, `${route} must have one h1`);
    assert.ok(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').length > 400, `${route} is too thin`);
    assert.equal(titles.has(title), false, `duplicate title: ${title}`);
    assert.equal(canonicals.has(canonical), false, `duplicate canonical: ${canonical}`);
    titles.add(title);
    canonicals.add(canonical);
  }
});

test('internal links on static pages resolve to public routes', async () => {
  for (const [route, filename] of pages) {
    const html = await readFile(path.join(root, filename), 'utf8');
    const hrefs = [...html.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1]);

    for (const href of hrefs) {
      const target = href.split('#')[0].split('?')[0];
      if (!target || target === '/' || target === '/icon.svg' || target === '/content.css') continue;
      const candidates = [
        path.join(root, `${target.slice(1)}.html`),
        path.join(root, 'public', `${target.slice(1)}.html`),
        path.join(root, 'public', target.slice(1), 'index.html'),
      ];
      assert.ok(candidates.some(existsSync), `${route} has a broken link to ${target}`);
    }
  }
});

test('sitemap contains every public canonical route', async () => {
  const sitemap = await readFile(path.join(root, 'public/sitemap.xml'), 'utf8');
  for (const [route] of pages) {
    const url = `https://ai-model-inspector.com${route}`;
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `sitemap is missing ${route}`);
  }
});

test('obsolete Hugging Face downloader route is not linked', async () => {
  for (const [, filename] of pages) {
    const html = await readFile(path.join(root, filename), 'utf8');
    assert.equal(html.includes('/huggingface-downloader'), false);
  }
});

test('homepage SEO matches requested copy with consistent social metadata', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const title = 'AI Model Inspector | GGUF &amp; ONNX Model Viewer + RAM Estimator';
  const description = 'Inspect GGUF and ONNX models locally in your browser. View metadata, compare models, and estimate memory requirements. Free, private, no upload.';
  assert.ok(html.includes('<title>' + title + '</title>'));
  assert.ok(html.includes('content="' + description + '"'));
  assert.ok(html.includes('content="' + title + '"'));
  assert.equal(html.includes('home-copy-grid'), false);
});

test('software schema represents free tools without invented reviews', async () => {
  for (const filename of ['index.html', 'public/gguf-viewer.html', 'public/onnx-viewer.html', 'llm-memory-estimator.html']) {
    const html = await readFile(path.join(root, filename), 'utf8');
    const start = html.indexOf('<script type="application/ld+json">') + '<script type="application/ld+json">'.length;
    const schema = JSON.parse(html.slice(start, html.indexOf('</script>', start)));
    assert.equal(schema['@type'], 'SoftwareApplication');
    assert.equal(schema.offers.price, '0');
    assert.equal(schema.isAccessibleForFree, true);
    assert.ok(schema.applicationCategory && schema.operatingSystem);
    assert.ok(html.includes('rel="canonical" href="' + schema.url + '"'));
    assert.equal(schema.aggregateRating, undefined);
    assert.equal(schema.review, undefined);
  }
});

test('robots permits crawling and landing content is readable without scripts', async () => {
  const robots = await readFile(path.join(root, 'public/robots.txt'), 'utf8');
  assert.ok(robots.includes('User-agent: *'));
  assert.ok(robots.includes('Allow: /'));
  assert.equal(robots.includes('Disallow:'), false);
  assert.ok(robots.includes('Sitemap: https://ai-model-inspector.com/sitemap.xml'));
  for (const filename of ['public/gguf-viewer.html', 'public/onnx-viewer.html', 'llm-memory-estimator.html']) {
    const html = await readFile(path.join(root, filename), 'utf8');
    assert.ok(html.includes('<h1>'));
    assert.ok(html.includes('href="/#upload-panel"'));
    assert.ok(html.includes('href="/docs'));
  }
  const estimator = await readFile(path.join(root, 'llm-memory-estimator.html'), 'utf8');
  assert.equal(estimator.includes('type="file"'), false);
  assert.ok(estimator.includes('KV bytes ='));
  const hosting = JSON.parse(await readFile(path.join(root, 'firebase.json'), 'utf8')).hosting;
  assert.equal(hosting.cleanUrls, true);
  assert.equal(hosting.trailingSlash, false);
});

test('development and preview clean URLs resolve to each page instead of the homepage', async () => {
  const { default: config } = await import('../vite.config.js');
  const plugin = config.plugins.find(item => item.name === 'clean-page-urls');
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    let middleware;
    plugin[hook]({ middlewares: { use(handler) { middleware = handler; } } });
    for (const [route, filename] of pages) {
      for (const suffix of ['', '?check=1', '/']) {
        const request = { url: route + (route === '/' && suffix === '/' ? '' : suffix) };
        let continued = false;
        middleware(request, {}, () => { continued = true; });
        const target = filename.replace(/^public\//, '');
        assert.equal(request.url, route === '/' ? '/' + (suffix === '?check=1' ? suffix : '') : `/${target}${suffix === '?check=1' ? suffix : ''}`);
        assert.ok(continued);
      }
    }
    for (const route of ['/src/main.js', '/content.css', '/missing-page', '/robots.txt']) {
      const request = { url: route };
      middleware(request, {}, () => {});
      assert.equal(request.url, route);
    }
  }
});
