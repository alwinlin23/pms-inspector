# pms-inspector

[English](../README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Français](./README.fr.md) · **Deutsch** · [Español](./README.es.md)

**P/M/S = Plugin / MCP / Skill Inspector (Plugin-/MCP-/Skill-Inspektor).**

Ein Claude-Code-Plugin ohne Abhängigkeiten, das exakt zeigt, was deine Sitzung in den System-Prompt lädt ── jedes aktivierte Plugin, jeden MCP-Server, jeden Skill, jeden Agent und jeden Hook ── mit Byte- und Token-Rechnung sowie konkreten Optimierungsvorschlägen, die per Klick angewendet werden können.

## Warum

Claude Code lädt automatisch jeden Skill jedes aktivierten Plugins. Bei einem vollen Setup (z. B. `ecc` + `claude-mem`, ~300 Skills auf der Platte) komprimiert der Standardwert `skillListingBudgetFraction: 0.01` die Skill-Beschreibungen still auf **nur den Namen**, und du siehst nichts davon. `/pms-inspector` sagt dir:

- Wie viele Plugins / MCP-Server / Skills / Agents / Hooks aktiv sind.
- Wie viele Bytes und Tokens jede Kategorie kostet.
- Den Ladezustand pro Skill in vier Klassen:
  - **full** ── Beschreibung vollständig geladen.
  - **desc-truncated** ── durch `skillListingMaxDescChars` gekappt.
  - **budget-compressed** ── durch den globalen `skillListingBudgetFraction` komprimiert.
  - **name-only** ── Beschreibung vollständig verworfen, nur der Slug bleibt.
- Wie viel Prozent des angenommenen Kontextfensters (Standard 200k) verbraucht wird.
- Konkrete Stellschrauben: `skillListingBudgetFraction` erhöhen, `skillListingMaxDescChars` senken oder den größten Verbraucher deaktivieren.

Dies ist **kein** Ersatz für `/context`. `/context` zeigt den *Laufzeit*zustand (was aktuell im Gespräch steckt). `/pms-inspector` liest deine Konfiguration von der Festplatte und sagt voraus, was die **nächste** Sitzung laden wird.

## Installation

```
/plugin marketplace add https://github.com/alwinlin23/pms-inspector
/plugin install pms-inspector@pms-inspector
```

Dann in einer neuen Claude-Code-Sitzung:

```
/pms-inspector
```

## Verwendung

```
/pms-inspector                    # Menschenlesbare Zusammenfassung (Sprache automatisch)
/pms-inspector --json             # Maschinenlesbares JSON
/pms-inspector --ctx 200000       # Angenommenes Kontextfenster überschreiben
/pms-inspector --verbose          # Aufschlüsselung pro Skill
/pms-inspector --lang de          # Anzeigesprache erzwingen
/pms-inspector --apply <plan-id>  # Vorgeschlagenen Optimierungsplan anwenden (siehe unten)
```

## Interaktives Tuning

Wenn der Report erkennt, dass das Budget entweder **überläuft** (einzelne Skills fallen auf name-only zurück) oder deutlich **überdimensioniert** ist (Budget mehr als doppelt so groß wie tatsächlich benötigt), öffnet Claude Code ein Auswahlfenster mit den vom Skript berechneten konkreten Plänen. Bei Auswahl wird das Skript mit `--apply <plan-id>` erneut ausgeführt und schreibt **nur diesen einen Schlüssel** in `~/.claude/settings.json`.

- Vor jedem Schreibvorgang wird automatisch ein `.bak.<ISO-Zeitstempel>`-Backup erzeugt.
- `ANTHROPIC_AUTH_TOKEN` und alle anderen Einstellungen bleiben unangetastet.
- Änderungen wirken beim **nächsten** Start von Claude Code ── der System-Prompt wird beim Start zusammengebaut, nicht pro Turn.

## Mehrsprachige UI

`pms-inspector` spricht 8 Sprachen: **en, zh-CN, zh-TW, ja, ko, fr, de, es**. Die Anzeigesprache wird nach folgender Priorität automatisch erkannt:

1. CLI-Flag `--lang <code>`
2. Feld `language` in `~/.claude/settings.json` (akzeptiert auch lokale Namen wie `"简体中文"`, `"日本語"`, `"français"`)
3. Umgebungsvariablen `$LC_ALL` / `$LANG` / `$LANGUAGE`
4. Fallback auf `en`

Du kannst das Skript auch ohne Plugin-Installation direkt ausführen:

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## Beispielausgabe (gekürzt)

```
═══ Claude-Code-Kontext-Inspektor ═══
Sprache: de (mit --lang überschreibbar, z. B. --lang en)

Konfiguriert in: ~/.claude/settings.json
  Kontextfenster: 200,000 Tokens (~800,000 Zeichen)
  skillListingBudgetFraction = 0.099
     ↳ Anteil des ctx für die Skill-Liste (CC-Einstellung; Standard 0.01)
     ↳ Budget 79,200 Zeichen (9.90% des ctx)
  skillListingMaxDescChars = 1536
     ↳ Zeichenobergrenze pro Skill-Beschreibung (CC-Einstellung; Standard 1536)
  Aktive Plugins: claude-mem, ecc, andrej-karpathy-skills, pms-inspector
```

## Sicherheit

- Der Standardaufruf ist nur lesend. `--apply <plan-id>` ist der **einzige** Codepfad, der irgendwo schreibt, und patcht nur einen Zielschlüssel in `~/.claude/settings.json` (`skillListingBudgetFraction`, `skillListingMaxDescChars` oder einen Eintrag in `enabledPlugins`). Vor jeder Änderung wird ein `.bak.<ISO-Zeitstempel>`-Snapshot geschrieben.
- Liest weder `ANTHROPIC_AUTH_TOKEN` noch andere Auth-Felder ── nur die für den Ladevorgang relevanten Schlüssel.
- Null npm-Abhängigkeiten. Reine Node-18+-Builtins (`fs`, `path`, `os`).
- Plattformübergreifend (macOS, Linux, Windows).

## Fork / Umbenennen

Wenn du das Plugin forkst und umbenennst, aktualisiere **fünf** Stellen konsistent ── sonst nimmt `/plugin install` still den falschen Namen:

| Datei | Feld |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | Dateiname + `name` im Frontmatter |

Grep-Prüfung:

```
grep -rn "pms-inspector" .
```

## Lizenz

MIT ── siehe [LICENSE](../LICENSE).
