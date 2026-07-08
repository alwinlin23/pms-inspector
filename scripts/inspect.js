#!/usr/bin/env node
/**
 * pms-inspector / inspect.js — 零依赖 Node,只读诊断。
 * caller: commands/pms-inspector.md 通过 `node "$CLAUDE_PLUGIN_ROOT/scripts/inspect.js"` 调用。
 * reads: ~/.claude/settings.json (仅 enabledPlugins, skillListing 相关的两个 knob, mcpServers, hooks, language; 不读 auth),
 *        cache 下已启用 plugin 的 SKILL.md, agents 下的 .md, .claude-plugin/plugin.json.
 * writes: 无.
 * i18n: 支持 8 种语言, 通过 ~/.claude/settings.json 的 language 字段或 --lang 参数选择.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { displayWidth, padEndVisual, padStartVisual, truncateVisual } = require('./lib/width');
const { detectLang, makeT, SUPPORTED_LANGS } = require('./lib/i18n');

const DEFAULT_FRACTION = 0.01;
const DEFAULT_MAX_DESC = 1536;
const DEFAULT_CTX_TOKENS = 200000;
const CHARS_PER_TOKEN = 4;
const FRAME_OH = 24;
const INNER_W = 66; // 表格内容区宽度 (不含左右边框). 66 覆盖大多数中英混排;

function parseArgs(argv) {
  const args = { json: false, ctx: DEFAULT_CTX_TOKENS, verbose: false, lang: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--ctx') args.ctx = parseInt(argv[++i], 10) || DEFAULT_CTX_TOKENS;
    else if (a === '--lang') args.lang = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node inspect.js [--json] [--ctx <tokens>] [--verbose] [--lang <code>]');
      console.log('Supported languages: ' + SUPPORTED_LANGS.join(', '));
      process.exit(0);
    }
  }
  return args;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') process.stderr.write(`[warn] ${p}: ${e.message}\n`);
    return null;
  }
}
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function listDir(p) { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } }

function parseFrontmatter(text) {
  if (!text) return null;
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const lines = m[1].split('\n');
  const fields = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    const km = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!km) continue;
    const key = km[1];
    let val = km[2];
    if (val === '|' || val === '>') {
      const buf = [];
      i++;
      while (i < lines.length && (lines[i].startsWith(' ') || lines[i].startsWith('\t') || lines[i] === '')) {
        buf.push(lines[i].trim());
        i++;
      }
      i--;
      fields[key] = buf.join(' ').trim();
      continue;
    }
    val = val.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    fields[key] = val;
  }
  if (fields.description) fields.description = fields.description.replace(/\s+/g, ' ').trim();
  return fields;
}

function findEnabledPluginRoots(settings, home) {
  const enabled = settings.enabledPlugins || {};
  const cacheRoot = path.join(home, '.claude', 'plugins', 'cache');
  const roots = [];
  if (!fs.existsSync(cacheRoot)) return roots;
  for (const [spec, on] of Object.entries(enabled)) {
    if (!on) continue;
    let pluginName, vendor;
    if (spec.includes('@')) [pluginName, vendor] = spec.split('@');
    else { pluginName = spec; vendor = spec; }
    const vendorDir = path.join(cacheRoot, vendor);
    if (!fs.existsSync(vendorDir)) continue;
    const candidates = [];
    for (const sub of listDir(vendorDir)) {
      if (!sub.isDirectory()) continue;
      const subPath = path.join(vendorDir, sub.name);
      if (sub.name === pluginName) {
        for (const ver of listDir(subPath)) if (ver.isDirectory()) candidates.push(path.join(subPath, ver.name));
      }
      for (const inner of listDir(subPath)) {
        if (inner.isDirectory() && /^\d+\./.test(inner.name)) candidates.push(path.join(subPath, inner.name));
      }
      if (/^\d+\./.test(sub.name)) candidates.push(subPath);
    }
    if (!candidates.length) candidates.push(vendorDir);
    candidates.sort().reverse();
    roots.push({ label: spec, root: candidates[0] });
  }
  return roots;
}

function collectSkills(pluginRoots, home) {
  const raw = [];
  const scan = (base, label) => {
    if (!fs.existsSync(base)) return;
    for (const sub of listDir(base)) {
      if (!sub.isDirectory()) continue;
      const direct = path.join(base, sub.name, 'SKILL.md');
      if (fs.existsSync(direct)) {
        const fm = parseFrontmatter(readText(direct));
        if (fm && fm.name) raw.push({ name: fm.name, description: fm.description || '', source: label, path: direct });
        continue;
      }
      for (const inner of listDir(path.join(base, sub.name))) {
        if (inner.isDirectory()) {
          const nested = path.join(base, sub.name, inner.name, 'SKILL.md');
          if (fs.existsSync(nested)) {
            const fm = parseFrontmatter(readText(nested));
            if (fm && fm.name) raw.push({ name: fm.name, description: fm.description || '', source: label, path: nested });
          }
        }
      }
    }
  };
  scan(path.join(home, '.claude', 'skills'), 'user');
  for (const { label, root } of pluginRoots) scan(path.join(root, 'skills'), label);
  const map = new Map();
  for (const r of raw) {
    const prev = map.get(r.name);
    if (!prev || r.description.length > prev.description.length) map.set(r.name, r);
  }
  return [...map.values()];
}

function collectAgents(pluginRoots, home) {
  const seen = new Set();
  const out = [];
  const scan = (dir, label) => {
    if (!fs.existsSync(dir)) return;
    for (const f of listDir(dir)) {
      if (!f.isFile() || !f.name.endsWith('.md')) continue;
      const fm = parseFrontmatter(readText(path.join(dir, f.name)));
      if (!fm || !fm.name || seen.has(fm.name)) continue;
      seen.add(fm.name);
      out.push({ name: fm.name, description: fm.description || '', source: label, path: path.join(dir, f.name) });
    }
  };
  scan(path.join(home, '.claude', 'agents'), 'user');
  for (const { label, root } of pluginRoots) scan(path.join(root, 'agents'), label);
  return out;
}

function collectMcp(settings, pluginRoots) {
  const out = [];
  const pull = (source, spec) => {
    if (!spec || typeof spec !== 'object') return;
    for (const [name, def] of Object.entries(spec)) {
      out.push({ name, source, type: (def && def.type) || 'command', spec: def });
    }
  };
  pull('user', settings.mcpServers);
  for (const { label, root } of pluginRoots) {
    const pj = readJson(path.join(root, '.claude-plugin', 'plugin.json')) || {};
    pull(label, pj.mcpServers);
    const alt = readJson(path.join(root, '.mcp.json')) || {};
    pull(label, alt.mcpServers);
  }
  return out;
}

function collectHooks(settings, pluginRoots) {
  const out = [];
  const eat = (source, hooks) => {
    if (!hooks || typeof hooks !== 'object') return;
    for (const [event, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) continue;
      for (const grp of groups) {
        const matcher = grp.matcher || '*';
        for (const h of (grp.hooks || [])) out.push({ event, matcher, command: h.command || '', source });
      }
    }
  };
  eat('user', settings.hooks);
  for (const { label, root } of pluginRoots) {
    const pj = readJson(path.join(root, '.claude-plugin', 'plugin.json')) || {};
    eat(label, pj.hooks);
    const alt = readJson(path.join(root, 'hooks.json'));
    if (alt) eat(label, alt.hooks || alt);
  }
  return out;
}

function applyBudget(rawSkills, maxDesc, budget) {
  const totalFull = rawSkills.reduce((s, r) => s + r.name.length + (r.description || '').length + FRAME_OH, 0);
  const capped = rawSkills.map(r => ({
    name: r.name, source: r.source, path: r.path,
    origLen: (r.description || '').length,
    capped: (r.description || '').slice(0, maxDesc),
  }));
  const totalAfterCap = capped.reduce((s, r) => s + r.name.length + r.capped.length + FRAME_OH, 0);
  const nameOverhead = capped.reduce((s, r) => s + r.name.length + FRAME_OH, 0);
  const descBudget = budget - nameOverhead;
  const sumDesc = capped.reduce((s, r) => s + r.capped.length, 0);
  let scale;
  if (sumDesc === 0) scale = 1;
  else if (descBudget <= 0) scale = 0;
  else scale = Math.min(1, descBudget / sumDesc);

  const entries = capped.map(r => {
    const allotted = sumDesc ? Math.floor(r.capped.length * scale) : 0;
    let status, finalLen;
    if (r.origLen === 0) { status = 'no-description'; finalLen = 0; }
    else if (scale >= 1 && r.origLen <= maxDesc) { status = 'full'; finalLen = r.capped.length; }
    else if (scale >= 1 && r.origLen > maxDesc) { status = 'truncated-by-cap'; finalLen = r.capped.length; }
    else if (allotted < 30) { status = 'name-only'; finalLen = allotted; }
    else { status = 'truncated-by-budget'; finalLen = allotted; }
    return { name: r.name, source: r.source, path: r.path, origLen: r.origLen, cappedLen: r.capped.length, finalLen, status };
  });
  const totalFinal = nameOverhead + Math.floor(sumDesc * scale);
  return { entries, totalFull, totalAfterCap, totalFinal, scale };
}

const fmtInt = n => n.toLocaleString('en-US');
const fmtPct = (n, d) => d > 0 ? (n * 100 / d).toFixed(2) + '%' : 'n/a';
function fmtTk(chars, t) { return `${fmtInt(Math.floor(chars / CHARS_PER_TOKEN))} ${t('tokens')} / ${fmtInt(chars)} ${t('chars')}`; }

function build(args, lang) {
  const home = os.homedir();
  const settings = readJson(path.join(home, '.claude', 'settings.json'));
  if (!settings) { process.stderr.write('[fatal] cannot read ~/.claude/settings.json\n'); process.exit(1); }
  const fraction = settings.skillListingBudgetFraction ?? DEFAULT_FRACTION;
  const maxDesc = settings.skillListingMaxDescChars ?? DEFAULT_MAX_DESC;
  const ctxTokens = args.ctx;
  const ctxChars = ctxTokens * CHARS_PER_TOKEN;
  const budget = Math.floor(ctxChars * fraction);
  const roots = findEnabledPluginRoots(settings, home);
  const rawSkills = collectSkills(roots, home);
  const agents = collectAgents(roots, home);
  const mcp = collectMcp(settings, roots);
  const hooks = collectHooks(settings, roots);
  const budgeted = applyBudget(rawSkills, maxDesc, budget);
  return {
    lang, ctxTokens, ctxChars, fraction, maxDesc, budget,
    enabledPlugins: roots.map(r => r.label),
    pluginRoots: roots, skills: budgeted.entries, agents, mcp, hooks, totals: budgeted,
    settingsLanguage: settings.language || null,
  };
}

/* ─── 表格排版工具 ────────────────────────────────────────────────
 * 所有边框都由 makeFrame() 生成, INNER_W 恒定, 保证左右框对齐. 内容行
 * 通过 padEndVisual/padStartVisual 按可见列数(East Asian Width)填充,
 * 中英混排也能对齐. */
