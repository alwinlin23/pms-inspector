# pms-inspector

**P/M/S = Plugin / MCP / Skill Inspector.**

A zero-dependency Claude Code plugin that shows you exactly what your session pulls into the system prompt — every enabled plugin, MCP server, skill, agent, and hook — with byte and token math, plus concrete tuning suggestions.

## Why

Claude Code auto-loads every skill from every enabled plugin. On a busy setup (e.g. `ecc` + `claude-mem`, ~300 skills on disk), the default `skillListingBudgetFraction: 0.01` silently compresses skill descriptions down to *just the name*, and you can't see what happened. `/pms-inspector` tells you:

- How many plugins / MCP servers / skills / agents / hooks are enabled.
- How many bytes and tokens each category costs.
- Per-skill load state, in four buckets:
  - **full** — description loaded intact.
  - **desc-truncated** — capped by `skillListingMaxDescChars`.
  - **budget-compressed** — squeezed by the global `skillListingBudgetFraction`.
  - **name-only** — description dropped entirely, only the slug survives.
- What percent of the assumed context window (default 200k) it consumes.
- Concrete knobs to tune: raise `skillListingBudgetFraction`, lower `skillListingMaxDescChars`, or disable the biggest offender.

This is **not** a replacement for `/context`. `/context` shows *runtime* state (what's in the current conversation). `/pms-inspector` predicts what the *next* session will load by reading your on-disk config.

## Install

```
/plugin marketplace add https://github.com/<owner>/pms-inspector
/plugin install pms-inspector@pms-inspector
```

Then, in a new Claude Code session:

```
/pms-inspector
```

## Usage

```
/pms-inspector                    # Human-readable summary (auto-detects language)
/pms-inspector --json             # Machine-readable JSON
/pms-inspector --ctx 200000       # Override assumed context window
/pms-inspector --verbose          # Per-skill breakdown
/pms-inspector --lang zh-CN       # Force display language
```

## Multi-language UI

`pms-inspector` speaks 8 languages: **en, zh-CN, zh-TW, ja, ko, fr, de, es**. It auto-detects the display language from (in priority):

1. `--lang <code>` CLI flag
2. `~/.claude/settings.json` → `language` field (also accepts local names like `"简体中文"`, `"日本語"`, `"français"`)
3. `$LC_ALL` / `$LANG` / `$LANGUAGE` env vars
4. Fallback to `en`

You can also run the script directly, without installing as a plugin:

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## Example output (abridged)

```
═══ Claude Code Context Inspector ═══
Language: en (override via --lang, e.g. --lang zh-CN)

Set in: ~/.claude/settings.json
  context window: 200,000 tokens (~800,000 chars)
  skillListingBudgetFraction = 0.15
     ↳ fraction of ctx reserved for skill listing (CC setting; default 0.01)
     ↳ budget 120,000 chars (15.00% of ctx)
  skillListingMaxDescChars = 1536
     ↳ per-skill description char cap (CC setting; default 1536)
  enabled plugins: claude-mem, ecc, andrej-karpathy-skills, pms-inspector

┌─ Overview ───────────────────────────────────────────────────────┐
│ Skills :  295   Agents :   67   MCP :   2   Hooks :    2         │
└──────────────────────────────────────────────────────────────────┘

┌─ Skill listing char budget ──────────────────────────────────────┐
│ Full (name+desc, uncut)             18,807 tokens / 75,228 chars │
│ After per-cap (≤1536/skill)         18,807 tokens / 75,228 chars │
│ Budget (0.15 × ctx)                30,000 tokens / 120,000 chars │
│ Final injected into system prompt   18,807 tokens / 75,228 chars │
│ Percent of ctx window                                      9.40% │
└──────────────────────────────────────────────────────────────────┘

┌─ Skill description load status ──────────────────────────────────┐
│ ✅ Full                                295 (100.00%) ==========  │
│ ✂  Truncated by MaxDescChars             0 (  0.00%)             │
│ ⚠  Compressed by BudgetFraction          0 (  0.00%)             │
│ ❌ Name only                             0 (  0.00%)             │
│ ·  No description                        0 (  0.00%)             │
└──────────────────────────────────────────────────────────────────┘
```

## Safety

- Read-only. Never writes to `~/.claude/settings.json` or anything else.
- Does not read your `ANTHROPIC_AUTH_TOKEN` or any auth field — only the loadout-relevant keys.
- Zero npm dependencies. Pure Node 18+ builtins (`fs`, `path`, `os`).
- Cross-platform (macOS, Linux, Windows).

## Hacking / Forking

If you fork and rename this plugin, remember to update **five** places consistently — otherwise `/plugin install` will silently pick up the wrong name:

| File | Field |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | filename + frontmatter `name` |

Grep helper:

```
grep -rn "pms-inspector" .
```

## License

MIT — see [LICENSE](./LICENSE).
