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
/pms-inspector                    # Human-readable summary
/pms-inspector --json             # Machine-readable JSON
/pms-inspector --ctx 200000       # Override assumed context window (default 200000)
/pms-inspector --verbose          # Per-skill breakdown
```

## Implementation

Run the inspector script and show its stdout verbatim to the user:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/inspect.js" $ARGUMENTS
```

## What to Do

1. Execute the script above with any `$ARGUMENTS` the user supplied.
2. Display the stdout directly — do not summarize or rewrite it; the report is already formatted.
3. If the user asked a follow-up question ("what should I turn off?", "why is my ctx so full?"), answer it using the numbers from the report, not from memory.