function boxTop(title) {
  const inner = INNER_W;
  const titleStr = ` ${title} `;
  const remain = inner - displayWidth(titleStr) - 1;
  const dashesR = remain > 0 ? '─'.repeat(remain) : '';
  return `┌─${titleStr}${dashesR}┐`;
}
function boxBot() { return `└${'─'.repeat(INNER_W)}┘`; }
/** 单列行. 内容超宽则按可见列换行成多行,每行首尾补齐. */
function boxRow(text) {
  const usable = INNER_W - 2;
  const chars = [...String(text)];
  const rows = [];
  let cur = '', w = 0;
  for (const ch of chars) {
    const cw = displayWidth(ch);
    if (w + cw > usable) { rows.push(cur); cur = ''; w = 0; }
    cur += ch; w += cw;
  }
  if (cur.length || rows.length === 0) rows.push(cur);
  return rows.map(r => `│ ${padEndVisual(r, usable)} │`).join('\n');
}
/** 双列行 (左自适应 + 右对齐). 左侧不换行,超宽截断加 …. */
function boxRow2col(left, right) {
  const rw = displayWidth(right);
  const leftMax = INNER_W - 2 - rw - 2;
  const l = padEndVisual(truncateVisual(left, leftMax), leftMax);
  return `│ ${l}  ${right} │`;
}

