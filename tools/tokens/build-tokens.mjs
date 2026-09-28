// Compiles design/tokens.json (source of truth) into src/theme/tokens.css.
// Output: --guito-* CSS custom properties per token, plus daisyUI theme aliases, all in :root.
// Light mode only (decided 2026-09-28); extend here if a dark theme is ever added.
import StyleDictionary from 'style-dictionary';
import { appendFileSync } from 'node:fs';

// Custom name transform: --guito-<path joined by '-'> (e.g. --guito-color-primary)
StyleDictionary.registerTransform({
  name: 'name/guito',
  type: 'name',
  transform: (token) => `guito-${token.path.join('-')}`,
});

// token path -> daisyUI theme variable (kept explicit: the contract between
// design tokens and daisyUI must be reviewable, not inferred)
const DAISY_ALIASES = [
  ['color-primary', 'color-primary'],
  ['color-primary-content', 'color-primary-content'],
  ['color-secondary', 'color-secondary'],
  ['color-secondary-content', 'color-secondary-content'],
  ['color-accent', 'color-accent'],
  ['color-accent-content', 'color-accent-content'],
  ['color-neutral', 'color-neutral'],
  ['color-neutral-content', 'color-neutral-content'],
  ['color-base-100', 'color-base-100'],
  ['color-base-200', 'color-base-200'],
  ['color-base-300', 'color-base-300'],
  ['color-base-content', 'color-base-content'],
  ['color-info', 'color-info'],
  ['color-info-content', 'color-info-content'],
  ['color-success', 'color-success'],
  ['color-success-content', 'color-success-content'],
  ['color-warning', 'color-warning'],
  ['color-warning-content', 'color-warning-content'],
  ['color-error', 'color-error'],
  ['color-error-content', 'color-error-content'],
  ['radius-field', 'radius-field'],
  ['radius-selector', 'radius-selector'],
  ['radius-box', 'radius-box'],
  ['size-field', 'size-field'],
  ['size-selector', 'size-selector'],
  ['border', 'border'],
  ['font-sans', 'font-sans'],
  ['font-mono', 'font-mono'],
];

const sd = new StyleDictionary({
  source: ['design/tokens.json'],
  platforms: {
    css: {
      // same transforms as the 'css' transformGroup, with our name transform last
      transforms: ['attribute/cti', 'color/css', 'size/rem', 'fontFamily/css', 'name/guito'],
      buildPath: 'src/theme/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
        },
      ],
    },
  },
});

await sd.buildAllPlatforms();

const lines = DAISY_ALIASES.map(([token, daisy]) => `  --${daisy}: var(--guito-${token});`);
const block =
  `\n/* daisyUI theme aliases — daisyUI components consume these; keep in sync with design/tokens.json */\n` +
  `:root {\n${lines.join('\n')}\n}\n`;
appendFileSync('src/theme/tokens.css', block);
console.log('tokens.css written to src/theme/tokens.css');
