# pms-inspector

[English](../README.md) · [简体中文](./README.zh-simple.md) · **繁體中文** · [日本語](./README.ja.md) · [한국어](./README.ko.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Español](./README.es.md)

**P/M/S = Plugin / MCP / Skill Inspector(外掛/MCP/Skill 檢查器)。**

一個零相依的 Claude Code 外掛,精確告訴你目前 session 往系統提示裡塞了些什麼 —— 每個已啟用的外掛、MCP 伺服器、skill、agent、hook —— 附帶位元組/token 計算,以及可以一鍵套用的調校建議。

## 為什麼需要

Claude Code 會自動把每個已啟用外掛的每個 skill 都載入系統提示。當你的設定比較滿(例如同時裝了 `ecc` + `claude-mem`,磁碟上 ~300 個 skill),預設的 `skillListingBudgetFraction: 0.01` 會悄悄把 skill 描述壓縮到**只剩名字**,而且你根本看不出發生了什麼。`/pms-inspector` 會告訴你:

- 有多少外掛 / MCP 伺服器 / skill / agent / hook 處於啟用狀態。
- 每一類佔了多少位元組和 token。
- 每個 skill 的載入狀態,分為四檔:
  - **full** —— 描述完整載入。
  - **desc-truncated** —— 被 `skillListingMaxDescChars` 截斷。
  - **budget-compressed** —— 被全域的 `skillListingBudgetFraction` 壓縮。
  - **name-only** —— 描述被完全丟棄,只剩 slug 名字。
- 佔了假定上下文視窗(預設 200k)百分之多少。
- 具體的調校旋鈕:把 `skillListingBudgetFraction` 調高、把 `skillListingMaxDescChars` 調低、或關掉最佔用的那個外掛。

這**不是** `/context` 的替代品。`/context` 展示的是*執行時*狀態(目前對話裡載入了什麼),而 `/pms-inspector` 透過讀取磁碟上的設定,預測**下一個** session 會載入什麼。

## 安裝

```
/plugin marketplace add https://github.com/alwinlin23/pms-inspector
/plugin install pms-inspector@pms-inspector
```

然後開一個新的 Claude Code session:

```
/pms-inspector
```

## 用法

```
/pms-inspector                    # 人類可讀摘要(自動偵測語言)
/pms-inspector --json             # 機器可解析 JSON
/pms-inspector --ctx 200000       # 覆寫假定的上下文視窗
/pms-inspector --verbose          # 每個 skill 的詳細分類
/pms-inspector --lang zh-TW       # 強制顯示語言
/pms-inspector --apply <plan-id>  # 套用某個建議的調校方案(見下)
```

## 互動式調校

當報告發現預算**溢位**(有 skill 掉到 name-only)或明顯**過大**(預算比實際用得上的還多一倍以上)時,Claude Code 會彈一個選擇視窗,列出腳本計算好的具體調校方案。選中一個之後會用 `--apply <plan-id>` 重跑腳本,只會把**那一個鍵**寫進 `~/.claude/settings.json`。

- 每次寫入前會自動生成一份 `.bak.<ISO 時間戳>` 備份。
- `ANTHROPIC_AUTH_TOKEN` 以及其他所有設定都不會被動。
- 變更在**下一次**啟動 Claude Code 時生效 —— 系統提示是啟動時組裝的,不是每回合都重算。

## 多語言 UI

`pms-inspector` 支援 8 種語言:**en, zh-CN, zh-TW, ja, ko, fr, de, es**。顯示語言按優先級自動偵測:

1. `--lang <code>` 命令列參數
2. `~/.claude/settings.json` 裡的 `language` 欄位(也接受在地名稱,如 `"简体中文"`、`"日本語"`、`"français"`)
3. 環境變數 `$LC_ALL` / `$LANG` / `$LANGUAGE`
4. 退回 `en`

你也可以不裝外掛,直接跑腳本:

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## 範例輸出(節錄)

```
═══ Claude Code 上下文載入檢查器 ═══
顯示語言: zh-TW (可透過 --lang 覆寫,例如 --lang en)

設定位置: ~/.claude/settings.json
  上下文視窗: 200,000 tokens (~800,000 字元)
  skillListingBudgetFraction = 0.099
     ↳ skill 清單佔 ctx 的比例(CC 設定;預設 0.01)
     ↳ 預算 79,200 字元 (佔 ctx 的 9.90%)
  skillListingMaxDescChars = 1536
     ↳ 單個 skill 描述字元上限(CC 設定;預設 1536)
  已啟用外掛: claude-mem, ecc, andrej-karpathy-skills, pms-inspector
```

## 安全性

- 預設呼叫唯讀。`--apply <plan-id>` 是**唯一**會寫檔的程式路徑,並且只會 patch `~/.claude/settings.json` 裡的一個目標鍵(`skillListingBudgetFraction`、`skillListingMaxDescChars`,或 `enabledPlugins` 裡的一項)。每次修改前都會生成一份 `.bak.<ISO 時間戳>` 快照。
- 不讀取 `ANTHROPIC_AUTH_TOKEN` 或任何驗證欄位 —— 只讀跟載入相關的鍵。
- 零 npm 相依。純 Node 18+ 內建模組(`fs`、`path`、`os`)。
- 跨平台(macOS、Linux、Windows)。

## Fork / 二次開發

如果你 fork 之後要改名,記得**5 個位置同時改** —— 少改一個,`/plugin install` 就會靜默地拿錯名字:

| 檔案 | 欄位 |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | 檔名 + frontmatter 裡的 `name` |

Grep 檢查:

```
grep -rn "pms-inspector" .
```

## 授權

MIT —— 詳見 [LICENSE](../LICENSE)。
