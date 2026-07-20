# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`pms-inspector` (P/M/S = Plugin / MCP / Skill Inspector) is a Claude Code plugin distributed via GitHub marketplace. It is **not** a general application — the entire deliverable is one slash command that runs a static disk audit of what a Claude Code session loads into its system prompt, and prints byte/token math plus tuning suggestions.

Distinct from the built-in `/context`: that shows *runtime* state (current conversation). This tool reads *on-disk config* and predicts what the *next* session will load.

## Repository layout (what actually matters)

```
.claude-plugin/plugin.json       Plugin manifest — declares commands/ dir.
.claude-plugin/marketplace.json  Marketplace entry — consumed by `/plugin marketplace add`.
commands/pms-inspector.md        Slash-command definition (frontmatter + Bash body).
scripts/inspect.js               Audit script entry point (pipeline + rendering).
scripts/lib/i18n.js              Multi-language dictionary (8 langs) + language detection.
scripts/lib/width.js             East-Asian-Width aware column arithmetic for table alignment.

docs/_template.html              Single HTML master with {{a.b.c}} placeholders.
docs/_i18n.json                  Keyset per language (8 top-level keys, identical shape).
docs/_build.mjs                  Zero-dep Node renderer → 8 localized *.html files.
docs/{index,zh-CN,zh-TW,ja,ko,fr,de,es}.html   Generated — do not hand-edit.
docs/style.css                   Editorial CSS around Anthropic-brand tokens.
```

The command markdown does one thing — shell out to the script, with a fallback resolver for `$CLAUDE_PLUGIN_ROOT`:

```bash
PMS_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -td "$HOME/.claude/plugins/cache/pms-inspector/pms-inspector"/*/ 2>/dev/null | head -1)}"
node "${PMS_ROOT%/}/scripts/inspect.js" $ARGUMENTS
```

**Why the fallback is required (verified 2026-07-08)**: Claude Code sets `$CLAUDE_PLUGIN_ROOT` for slash-command *frontmatter substitution*, but it does not always propagate into the Bash tool's subprocess environment — `env | grep CLAUDE_PLUGIN_ROOT` inside the tool returns nothing, and `node "$CLAUDE_PLUGIN_ROOT/scripts/inspect.js"` collapses to `/scripts/inspect.js` (module-not-found). The fallback walks the CC-mandated cache path `~/.claude/plugins/cache/<plugin-name>/<plugin-name>/<version>/`. This is a lighter version of ecc's `resolve-ecc-root` node oneliner and serves the same purpose.

## The script pipeline

`scripts/inspect.js` is the entry (~450 lines pure Node — fs / path / os, plus `require('./lib/i18n')` and `require('./lib/width')`; still **zero npm deps**). Pipeline:

```
parseArgs → detectLang (i18n.js) → build:
  findEnabledPluginRoots → collectSkills / collectAgents / collectMcp / collectHooks
  → applyBudget (four-way skill classifier) → assemble report
→ suggest → renderHuman (via t() + boxTop/boxRow with visual-width padding) | renderJson
```

Key constants at top of `inspect.js`:
- `DEFAULT_FRACTION = 0.01` — CC default `skillListingBudgetFraction`. On a busy plugin setup, all skill descriptions collapse to name-only.
- `DEFAULT_MAX_DESC = 1536` — CC default `skillListingMaxDescChars`.
- `DEFAULT_CTX_TOKENS = 200000` — assumed context window; user-overridable via `--ctx`.
- `CHARS_PER_TOKEN = 4` — coarse token estimate used everywhere.
- `INNER_W = 66` — every box's inner width in visual columns. All rows pad to this via `padEndVisual` from `lib/width.js` so tables line up on any mix of ASCII/CJK/emoji.

The four-way skill load state produced by `applyBudget` is the whole point of the tool. Every UI, JSON field, and suggestion routes back to this classification:

| State | Meaning |
|---|---|
| `full` | description loaded intact |
| `desc-truncated` | capped by `skillListingMaxDescChars` |
| `budget-compressed` | squeezed by global `skillListingBudgetFraction` |
| `name-only` | description dropped, slug only |

## Reads (never writes)

The script reads and never writes:
- `~/.claude/settings.json` — only these keys: `enabledPlugins`, `skillListingBudgetFraction`, `skillListingMaxDescChars`, `mcpServers`, `hooks`, `language` (for i18n auto-detect). It **must not** touch `ANTHROPIC_AUTH_TOKEN` or any auth field.
- `~/.claude/plugins/cache/<owner>/<plugin>/<version>/**/{SKILL.md,agents/*.md,.claude-plugin/plugin.json}`.

## i18n architecture (as of v0.2.0)

- **Supported languages**: `en, zh-CN, zh-TW, ja, ko, fr, de, es` (8). Adding a language = one new entry in `DICT` in `scripts/lib/i18n.js`; nothing else. Missing keys auto-fall back to `en`.
- **Detection order** (highest first, first match wins):
  1. `--lang <code>` CLI flag
  2. `~/.claude/settings.json` → `language` field (accepts local names like `"简体中文"`, `"日本語"`, `"français"` — see `CC_LANGUAGE_ALIASES` in `i18n.js`)
  3. `$LC_ALL` / `$LANG` / `$LANGUAGE` env vars (POSIX form like `en_US.UTF-8` is stripped of `.codeset` before matching)
  4. Fallback to `en`