function suggest(rep, t) {
  const { totals, budget, ctxChars, fraction, skills } = rep;
  const need = totals.totalAfterCap;
  const lines = [];
  if (need <= budget) {
    const headroom = (budget - need) * 100 / Math.max(1, budget);
    lines.push(t('suggestOk'));
    lines.push(t('suggestHeadroom', { pct: headroom.toFixed(1) }));
    if (fraction > 0.05 && headroom > 60) {
      const newFrac = +(need / ctxChars * 1.2).toFixed(3);
      lines.push(t('suggestFractionLower', { v: newFrac }));
    }
  } else {
    const needFrac = Math.min(1, +(need / ctxChars + 0.005).toFixed(3));
    lines.push(t('suggestOverflow', { b: fmtInt(budget), n: fmtInt(need) }));
    lines.push(t('suggestPlanA', { v: needFrac }));
    lines.push(t('suggestPlanACost', { t: fmtTk(need - budget, t) }));
    const n = Math.max(1, skills.length);
    const totalNameOh = skills.reduce((s, x) => s + x.name.length + FRAME_OH, 0);
    const avgDescBudget = Math.max(0, (budget - totalNameOh) / n);
    if (avgDescBudget >= 50) {
      lines.push(t('suggestPlanB', { v: Math.floor(avgDescBudget) }));
      lines.push(t('suggestPlanBEffect', { frac: fraction }));
    }
    const bySrc = {};
    for (const s of skills) bySrc[s.source] = (bySrc[s.source] || 0) + 1;
    const top = Object.entries(bySrc).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > n * 0.5) lines.push(t('suggestPlanC', { p: top[0], n: top[1] }));
  }
  lines.push('');
  lines.push(t('suggestCommon'));
  return lines;
}

