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
/pms-inspector                    # Human-readable summary
/pms-inspector --json             # Machine-readable JSON
/pms-inspector --ctx 200000       # Override assumed context window
/pms-inspector --verbose          # Per-skill breakdown
```

You can also run the script directly, without installing as a plugin:

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## Example output (abridged)

```
Claude Code Loadout Report
──────────────────────────
Plugins enabled:      2         (ecc, claude-mem)
MCP servers:          2
Skills discovered:  294
Agents discovered:   67
Hooks configured:     6

Skill load states (skillListingBudgetFraction=0.15, maxDescChars=200):
  full             : 294  (100.0%)
  desc-truncated   :   0
  budget-compressed:   0
  name-only        :   0

Est. system-prompt cost: 18,750 tokens  (9.4% of 200k ctx)

Suggestions:
  A) You already see everything. If ctx is tight, try 0.10 → drops ~6k tokens.
  B) Lowering maxDescChars from 200 to 120 would save ~4k tokens.
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
