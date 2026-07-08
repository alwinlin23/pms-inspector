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
scripts/inspect.js               Single-file audit script — the entire runtime.
```

The command markdown does one thing — shell out to the script, with a fallback resolver for `$CLAUDE_PLUGIN_ROOT`:

```bash
PMS_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -td "$HOME/.claude/plugins/cache/pms-inspector/pms-inspector"/*/ 2>/dev/null | head -1)}"
node "${PMS_ROOT%/}/scripts/inspect.js" $ARGUMENTS
```

**Why the fallback is required (verified 2026-07-08)**: Claude Code sets `$CLAUDE_PLUGIN_ROOT` for slash-command *frontmatter substitution*, but it does not always propagate into the Bash tool's subprocess environment — `env | grep CLAUDE_PLUGIN_ROOT` inside the tool returns nothing, and `node "$CLAUDE_PLUGIN_ROOT/scripts/inspect.js"` collapses to `/scripts/inspect.js` (module-not-found). The fallback walks the CC-mandated cache path `~/.claude/plugins/cache/<plugin-name>/<plugin-name>/<version>/`. This is a lighter version of ecc's `resolve-ecc-root` node oneliner and serves the same purpose.

## The one script

`scripts/inspect.js` is ~400 lines of pure Node (fs / path / os only — zero npm deps). Pipeline:

```
parseArgs → findEnabledPluginRoots → collectSkills / collectAgents / collectMcp / collectHooks
         → applyBudget (four-way skill classifier) → build (assemble report)
         → suggest → renderHuman | renderJson
```

Key constants at top of file:
- `DEFAULT_FRACTION = 0.01` — Claude Code default `skillListingBudgetFraction`. At this value on a busy plugin setup, all skill descriptions collapse to name-only.
- `DEFAULT_MAX_DESC = 1536` — Claude Code default `skillListingMaxDescChars`.
- `DEFAULT_CTX_TOKENS = 200000` — assumed context window; user-overridable via `--ctx`.
- `CHARS_PER_TOKEN = 4` — coarse token estimate used everywhere.

The four-way skill load state produced by `applyBudget` is the whole point of the tool. Every UI, JSON field, and suggestion routes back to this classification:

| State | Meaning |
|---|---|
| `full` | description loaded intact |
| `desc-truncated` | capped by `skillListingMaxDescChars` |
| `budget-compressed` | squeezed by global `skillListingBudgetFraction` |
| `name-only` | description dropped, slug only |

## Reads (never writes)

The script reads and never writes:
- `~/.claude/settings.json` — only these keys: `enabledPlugins`, `skillListingBudgetFraction`, `skillListingMaxDescChars`, `mcpServers`, `hooks`. It **must not** touch `ANTHROPIC_AUTH_TOKEN` or any auth field.
- `~/.claude/plugins/cache/<owner>/<plugin>/<version>/**/{SKILL.md,agents/*.md,.claude-plugin/plugin.json}`.

## Common commands

```bash
# Smoke tests (run these on any change to inspect.js)
node scripts/inspect.js                    # human-readable report
node scripts/inspect.js --json             # JSON (must remain machine-parseable)
node scripts/inspect.js --verbose          # per-skill breakdown
node scripts/inspect.js --ctx 128000       # override assumed context window

# Local install test (verify slash command wiring end to end)
# In a Claude Code session:
#   /plugin marketplace add /Users/pgg/qa/claude/pms-inspector
#   /plugin install pms-inspector@pms-inspector
#   /pms-inspector

# Rename hygiene — after any rename, must return zero hits:
grep -rn "cc-context-inspector\|context-inspect" .
```

There are no build, lint, or test frameworks. Verification = running the script and reading the report.

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
