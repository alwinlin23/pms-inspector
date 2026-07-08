# pms-inspector

[English](../README.md) · [简体中文](./README.zh-simple.md) · [繁體中文](./README.zh-traditional.md) · [日本語](./README.ja.md) · **한국어** · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Español](./README.es.md)

**P/M/S = Plugin / MCP / Skill Inspector(플러그인/MCP/스킬 인스펙터).**

의존성 제로의 Claude Code 플러그인. 현재 세션이 시스템 프롬프트에 무엇을 밀어 넣는지 ── 활성화된 모든 플러그인, MCP 서버, 스킬, 에이전트, 훅 ── 를 바이트/토큰 단위로 정확히 보여주고, 원클릭으로 적용 가능한 튜닝 제안을 제시합니다.

## 왜 필요한가

Claude Code 는 활성화된 모든 플러그인의 모든 스킬을 자동으로 시스템 프롬프트에 로드합니다. 플러그인이 많은 환경(예: `ecc` + `claude-mem`, 디스크에 ~300 개 스킬)에서는 기본값 `skillListingBudgetFraction: 0.01` 이 스킬 설명을 **이름만 남기고** 조용히 압축해 버려, 무슨 일이 벌어졌는지 보이지 않습니다. `/pms-inspector` 는 이런 것을 알려줍니다:

- 활성화된 플러그인 / MCP 서버 / 스킬 / 에이전트 / 훅 개수.
- 각 카테고리가 차지하는 바이트 및 토큰 수.
- 스킬별 로드 상태 (4단계):
  - **full** ── 설명이 온전히 로드됨.
  - **desc-truncated** ── `skillListingMaxDescChars` 로 잘림.
  - **budget-compressed** ── 글로벌 `skillListingBudgetFraction` 로 압축됨.
  - **name-only** ── 설명이 완전히 버려지고 slug 만 남음.
- 가정된 컨텍스트 창(기본 200k)의 몇 % 를 차지하는지.
- 구체적인 튜닝 노브: `skillListingBudgetFraction` 을 올리기, `skillListingMaxDescChars` 를 낮추기, 가장 무거운 플러그인 비활성화하기.

이것은 `/context` 의 대체품이 **아닙니다**. `/context` 는 *런타임* 상태(현재 대화에 무엇이 있는지)를 보여줍니다. `/pms-inspector` 는 디스크의 설정을 읽어 **다음** 세션이 무엇을 로드할지 예측합니다.

## 설치

```
/plugin marketplace add https://github.com/alwinlin23/pms-inspector
/plugin install pms-inspector@pms-inspector
```

새 Claude Code 세션에서:

```
/pms-inspector
```

## 사용법

```
/pms-inspector                    # 사람이 읽는 요약 (언어 자동 감지)
/pms-inspector --json             # 기계 파싱용 JSON
/pms-inspector --ctx 200000       # 가정 컨텍스트 창 재정의
/pms-inspector --verbose          # 스킬별 상세 분류
/pms-inspector --lang ko          # 표시 언어 강제
/pms-inspector --apply <plan-id>  # 제안된 튜닝 플랜 적용 (아래 참조)
```

## 대화식 튜닝

리포트가 예산이 **오버플로우**(일부 스킬이 name-only 로 떨어짐)이거나 명백히 **과대**(실제 필요량의 두 배 이상)라고 판단하면, Claude Code 는 스크립트가 계산한 구체적인 튜닝 플랜을 나열하는 선택 창을 띄웁니다. 하나를 선택하면 `--apply <plan-id>` 로 스크립트를 재실행하고, `~/.claude/settings.json` 의 **해당 키 하나만** 씁니다.

- 매번 쓰기 전에 자동으로 `.bak.<ISO 타임스탬프>` 백업을 생성합니다.
- `ANTHROPIC_AUTH_TOKEN` 을 포함한 다른 모든 설정은 절대 건드리지 않습니다.
- 변경 사항은 **다음번** Claude Code 실행 시 적용됩니다 ── 시스템 프롬프트는 턴마다가 아니라 시작 시 조립되기 때문입니다.

## 다국어 UI

`pms-inspector` 는 8개 언어를 지원합니다: **en, zh-CN, zh-TW, ja, ko, fr, de, es**. 표시 언어는 다음 우선순위로 자동 감지됩니다:

1. `--lang <code>` CLI 플래그
2. `~/.claude/settings.json` 의 `language` 필드 (`"简体中文"`, `"日本語"`, `"français"` 같은 현지 이름도 허용)
3. 환경 변수 `$LC_ALL` / `$LANG` / `$LANGUAGE`
4. `en` 으로 폴백

플러그인 없이 스크립트를 직접 실행할 수도 있습니다:

```
node scripts/inspect.js
node scripts/inspect.js --json
```

## 출력 예시 (발췌)

```
═══ Claude Code 컨텍스트 인스펙터 ═══
표시 언어: ko (--lang 으로 재정의 가능, 예: --lang en)

설정 위치: ~/.claude/settings.json
  컨텍스트 창: 200,000 tokens (~800,000 문자)
  skillListingBudgetFraction = 0.099
     ↳ ctx 중 스킬 목록에 할당되는 비율 (CC 설정; 기본 0.01)
     ↳ 예산 79,200 문자 (ctx 의 9.90%)
  skillListingMaxDescChars = 1536
     ↳ 스킬당 설명 문자 상한 (CC 설정; 기본 1536)
  활성화된 플러그인: claude-mem, ecc, andrej-karpathy-skills, pms-inspector
```

## 안전성

- 기본 실행은 읽기 전용입니다. `--apply <plan-id>` 가 **유일하게** 쓰기를 수행하는 코드 경로이며, `~/.claude/settings.json` 안의 대상 키 하나(`skillListingBudgetFraction`, `skillListingMaxDescChars`, 또는 `enabledPlugins` 의 항목 하나)만 패치합니다. 변경 전마다 `.bak.<ISO 타임스탬프>` 스냅샷을 생성합니다.
- `ANTHROPIC_AUTH_TOKEN` 이나 인증 필드는 읽지 않습니다 ── 로드 관련 키만 읽습니다.
- npm 의존성 제로. 순수 Node 18+ 빌트인 (`fs`, `path`, `os`).
- 크로스 플랫폼 (macOS, Linux, Windows).

## Fork / 재개발

플러그인을 fork 해서 이름을 바꿀 경우 **5 곳을 동시에** 업데이트하세요 ── 하나라도 빠지면 `/plugin install` 이 조용히 잘못된 이름을 집습니다:

| 파일 | 필드 |
|---|---|
| `.claude-plugin/plugin.json` | `name` |
| `.claude-plugin/marketplace.json` | `name` |
| `.claude-plugin/marketplace.json` | `id` |
| `.claude-plugin/marketplace.json` | `plugins[].name` |
| `commands/<name>.md` | 파일명 + frontmatter 의 `name` |

Grep 확인:

```
grep -rn "pms-inspector" .
```

## 라이선스

MIT ── [LICENSE](../LICENSE) 참조.