function renderHuman(rep, args, t) {
  const out = [];
  const { totals, ctxTokens, ctxChars, fraction, maxDesc, budget, enabledPlugins, skills, agents, mcp, hooks } = rep;

  // 头部
  out.push('═══ ' + t('title') + ' ═══');
  out.push(t('langHint', { code: rep.lang }));
  out.push('');

  // 参数解释区
  out.push(t('knobsHint'));
  out.push(`  ${t('ctxWindow')}: ${fmtInt(ctxTokens)} ${t('tokens')} (~${fmtInt(ctxChars)} ${t('chars')})`);
  out.push(`  ${t('budgetFractionLabel')} = ${fraction}`);
  out.push(`     ↳ ${t('budgetFractionHelp')}`);
  out.push(`     ↳ ${t('budgetOf', { n: fmtInt(budget), pct: fmtPct(budget, ctxChars) })}`);
  out.push(`  ${t('maxDescLabel')} = ${maxDesc}`);
  out.push(`     ↳ ${t('maxDescHelp')}`);
  out.push(`  ${t('enabledPlugins')}: ${enabledPlugins.join(', ') || t('none')}`);
  out.push('');

  // 对象总览 (4 列自适应表格)
  out.push(boxTop(t('sectionOverview')));
  const colsPart = [
    `${t('colSkills')} : ${padStartVisual(skills.length, 4)}`,
    `${t('colAgents')} : ${padStartVisual(agents.length, 4)}`,
    `${t('colMcp')} : ${padStartVisual(mcp.length, 3)}`,
    `${t('colHooks')} : ${padStartVisual(hooks.length, 4)}`,
  ];
  out.push(boxRow(colsPart.join('   ')));
  out.push(boxBot());
  out.push('');

  // 预算表 (右对齐数值)
  out.push(boxTop(t('sectionBudget')));
  out.push(boxRow2col(t('rowFullUncut'), fmtTk(totals.totalFull, t)));
  out.push(boxRow2col(t('rowAfterCap', { n: maxDesc }), fmtTk(totals.totalAfterCap, t)));
  out.push(boxRow2col(t('rowBudgetLine', { frac: fraction }), fmtTk(budget, t)));
  out.push(boxRow2col(t('rowFinal'), fmtTk(totals.totalFinal, t)));
  out.push(boxRow2col(t('rowPctOfCtx'), fmtPct(totals.totalFinal, ctxChars)));
  out.push(boxBot());
  out.push('');

  // 加载状态分布
  const counter = { full: 0, 'truncated-by-cap': 0, 'truncated-by-budget': 0, 'name-only': 0, 'no-description': 0 };
  for (const s of skills) counter[s.status] = (counter[s.status] || 0) + 1;
  const marker = { full: '✅', 'truncated-by-cap': '✂', 'truncated-by-budget': '⚠', 'name-only': '❌', 'no-description': '·' };
  const label = {
    full: t('statusFull'),
    'truncated-by-cap': t('statusTruncCap'),
    'truncated-by-budget': t('statusTruncBudget'),
    'name-only': t('statusNameOnly'),
    'no-description': t('statusNoDesc'),
  };
  out.push(boxTop(t('sectionStatus')));
  for (const k of Object.keys(counter)) {
    const n = counter[k];
    const pct = fmtPct(n, skills.length);
    const barMax = 10;
    const barLen = Math.min(barMax, Math.floor(n * barMax / Math.max(1, skills.length)));
    const bar = barLen ? ' ' + '='.repeat(barLen) : '';
    const mk = padEndVisual(marker[k], 2);
    // 单列布局: [mk] [label(34)] [count(4)] ([pct(7)]) [bar]
    // 34+4+7+固定符号 = 稳定, 极端长 label 时把 bar 挤掉但主数据不截.
    const line = `${mk} ${padEndVisual(label[k], 34)} ${padStartVisual(String(n), 4)} (${padStartVisual(pct, 7)})${bar}`;
    out.push(boxRow(line));
  }
  out.push(boxBot());
  out.push('');

  // 其他对象
  const agentChars = agents.reduce((s, a) => s + FRAME_OH + a.name.length + (a.description || '').length, 0);
  const mcpChars = mcp.reduce((s, m) => s + FRAME_OH + m.name.length + 40, 0);
  out.push(boxTop(t('sectionOther')));
  out.push(boxRow2col(`${t('otherAgents')} ${t('otherAgentsNote')}`, fmtTk(agentChars, t)));
  out.push(boxRow2col(`${t('otherMcp')} ${t('otherMcpNote')}`, fmtTk(mcpChars, t)));
  out.push(boxRow2col(`${t('otherHooks')} ${t('otherHooksNote')}`, fmtTk(0, t)));
  out.push(boxBot());
  out.push('');

  // Top 10 最长描述
  const long = skills.slice().sort((a, b) => b.origLen - a.origLen).slice(0, 10);
  out.push(boxTop(t('sectionTop')));
  for (const s of long) {
    const left = `${padStartVisual(String(s.origLen), 5)} ch  ${s.name}`;
    out.push(boxRow2col(left, `[${s.status}]`));
  }
  out.push(boxBot());
  out.push('');

  const empty = skills.filter(s => s.origLen === 0).length;
  if (empty) { out.push(t('emptyWarn', { n: empty })); out.push(''); }

  // 建议
  out.push(boxTop(t('sectionSuggest')));
  for (const l of suggest(rep, t)) out.push(boxRow(l));
  out.push(boxBot());

  if (args.verbose) {
    out.push('');
    out.push('── ' + t('sectionVerbose') + ' ──');
    out.push(t('verboseHeader'));
    const sorted = skills.slice().sort((a, b) => (a.status.localeCompare(b.status)) || a.name.localeCompare(b.name));
    for (const s of sorted) {
      out.push(`  [${padStartVisual(s.status, 20)}] ${padStartVisual(String(s.origLen), 5)} → ${padStartVisual(String(s.finalLen), 5)}  ${padEndVisual(s.name, 40)}  (${s.source})`);
    }
  }
  return out.join('\n');
}

