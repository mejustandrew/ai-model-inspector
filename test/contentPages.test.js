import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
  ['/', 'index.html'],
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

test('every public page has unique crawlable metadata and one h1', async () => {
  const titles = new Set();
  const canonicals = new Set();

  for (const [route, filename] of pages) {
    const html = await readFile(path.join(root, filename), 'utf8');
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];

    assert.ok(title, `${route} needs a title`);
    assert.ok(canonical, `${route} needs a canonical URL`);
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

test('AdSense publisher identity is exposed consistently', async () => {
  const homepage = await readFile(path.join(root, 'index.html'), 'utf8');
  const ads = await readFile(path.join(root, 'public/ads.txt'), 'utf8');
  assert.match(homepage, /google-adsense-account" content="ca-pub-8908115236132872"/);
  assert.equal(ads.trim(), 'google.com, pub-8908115236132872, DIRECT, f08c47fec0942fa0');
});
