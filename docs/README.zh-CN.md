# pms-inspector

[English](../README.md) · **简体中文** · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Español](./README.es.md)

📄 **网站：** [alwinlin23.github.io/pms-inspector](https://alwinlin23.github.io/pms-inspector/)

**P/M/S = Plugin / MCP / Skill Inspector(插件/MCP/Skill 检查器)。**

一个零依赖的 Claude Code 插件,精确告诉你当前 session 往系统提示里塞了些什么 —— 每个已启用的插件、MCP 服务器、skill、agent、hook —— 附带字节/token 计算,以及可以一键应用的调优建议。

## 为什么需要

Claude Code 会自动把每个已启用插件的每个 skill 都载入系统提示。当你的配置比较满(比如同时装了 `ecc` + `claude-mem`,磁盘上 ~300 个 skill),默认的 `skillListingBudgetFraction: 0.01` 会悄悄把 skill 描述压缩到**只剩名字**,而且你根本看不出发生了什么。`/pms-inspector` 会告诉你:

- 有多少插件 / MCP 服务器 / skill / agent / hook 处于启用状态。
- 每一类占了多少字节和 token。
- 每个 skill 的加载状态,分为四档:
  - **full** —— 描述完整加载。
  - **desc-truncated** —— 被 `skillListingMaxDescChars` 截断。
  - **budget-compressed** —— 被全局的 `skillListingBudgetFraction` 压缩。
  - **name-only** —— 描述被完全丢弃,只剩 slug 名字。
- 占了假定上下文窗口(默认 200k)百分之多少。
- 具体的调优旋钮:把 `skillListingBudgetFraction` 调高、把 `skillListingMaxDescChars` 调低、或者关掉最占用的那个插件。

这**不是** `/context` 的替代品。`/context` 展示的是*运行时*状态(当前对话里加载了什么),而 `/pms-inspector` 通过读取磁盘上的配置,预测**下一个** session 会加载什么。

## 一个设置的天壤之别 — Before / after

Claude Code 默认的 `skillListingBudgetFraction: 0.01` 几乎必然把每个 skill 的描述压缩到只剩 slug(名字)。在 318 个 skill 的配置下,差别在于:模型看到的是 318 句它能**推理**的话,还是 318 个它只能**猜**的名字:

**Before —  `skillListingBudgetFraction: 0.01`  (Claude Code 默认值)**

```
skills   318 discovered
  name-only    318   ← 100 %
  full           0

model sees:  318 slugs, zero context
est. cost:   ~ 2.0 k tokens / turn
```

**After —  `skillListingBudgetFraction: 0.15`**

```
skills   318 discovered
  full         318   ← 100 %
  name-only      0

model sees:  318 slugs + full descriptions
est. cost:   ~ 18.9 k tokens / turn   (200k 窗口的 9.4 %)
```

差值约 **17k tokens / 轮** —— 花得非常值,因为正是这些 token 让模型能判断该调哪个 skill。

### 为什么 "name-only" 是坏的 —— 人肉都判断不了

下面就是当一个 skill 落到 `name-only` 时模型看到的东西。请你自己看这些 slug,问一下自己:*哪个该在什么时候用?*

- `smart-outline`
- `observation-context`
- `session-start-context`
- `hookify`
- `prime-corpus`
- `smart-search`

你判断不了。Claude 也判断不了。`smart-outline` 可能是从文档里提取标题,也可能是**在写代码前先梳理方案**。同一个 slug,两种完全不同的触发场景。乘以 318 之后,harness 干脆不再路由到 skill —— 它把活直接在主 context 里干完,又贵又慢,你精心写的每一个 skill 都跟没装一样。

**描述**才是触发句 —— 那句告诉模型*什么时候该开火*的话。删掉之后,slug 就只是一张罗夏墨迹图。

修复只是 `~/.claude/settings.json` 里的一行:

```jsonc
{
  "skillListingBudgetFraction": 0.15   // ← 原值 0.01 (CC 默认)
}
```

`/pms-inspector` 会算出适合你这套配置的确切数字,并通过 `--apply <plan-id>` 帮你写进去,写入前先做一份 `.bak.<ISO-时间戳>` 快照。

## 安装

```
/plugin marketplace add https://github.com/alwinlin23/pms-inspector
/plugin install pms-inspector@pms-inspector
/plugin reload
```

然后运行：

```
/pms-inspector
```

## 用法

```
/pms-inspector                    # 人类可读摘要(自动检测语言)
/pms-inspector --json             # 机器可解析 JSON
/pms-inspector --ctx 200000       # 覆盖假定的上下文窗口
/pms-inspector --verbose          # 每个 skill 的详细分类
/pms-inspector --lang zh-CN       # 强制显示语言
/pms-inspector --apply <plan-id>  # 应用某个建议的调优方案(见下)
```

## 交互式调优

当报告发现预算**溢出**(有 skill 掉到 name-only)或者明显**过大**(预算比实际用得上的还多一倍以上)时,Claude Code 会弹一个选择窗,列出脚本计算好的具体调优方案。选中一个之后会用 `--apply <plan-id>` 重跑脚本,只会把**那一个键**写进 `~/.claude/settings.json`。

- 每次写入前会自动生成一份 `.bak.<ISO 时间戳>` 备份。
- `ANTHROPIC_AUTH_TOKEN` 以及其他所有配置都不会被动。
- 变更在**下一次**启动 Claude Code 时生效 —— 系统提示是启动时组装的,不是每个回合都重算。

## 多语言 UI

`pms-inspector` 支持 8 种语言:**en, zh-CN, zh-TW, ja, ko, fr, de, es**。显示语言按优先级自动检测:

1. `--lang <code>` 命令行参数
2. `~/.claude/settings.json` 里的 `language` 字段(也接受本地名称,如 `"简体中文"`、`"日本語"`、`"français"`)
3. 环境变量 `$LC_ALL` / `$LANG` / `$LANGUAGE`
4. 回退到 `en`

你也可以不装插件,直接跑脚本:

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## 示例输出(截取)

```
═══ Claude Code 上下文加载检查器 ═══
显示语言: zh-CN (可通过 --lang 覆盖,例如 --lang en)

配置位置: ~/.claude/settings.json
  上下文窗口: 200,000 tokens (~800,000 字符)
  skillListingBudgetFraction = 0.099
     ↳ skill 清单占 ctx 的比例(CC 配置;默认 0.01)
     ↳ 预算 79,200 字符 (占 ctx 的 9.90%)
  skillListingMaxDescChars = 1536
     ↳ 单个 skill 描述字符上限(CC 配置;默认 1536)
  已启用插件: claude-mem, ecc, andrej-karpathy-skills, pms-inspector

┌─ 对象总览 ───────────────────────────────────────────────────────┐
│ Skills :  295   Agents :   67   MCP :   2   Hooks :    2         │
└──────────────────────────────────────────────────────────────────┘

┌─ Skill 清单字符预算 ─────────────────────────────────────────────┐
│ 全量 (name+desc, 未裁剪)             18,807 tokens / 75,228 字符 │
│ per-cap 后 (≤1536/skill)             18,807 tokens / 75,228 字符 │
│ 预算 (0.099 × ctx)                   19,800 tokens / 79,200 字符 │
│ 最终注入系统提示                     18,807 tokens / 75,228 字符 │
│ 占 ctx 窗口                                                9.40% │
└──────────────────────────────────────────────────────────────────┘

┌─ Skill 描述加载状态 ─────────────────────────────────────────────┐
│ ✅ 完整加载                            295 (100.00%) ==========  │
│ ✂  被 MaxDescChars 截断                  0 (  0.00%)             │
│ ⚠  被 BudgetFraction 压缩                0 (  0.00%)             │
│ ❌ 仅剩名称                              0 (  0.00%)             │
│ ·  本就无描述                            0 (  0.00%)             │
└──────────────────────────────────────────────────────────────────┘
```

## 安全性

- 默认调用只读。`--apply <plan-id>` 是**唯一**会写文件的代码路径,并且只会 patch `~/.claude/settings.json` 里的一个目标键(`skillListingBudgetFraction`、`skillListingMaxDescChars`,或者 `enabledPlugins` 里的一项)。每次修改前都会生成一份 `.bak.<ISO 时间戳>` 快照。
- 不读取 `ANTHROPIC_AUTH_TOKEN` 或任何鉴权字段 —— 只读跟加载相关的键。
- 零 npm 依赖。纯 Node 18+ 内置模块(`fs`、`path`、`os`)。
- 跨平台(macOS、Linux、Windows)。

## Fork / 二次开发

如果你 fork 之后要改名,记得**5 个位置同时改** —— 少改一个,`/plugin install` 就会静默地拿错名字:

| 文件 | 字段 |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | 文件名 + frontmatter 里的 `name` |

Grep 检查:

```
grep -rn "pms-inspector" .
```

## 许可证

MIT —— 详见 [LICENSE](../LICENSE)。