function renderJson(rep) {
  const counter = {};
  for (const s of rep.skills) counter[s.status] = (counter[s.status] || 0) + 1;
  return JSON.stringify({
    language: rep.lang,
    ctx_tokens: rep.ctxTokens, ctx_chars: rep.ctxChars,
    skillListingBudgetFraction: rep.fraction, skillListingMaxDescChars: rep.maxDesc,
    budget_chars: rep.budget, enabled_plugins: rep.enabledPlugins,
    totals: {
      skills: rep.skills.length, agents: rep.agents.length, mcp: rep.mcp.length, hooks: rep.hooks.length,
      skill_listing_full_chars: rep.totals.totalFull,
      skill_listing_after_cap_chars: rep.totals.totalAfterCap,
      skill_listing_final_chars: rep.totals.totalFinal,
    },
    status_distribution: counter,
    skills: rep.skills.map(s => ({
      name: s.name, source: s.source,
      orig_desc_len: s.origLen, final_desc_len: s.finalLen,
      load_status: s.status,
    })),
  }, null, 2);
}

const args = parseArgs(process.argv);
// 先读一次 settings 只为拿 language,再让 build 复用. 保持向后兼容.
const _preSettings = readJson(path.join(os.homedir(), '.claude', 'settings.json')) || {};
const lang = detectLang({ cliLang: args.lang, settingsLanguage: _preSettings.language });
const t = makeT(lang);
const rep = build(args, lang);
process.stdout.write((args.json ? renderJson(rep) : renderHuman(rep, args, t)) + '\n');
