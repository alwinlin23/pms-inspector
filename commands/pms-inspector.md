---
name: pms-inspector
description: Inspect what your Claude Code session actually loads — plugins, MCP servers, skills, agents, hooks — with byte/token math and tuning suggestions for skillListingBudgetFraction and skillListingMaxDescChars.
allowed-tools: Bash
---

# pms-inspector

Static disk audit of what your Claude Code session pulls into the system prompt: enabled plugins, MCP servers, skills, agents, and hooks. Reports byte/token cost per category, classifies every skill into one of four load states (full / desc-truncated / budget-compressed / name-only), estimates % of the context window consumed, and prints concrete tuning knobs.

This is **not** the built-in `/context` command. `/context` shows runtime state of the current session (messages, files read). `/pms-inspector` reads your on-disk configuration and predicts what the *next* session will load.

## Usage

```
/pms-inspector                    # Human-readable summary (auto-detects language)
/pms-inspector --json             # Machine-readable JSON
/pms-inspector --ctx 200000       # Override assumed context window (default 200000)
/pms-inspector --verbose          # Per-skill breakdown
/pms-inspector --lang zh-CN       # Force display language (en / zh-CN / zh-TW / ja / ko / fr / de / es)
```

When the report finds the budget is either overflowing or clearly oversized,
Claude Code will pop up a choice window asking whether to apply one of the
suggested tuning plans. Picking a plan writes only that one key in
`~/.claude/settings.json` (with an automatic `.bak.<timestamp>` backup); the
auth token and everything else are left untouched. Changes take effect the
**next** time you launch Claude Code, since the system prompt is assembled at
startup.

## Implementation

Run the inspector script; redirect its stdout to a temp file so the Bash
tool's own output box stays empty (avoids double-rendering the report body
next to the assistant message):

```bash
PMS_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -td "$HOME/.claude/plugins/cache/pms-inspector/pms-inspector"/*/ 2>/dev/null | head -1)}"
OUT="$(mktemp -t pms-inspector.XXXXXX)"
node "${PMS_ROOT%/}/scripts/inspect.js" $ARGUMENTS > "$OUT" 2>&1
echo "$OUT"
```

The Bash tool will print only the temp-file path. `$CLAUDE_PLUGIN_ROOT` is
set by Claude Code at slash-command time, but is not always propagated into
the Bash tool subprocess. The fallback picks the latest installed version
under `~/.claude/plugins/cache/pms-inspector/pms-inspector/`.

## What to Do

1. Execute the script above with any `$ARGUMENTS` the user supplied. The
   Bash tool prints only the temp-file path — take that path, `Read` the
   file, and you have the full report text.
2. **Parse** the final `<pms-plans>{"verdict":"...","plans":[...]}</pms-plans>`
   JSON line from the report (last such block; ignore any inside code
   fences quoted earlier). Then post the report to the user as your own
   message body, verbatim, with the entire `<pms-plans>...</pms-plans>`
   trailing block **stripped out**. Do not summarize, rewrap, or rewrite
   — the report is already formatted (box-drawing chars + visual-width
   padding rely on being shown as-is inside a plain fenced code block).
   Wrap the report in a fenced code block so terminal box-drawing chars
   render.
3. Based on the parsed verdict:
   - `verdict === "ok"` → done. Do not ask anything further, do not print any
     extra message.
   - `verdict === "overflow"` or `"oversized"` → **and if the user did NOT
     already pass a flag other than `--lang`/`--ctx`/`--verbose`** → call the
     `AskUserQuestion` tool directly, with **no lead-in text** (no "弹窗:",
     no "Please choose:", no summary sentence — the report already told the
     user what's up). One question: "Apply one of the suggested tuning
     plans?". Options are the `plans[]` entries (use each plan's `label` as
     the option label; each plan's `cost` field can go in the option
     description) plus a "Keep current setting" option. After the user
     picks, re-run the script with `--apply <id>` using the chosen plan's
     `id`; then print the one-line apply result (that line is short and
     user-facing, so print it verbatim).
4. If the user asked a follow-up question ("what should I turn off?", "why
   is my ctx so full?"), answer it using the numbers from the report, not
   from memory.
5. Never propose plans that were not present in the parsed `plans[]` — the
   script already filtered infeasible ones.
6. `--apply` writes `~/.claude/settings.json` (auto-backup `.bak.<ts>` is
   created; auth token & other keys untouched). Changes take effect on the
   **next** Claude Code session, not the current one — say so.
