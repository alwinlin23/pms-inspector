# pms-inspector

[English](../README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · **Español**

**P/M/S = Plugin / MCP / Skill Inspector (Inspector de plugins / MCP / skills).**

Un plugin de Claude Code sin dependencias que muestra exactamente qué inyecta tu sesión en el prompt del sistema ── cada plugin habilitado, servidor MCP, skill, agente y hook ── con el desglose en bytes y tokens, además de sugerencias concretas de ajuste aplicables con un clic.

## Por qué

Claude Code carga automáticamente cada skill de cada plugin habilitado. En una configuración cargada (por ejemplo `ecc` + `claude-mem`, ~300 skills en disco), el valor por defecto `skillListingBudgetFraction: 0.01` comprime silenciosamente las descripciones de skills **hasta dejar solo el nombre**, y no hay forma de darse cuenta. `/pms-inspector` te dice:

- Cuántos plugins / servidores MCP / skills / agentes / hooks están habilitados.
- Cuántos bytes y tokens consume cada categoría.
- El estado de carga por skill, en cuatro categorías:
  - **full** ── descripción cargada íntegra.
  - **desc-truncated** ── recortada por `skillListingMaxDescChars`.
  - **budget-compressed** ── comprimida por el valor global `skillListingBudgetFraction`.
  - **name-only** ── descripción totalmente descartada, solo sobrevive el slug.
- Qué porcentaje de la ventana de contexto asumida (200k por defecto) consume.
- Perillas concretas para ajustar: subir `skillListingBudgetFraction`, bajar `skillListingMaxDescChars`, o deshabilitar el que más pesa.

Esto **no** reemplaza a `/context`. `/context` muestra el estado en *tiempo de ejecución* (qué hay en la conversación actual). `/pms-inspector` lee tu configuración en disco y predice qué cargará la **próxima** sesión.

## Instalación

```
/plugin marketplace add https://github.com/alwinlin23/pms-inspector
/plugin install pms-inspector@pms-inspector
```

Luego, en una nueva sesión de Claude Code:

```
/pms-inspector
```

## Uso

```
/pms-inspector                    # Resumen legible (idioma auto-detectado)
/pms-inspector --json             # JSON procesable por máquina
/pms-inspector --ctx 200000       # Sobrescribir la ventana de contexto asumida
/pms-inspector --verbose          # Desglose por skill
/pms-inspector --lang es          # Forzar idioma de visualización
/pms-inspector --apply <plan-id>  # Aplicar un plan de ajuste sugerido (ver más abajo)
```

## Ajuste interactivo

Cuando el informe detecta que el presupuesto está en **desbordamiento** (algunas skills caen a name-only) o claramente **sobredimensionado** (presupuesto más del doble de lo necesario), Claude Code abre una ventana de selección con los planes de ajuste concretos calculados por el script. Al elegir uno, el script se reejecuta con `--apply <plan-id>`, que escribe **solamente esa clave** en `~/.claude/settings.json`.

- Antes de cada escritura se crea automáticamente una copia `.bak.<marca-de-tiempo-ISO>`.
- `ANTHROPIC_AUTH_TOKEN` y todos los demás ajustes quedan intactos.
- Los cambios surten efecto la **próxima** vez que abras Claude Code ── el prompt del sistema se ensambla al arranque, no en cada turno.

## Interfaz multilenguaje

`pms-inspector` habla 8 idiomas: **en, zh-CN, zh-TW, ja, ko, fr, de, es**. El idioma de visualización se auto-detecta en este orden:

1. Flag CLI `--lang <code>`
2. Campo `language` en `~/.claude/settings.json` (también acepta nombres locales como `"简体中文"`, `"日本語"`, `"français"`)
3. Variables de entorno `$LC_ALL` / `$LANG` / `$LANGUAGE`
4. Fallback a `en`

También puedes ejecutar el script directamente, sin instalarlo como plugin:

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## Ejemplo de salida (abreviado)

```
═══ Inspector de contexto de Claude Code ═══
Idioma: es (sobrescribible con --lang, p. ej. --lang en)

Definido en: ~/.claude/settings.json
  ventana de contexto: 200,000 tokens (~800,000 caracteres)
  skillListingBudgetFraction = 0.099
     ↳ fracción del ctx reservada para la lista de skills (ajuste CC; por defecto 0.01)
     ↳ presupuesto 79,200 caracteres (9.90% del ctx)
  skillListingMaxDescChars = 1536
     ↳ límite de caracteres de descripción por skill (ajuste CC; por defecto 1536)
  plugins habilitados: claude-mem, ecc, andrej-karpathy-skills, pms-inspector
```

## Seguridad

- La invocación por defecto es de solo lectura. `--apply <plan-id>` es la **única** ruta de código que escribe en algún lugar, y sólo modifica una clave objetivo en `~/.claude/settings.json` (`skillListingBudgetFraction`, `skillListingMaxDescChars`, o una entrada de `enabledPlugins`). Se escribe una instantánea `.bak.<marca-de-tiempo-ISO>` antes de cada cambio.
- No lee tu `ANTHROPIC_AUTH_TOKEN` ni ningún campo de autenticación ── sólo las claves relevantes para la carga.
- Cero dependencias npm. Sólo módulos nativos de Node 18+ (`fs`, `path`, `os`).
- Multiplataforma (macOS, Linux, Windows).

## Fork / Personalización

Si haces fork y renombras el plugin, actualiza **cinco** lugares de forma consistente ── de lo contrario `/plugin install` cogerá silenciosamente el nombre equivocado:

| Archivo | Campo |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | nombre del archivo + `name` en el frontmatter |

Verificación con grep:

```
grep -rn "pms-inspector" .
```

## Licencia

MIT ── ver [LICENSE](../LICENSE).
