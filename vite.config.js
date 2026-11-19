import { minify } from 'html-minifier-terser';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

// Match Firebase cleanUrls locally instead of falling through to the SPA.
function cleanPageUrls() {
  const routes = new Map([['/llm-memory-estimator', '/llm-memory-estimator.html']]);
  function collect(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) collect(new URL(`${entry.name}/`, directory), `${prefix}/${entry.name}`);
      else if (entry.name.endsWith('.html')) {
        const filename = `${prefix}/${entry.name}`;
        const route = filename.replace(/\.html$/, '').replace(/\/index$/, '') || '/';
        routes.set(route, filename);
      }
    }
  }
  collect(new URL('./public/', import.meta.url));
  const middleware = (request, response, next) => {
    const url = new URL(request.url, 'http://localhost');
    const target = routes.get(url.pathname.replace(/\/$/, '') || '/');
    if (target) request.url = target + url.search;
    next();
  };
  return {
    name: 'clean-page-urls',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default {
  base: './',
  plugins: [
    cleanPageUrls(),
    {
      name: 'minify-html',
      apply: 'build',
      async transformIndexHtml(html) {
        return minify(html, {
          collapseBooleanAttributes: true,
          collapseWhitespace: true,
          decodeEntities: true,
          removeAttributeQuotes: true,
          removeComments: true,
          removeRedundantAttributes: true,
          removeScriptTypeAttributes: true,
          removeStyleLinkTypeAttributes: true,
          useShortDoctype: true,
        });
      },
    },
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        inspector: fileURLToPath(new URL('./index.html', import.meta.url)),
        estimator: fileURLToPath(new URL('./llm-memory-estimator.html', import.meta.url)),
      },
    },
  },
};
