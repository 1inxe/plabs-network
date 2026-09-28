export default {
  '*.{ts,tsx,js,mjs,json}': ['biome check --write --no-errors-on-unmatched'],
  '*.{css,md,mdx,yml,yaml,html}': ['prettier --write'],
};
