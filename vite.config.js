import { minify } from 'html-minifier-terser';

export default {
  base: './',
  plugins: [
    {
      name: 'huggingface-downloader-history-fallback',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const pathname = request.url?.split('?')[0];

          if (pathname === '/huggingface-downloader') {
            request.url = '/index.html';
          }

          next();
        });
      },
    },
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
  },
};
