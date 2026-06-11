import { minify } from 'html-minifier-terser';

export default {
  base: './',
  plugins: [
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
