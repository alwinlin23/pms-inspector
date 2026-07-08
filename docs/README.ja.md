# pms-inspector

[English](../README.md) · [简体中文](./README.zh-simple.md) · [繁體中文](./README.zh-traditional.md) · **日本語** · [한국어](./README.ko.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Español](./README.es.md)

**P/M/S = Plugin / MCP / Skill Inspector(プラグイン/MCP/スキル検査ツール)。**

依存ゼロの Claude Code プラグインです。現在のセッションがシステムプロンプトへ何を注入しているのか ── 有効なプラグイン、MCP サーバー、スキル、エージェント、フックのすべて ── をバイト数と token 数の内訳付きで正確に表示し、そのままワンクリックで適用できる調整プランを提示します。

## なぜ必要か

Claude Code は有効化されたすべてのプラグインから、すべてのスキルを自動的にロードします。プラグインを多く入れた環境(例:`ecc` + `claude-mem`、ディスク上に約 300 スキル)ではデフォルトの `skillListingBudgetFraction: 0.01` によってスキル説明が**名前だけ**まで無音で圧縮され、状況が全く見えなくなります。`/pms-inspector` は次を教えてくれます:

- 有効なプラグイン / MCP サーバー / スキル / エージェント / フックの数。
- 各カテゴリのバイト数と token 数。
- スキルごとのロード状態(4 段階):
  - **full** ── 説明が完全にロード済み。
  - **desc-truncated** ── `skillListingMaxDescChars` で切り詰められた。
  - **budget-compressed** ── グローバルな `skillListingBudgetFraction` で圧縮された。
  - **name-only** ── 説明が完全に破棄され、slug のみ残った。
- 想定コンテキストウィンドウ(既定 200k)のうち何 % を消費しているか。
- 具体的な調整ノブ:`skillListingBudgetFraction` を上げる、`skillListingMaxDescChars` を下げる、最も重いプラグインを無効化する。

これは `/context` の代替では**ありません**。`/context` は*ランタイム*状態(現在の会話に何が入っているか)を表示します。`/pms-inspector` はディスク上の設定を読み、**次の**セッションで何がロードされるかを予測します。

## インストール

```
/plugin marketplace add https://github.com/alwinlin23/pms-inspector
/plugin install pms-inspector@pms-inspector
```

新しい Claude Code セッションで:

```
/pms-inspector
```

## 使い方

```
/pms-inspector                    # 人間向けサマリー(言語を自動検出)
/pms-inspector --json             # 機械可読 JSON
/pms-inspector --ctx 200000       # 想定コンテキストウィンドウを上書き
/pms-inspector --verbose          # スキルごとの詳細
/pms-inspector --lang ja          # 表示言語を強制
/pms-inspector --apply <plan-id>  # 提案された調整プランを適用(下記参照)
```

## 対話的な調整

予算が**オーバーフロー**(一部スキルが name-only に落ちる)または明らかに**過大**(実際に必要な量の 2 倍以上)と判定された場合、Claude Code はスクリプトが計算した具体的なプランを列挙する選択ウィンドウをポップアップします。選択すると `--apply <plan-id>` でスクリプトが再実行され、`~/.claude/settings.json` の**その 1 キーだけ**を書き換えます。

- 書き込みの前に自動で `.bak.<ISO タイムスタンプ>` バックアップを作成します。
- `ANTHROPIC_AUTH_TOKEN` を含む他のすべての設定は一切触りません。
- 変更は**次回**の Claude Code 起動時に有効になります ── システムプロンプトはターンごとではなく起動時に組み立てられるためです。

## 多言語 UI

`pms-inspector` は 8 言語対応:**en, zh-CN, zh-TW, ja, ko, fr, de, es**。表示言語は次の優先順で自動検出されます:

1. `--lang <code>` CLI フラグ
2. `~/.claude/settings.json` の `language` フィールド(`"简体中文"`、`"日本語"`、`"français"` のような現地名称も受け付けます)
3. 環境変数 `$LC_ALL` / `$LANG` / `$LANGUAGE`
4. `en` へフォールバック

プラグインを入れず、スクリプトを直接実行することも可能です:

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## 出力例(抜粋)

```
═══ Claude Code コンテキスト検査ツール ═══
表示言語: ja (--lang で上書き可、例: --lang en)

設定場所: ~/.claude/settings.json
  コンテキストウィンドウ: 200,000 tokens (~800,000 文字)
  skillListingBudgetFraction = 0.099
     ↳ ctx のうちスキル一覧に割り当てる比率(CC 設定;既定 0.01)
     ↳ 予算 79,200 文字 (ctx の 9.90%)
  skillListingMaxDescChars = 1536
     ↳ スキル 1 件あたりの説明文字上限(CC 設定;既定 1536)
  有効なプラグイン: claude-mem, ecc, andrej-karpathy-skills, pms-inspector
```

## 安全性

- デフォルト実行は読み取り専用です。`--apply <plan-id>` が**唯一**書き込みを行うコードパスであり、書き込むのは `~/.claude/settings.json` 内の対象 1 キー(`skillListingBudgetFraction`、`skillListingMaxDescChars`、または `enabledPlugins` の 1 項目)のみです。書き込み前に `.bak.<ISO タイムスタンプ>` スナップショットを必ず作成します。
- `ANTHROPIC_AUTH_TOKEN` や認証系フィールドは一切読みません ── 読み込むのはロードに関わるキーだけです。
- npm 依存ゼロ。純粋な Node 18+ ビルトイン(`fs`、`path`、`os`)。
- クロスプラットフォーム(macOS、Linux、Windows)。

## Fork / 改造

プラグインを fork してリネームする場合、**5 箇所**を必ず同時に更新してください ── 1 箇所でも漏れると `/plugin install` は違う名前を静かに拾ってしまいます:

| ファイル | フィールド |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | ファイル名 + frontmatter の `name` |

Grep で確認:

```
grep -rn "pms-inspector" .
```

## ライセンス

MIT ── [LICENSE](../LICENSE) を参照。
