# pms-inspector

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · **Français** · [Deutsch](./README.de.md) · [Español](./README.es.md)

**P/M/S = Plugin / MCP / Skill Inspector (Inspecteur de plugins / MCP / skills).**

Un plugin Claude Code sans dépendance qui vous montre exactement ce que votre session injecte dans le prompt système ── chaque plugin activé, serveur MCP, skill, agent et hook ── avec le décompte en octets et tokens, ainsi que des recommandations de réglage applicables en un clic.

## Pourquoi

Claude Code charge automatiquement chaque skill de chaque plugin activé. Sur une configuration chargée (par ex. `ecc` + `claude-mem`, ~300 skills sur disque), la valeur par défaut `skillListingBudgetFraction: 0.01` compresse silencieusement les descriptions de skills **jusqu'au nom seul**, et vous n'avez aucun moyen de le voir. `/pms-inspector` vous indique :

- Le nombre de plugins / serveurs MCP / skills / agents / hooks activés.
- Combien d'octets et de tokens chaque catégorie consomme.
- L'état de chargement par skill, en quatre catégories :
  - **full** ── description intacte.
  - **desc-truncated** ── tronquée par `skillListingMaxDescChars`.
  - **budget-compressed** ── compressée par la valeur globale `skillListingBudgetFraction`.
  - **name-only** ── description entièrement supprimée, seul le slug survit.
- Quel pourcentage de la fenêtre de contexte supposée (200k par défaut) est consommé.
- Des leviers concrets : augmenter `skillListingBudgetFraction`, baisser `skillListingMaxDescChars`, ou désactiver le plus gros consommateur.

Ce n'est **pas** un remplacement de `/context`. `/context` affiche l'état *runtime* (ce qui est dans la conversation actuelle). `/pms-inspector` lit votre configuration sur disque et prédit ce que la **prochaine** session chargera.

## Installation

```
/plugin marketplace add https://github.com/alwinlin23/pms-inspector
/plugin install pms-inspector@pms-inspector
```

Puis, dans une nouvelle session Claude Code :

```
/pms-inspector
```

## Utilisation

```
/pms-inspector                    # Résumé lisible (langue auto-détectée)
/pms-inspector --json             # JSON exploitable par machine
/pms-inspector --ctx 200000       # Remplacer la fenêtre de contexte supposée
/pms-inspector --verbose          # Détail par skill
/pms-inspector --lang fr          # Forcer la langue d'affichage
/pms-inspector --apply <plan-id>  # Appliquer un plan de réglage suggéré (voir plus bas)
```

## Réglage interactif

Lorsque le rapport détecte que le budget est en **débordement** (certains skills tombent en name-only) ou clairement **surdimensionné** (budget plus de deux fois supérieur au nécessaire), Claude Code ouvre une fenêtre de choix listant les plans de réglage concrets calculés par le script. Sélectionner l'un d'eux relance le script avec `--apply <plan-id>`, qui écrit **une seule clé** dans `~/.claude/settings.json`.

- Une sauvegarde automatique `.bak.<horodatage ISO>` est créée avant chaque écriture.
- `ANTHROPIC_AUTH_TOKEN` et tous les autres paramètres restent intouchés.
- Les changements prennent effet au **prochain** lancement de Claude Code ── le prompt système est assemblé au démarrage, pas à chaque tour.

## Interface multilingue

`pms-inspector` parle 8 langues : **en, zh-CN, zh-TW, ja, ko, fr, de, es**. La langue d'affichage est auto-détectée dans cet ordre :

1. Flag CLI `--lang <code>`
2. Champ `language` dans `~/.claude/settings.json` (accepte aussi les noms locaux comme `"简体中文"`, `"日本語"`, `"français"`)
3. Variables d'environnement `$LC_ALL` / `$LANG` / `$LANGUAGE`
4. Repli sur `en`

Vous pouvez aussi exécuter le script directement, sans l'installer comme plugin :

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## Exemple de sortie (abrégé)

```
═══ Inspecteur de contexte Claude Code ═══
Langue : fr (surchargez avec --lang, par ex. --lang en)

Défini dans : ~/.claude/settings.json
  fenêtre de contexte : 200,000 tokens (~800,000 caractères)
  skillListingBudgetFraction = 0.099
     ↳ fraction du ctx réservée à la liste des skills (paramètre CC ; défaut 0.01)
     ↳ budget 79,200 caractères (9.90% du ctx)
  skillListingMaxDescChars = 1536
     ↳ limite de caractères de description par skill (paramètre CC ; défaut 1536)
  plugins activés : claude-mem, ecc, andrej-karpathy-skills, pms-inspector
```

## Sécurité

- L'invocation par défaut est en lecture seule. `--apply <plan-id>` est le **seul** chemin de code qui écrit quelque part, et il ne modifie qu'une seule clé cible dans `~/.claude/settings.json` (`skillListingBudgetFraction`, `skillListingMaxDescChars`, ou une entrée d'`enabledPlugins`). Un cliché `.bak.<horodatage ISO>` est écrit avant chaque modification.
- Ne lit pas votre `ANTHROPIC_AUTH_TOKEN` ni aucun champ d'authentification ── seulement les clés pertinentes au chargement.
- Zéro dépendance npm. Uniquement les modules intégrés Node 18+ (`fs`, `path`, `os`).
- Multi-plateforme (macOS, Linux, Windows).

## Fork / Personnalisation

Si vous forkez et renommez ce plugin, pensez à mettre à jour **cinq** emplacements de façon cohérente ── sinon `/plugin install` récupérera silencieusement le mauvais nom :

| Fichier | Champ |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | nom de fichier + `name` dans le frontmatter |

Vérification grep :

```
grep -rn "pms-inspector" .
```

## Licence

MIT ── voir [LICENSE](./LICENSE).
