// Pulls design tokens from Figma Variables (REST API) and writes design/tokens.json.
//
// DEAD ON THIS PLAN (2026-09-28): the REST Variables API requires the
// `file_variables:read` scope, which is ENTERPRISE-ONLY. On José's Professional
// plan the PAT gets a 403 naming that scope; no scope selection fixes it.
// Token sync now goes through the Figma remote MCP (see guito-api ADR-0010);
// this script is kept only as documentation of the intended shape.
//
// Requires: FIGMA_TOKEN (personal access token with the file_variables:read scope)
// in the environment or in a gitignored .env at the repo root.
// Config: tools/tokens/figma.json (file key, collection, mode, name mapping).
//
// Light mode only (decided 2026-09-28). The output format matches
// design/tokens.json (style-dictionary: { group: { token: { value, type } } }),
// so the existing build-tokens.mjs compiles it unchanged.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONFIG = JSON.parse(readFileSync('tools/tokens/figma.json', 'utf8'));

function loadToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN;
  const envPath = '.env';
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('FIGMA_PAT=')); // var name José created; treat FIGMA_TOKEN as alias
    if (line) return line.split('=')[1].trim();
  }
  console.error('No Figma token: set FIGMA_PAT in .env (gitignored) or FIGMA_TOKEN in the environment.');
  process.exit(1);
}

const TOKEN = loadToken();
const api = async (path) => {
  const res = await fetch(`https://api.figma.com/v1${path}`, {
    headers: { 'X-Figma-Token': TOKEN },
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`Figma API ${res.status}: ${JSON.stringify(body)}`);
    process.exit(1);
  }
  return body;
};

const meta = await api(`/files/${CONFIG.fileKey}/variables/local`);
const collections = Object.values(meta.variableCollections);
const collection =
  collections.find((c) => c.name === CONFIG.collection) ??
  collections.find((c) => c.key === CONFIG.collection);
if (!collection) {
  console.error(`Collection "${CONFIG.collection}" not found. Available: ${collections.map((c) => c.name).join(', ')}`);
  process.exit(1);
}
const mode =
  collection.modes.find((m) => m.name === CONFIG.mode) ?? collection.modes[0];

const variables = Object.values(meta.variables).filter((v) => v.variableCollectionId === collection.id);
console.log(`Collection "${collection.name}" mode "${mode.name}": ${variables.length} variables`);

const tokens = {};
const unmapped = [];
for (const v of variables) {
  const target = CONFIG.mapping[v.name];
  if (!target) {
    unmapped.push(v.name);
    continue;
  }
  const raw = v.valuesByMode[mode.modeId];
  if (raw === undefined || raw === null) continue;
  if (raw.resolvedType === 'VARIABLE_ALIAS') continue; // alias chains resolved in a later pass
  // group path: "color/primary" -> tokens.color.primary
  const parts = target.split('/');
  let node = tokens;
  for (const part of parts.slice(0, -1)) node = (node[part] ??= {});
  node[parts.at(-1)] = { value: raw.value ?? raw, type: v.resolvedType.toLowerCase() };
}

if (unmapped.length) {
  console.warn(`Unmapped Figma variables (add them to tools/tokens/figma.json): ${unmapped.join(', ')}`);
}

const out = { ...tokens, _meta: { source: CONFIG.fileKey, collection: collection.name, mode: mode.name, pulledAt: new Date().toISOString() } };
writeFileSync('design/tokens.json', JSON.stringify(out, null, 2) + '\n');
console.log('design/tokens.json written.');
