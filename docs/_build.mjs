#!/usr/bin/env node
// docs/_build.mjs — render 8 localized HTML pages from _template.html + _i18n.json.
// Zero npm deps (Node builtins only). Same design constraint as scripts/inspect.js.
//
// Usage:   node docs/_build.mjs
// Verify:  git diff docs/*.html
//
// Placeholders inside _template.html:
//   {{a.b.c}}         → dot-path lookup on i18n[lang]; falls back to i18n.en on miss.
//   {{langDropdown}}  → precomputed 8-item <a>-list (current language marked).
//   {{langFlag}} / {{langName}} / {{htmlLang}} / {{canonicalUrl}} → plain string keys.
//
// Output map:
//   en    → docs/index.html
//   other → docs/<code>.html

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// Preserve the source keyset order — used to emit hreflang + dropdown deterministically.
const LANGS = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'fr', 'de', 'es'];

// en → index.html; every other lang → <code>.html.
const outFile = (lang) => (lang === 'en' ? 'index.html' : `${lang}.html`);

function loadInputs() {
  const template = readFileSync(join(HERE, '_template.html'), 'utf8');
  const raw = readFileSync(join(HERE, '_i18n.json'), 'utf8');
  const i18n = JSON.parse(raw);
  for (const l of LANGS) {
    if (!i18n[l]) throw new Error(`_i18n.json missing top-level key: ${l}`);
  }
  return { template, i18n };
}

// dotGet('a.b.c', {a:{b:{c:'v'}}}) → 'v'; undefined on any miss.
function dotGet(path, obj) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function buildDropdown(currentLang, i18n) {
  const rows = [];
  for (const l of LANGS) {
    const flag = i18n[l].langFlag;
    const name = i18n[l].langName;
    const href = l === 'en' ? './' : './' + outFile(l);
    if (l === currentLang) {
      rows.push(`          <a class="current" href="${href}"><span aria-hidden="true">${flag}</span> ${name}</a>`);
    } else {
      rows.push(`          <a href="${href}" hreflang="${l}"><span aria-hidden="true">${flag}</span> ${name}</a>`);
    }
  }
  return rows.join('\n');
}

function render(template, lang, i18n) {
  const dict = i18n[lang];
  const en = i18n.en;
  const missing = new Set();

  // Precomputed multi-line block, injected as-is (values may contain HTML).
  const langDropdown = buildDropdown(lang, i18n);

  const out = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_full, key) => {
    if (key === 'langDropdown') return langDropdown;
    const v = dotGet(key, dict);
    if (v != null) return String(v);
    const fallback = dotGet(key, en);
    if (fallback != null) {
      // Warn once per key per lang so translators see what they missed.
      console.warn(`[${lang}] fallback to en for key: ${key}`);
      return String(fallback);
    }
    missing.add(key);
    return `{{MISSING:${key}}}`;
  });

  if (missing.size) {
    throw new Error(
      `[${lang}] template placeholders not present in i18n.${lang} nor i18n.en:\n  ` +
        [...missing].join('\n  '),
    );
  }
  return out;
}

function main() {
  const { template, i18n } = loadInputs();
  let bytes = 0;
  for (const lang of LANGS) {
    const html = render(template, lang, i18n);
    const dest = join(HERE, outFile(lang));
    writeFileSync(dest, html);
    bytes += Buffer.byteLength(html);
    console.log(`✔ ${outFile(lang).padEnd(14)}  ${Buffer.byteLength(html).toString().padStart(6)} bytes`);
  }
  console.log(`\nWrote ${LANGS.length} files · ${bytes} bytes total.`);
}

main();