- **Template placeholders**: `{n}`, `{v}`, `{pct}`, `{frac}` etc. Render with `fmt(tpl, params)`. Don't concatenate translated fragments — one dict entry per complete sentence to avoid grammar breakage.
- **Never** add ANSI colors to translated strings — `lib/width.js` doesn't strip escape codes, so colors would break alignment.

## Table alignment

- **Never** use raw `.padEnd()` / `.padStart()` on strings that may contain CJK / emoji — they count code units, not visible columns.
- Use `padEndVisual` / `padStartVisual` / `truncateVisual` from `lib/width.js` for anything inside a box.
- **East Asian Ambiguous chars** (`✂ U+2702`, `⚠ U+26A0`, `·`) render 1-col in some terminals, 2-col in others. In `inspect.js` the status-block marker column is normalized to 2 cols via `padEndVisual(marker, 2)` — safe on both.
- The single-column `boxRow(text)` auto-wraps if `displayWidth(text) > INNER_W - 2` (used by `suggest()`). The two-column `boxRow2col(left, right)` **does not** wrap: it truncates the left column with `…`. Prefer `boxRow` for suggestion / warning lines that may translate to long strings.

## Common commands

```bash
# Smoke tests (run these on any change to inspect.js / lib/*)
node scripts/inspect.js                    # human-readable report (auto lang)
node scripts/inspect.js --lang en          # force English
node scripts/inspect.js --lang zh-CN       # force zh-CN — verify alignment on CJK
node scripts/inspect.js --lang de          # force German — has longest labels, catches width bugs
node scripts/inspect.js --json             # JSON (must remain machine-parseable)
node scripts/inspect.js --verbose          # per-skill breakdown
node scripts/inspect.js --ctx 128000       # override assumed context window

# Local install test (verify slash command wiring end to end)
# In a Claude Code session:
#   /plugin marketplace add /Users/pgg/qa/claude/pms-inspector
#   /plugin install pms-inspector@pms-inspector
#   /plugin reload
#   /pms-inspector

# Rename hygiene — after any rename, must return zero hits:
grep -rn "cc-context-inspector\|context-inspect" .
```

There are no build, lint, or test frameworks. Verification = running the script and reading the report.

## Editing the docs site (GitHub Pages)

The `docs/` site is 8 localized pages generated from **one** master + **one** keyset:

- Copy edits (any language): edit `docs/_i18n.json` under the relevant top-level lang key, then run `node docs/_build.mjs`. The build overwrites all 8 `docs/*.html` and reports byte counts per file. Missing keys fall back to `en` with a console warning; a placeholder present in the template but absent in both the target lang **and** `en` is a hard error.
- Structural edits (new section, moved element, CSS class change): edit `docs/_template.html` (placeholder syntax `{{a.b.c}}` — dot-path into the per-language object), add the new keys to **every** lang in `docs/_i18n.json` (keyset must stay identical across langs), then `node docs/_build.mjs`.
- **Never** hand-edit `docs/index.html` or `docs/{zh-CN,zh-TW,ja,ko,fr,de,es}.html`. They are build output; the next `_build.mjs` run overwrites your changes. The generated files are committed to the repo because GitHub Pages serves them directly (no build step on Pages).
- The `{{langDropdown}}` placeholder is special — the build script precomputes an 8-row `<a>` list from `LANGS` and marks the current page with `class="current"`. Do not put a manual dropdown in the template.
- Constraints inherited from the inspector: **zero npm deps** (Node builtins only), Python banned, cross-platform (`fs` API, no shelling out). The docs site itself is allowed one external dependency: Google Fonts CDN for Fraunces / Inter / JetBrains Mono (free stand-ins for Anthropic's proprietary `anthropicSerif`/`Sans`/`Mono`).

Verify after any docs edit:

```bash
node docs/_build.mjs                        # 8 files rewritten; watch for [lang] fallback warnings
grep -l "{{" docs/*.html                    # must return nothing — no unresolved placeholders
```

## Renaming the plugin — five-place rule

If you rename this plugin (fork or re-brand), the same identifier must be updated in **five** places in lock-step. Missing any one leaves `/plugin install` silently picking up the wrong name.

| File | Field |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | filename **and** frontmatter `name` |

Verify: `grep -rn "<new-name>" .` should hit exactly those five locations.

## Design constraints (why the code looks the way it does)

- **Zero npm deps.** No `js-yaml`, no `chalk`. Frontmatter parser is a 30-line regex in `parseFrontmatter`. Keep it that way — dep-free is a shipping constraint, not a preference.
- **Cross-platform.** macOS, Linux, Windows. Do not shell out to `find`/`grep`/`awk`; use `fs.readdirSync` recursion.
- **JS block comments must not contain `*/`.** Writing `skillListing*/mcpServers` in a `/* */` block closes the comment early and produces `SyntaxError: Unexpected identifier`. Say "skillListing 相关的两个 knob" or split with backslashes.
- **Python is banned.** An earlier draft used Python 3; rejected because Windows and recent macOS do not guarantee `python3` on PATH. Node is guaranteed because Claude Code itself runs on Node.

## Gotchas from prior sessions

- `export ECC_GATEGUARD=off` in a shell does **not** disable the ECC GateGuard hook — CC reads the env at its own launch, not from child shells. Disable via `~/.claude/settings.json` `env` field or `ECC_DISABLED_HOOKS`.
- Raising `skillListingBudgetFraction` from `0.01` to `0.15` on a ~300-skill setup goes from "everything name-only" to "everything full" at a cost of ~20k tokens per turn (~9.4% of a 200k window). This is the reference case the tool is calibrated against.
