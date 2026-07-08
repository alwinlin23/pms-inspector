#!/usr/bin/env node
/**
 * pms-inspector / inspect.js — 零依赖 Node,只读诊断。
 * caller: commands/pms-inspector.md 通过 `node "$CLAUDE_PLUGIN_ROOT/scripts/inspect.js"` 调用。
 * reads: ~/.claude/settings.json (仅 enabledPlugins, skillListing 相关的两个 knob, mcpServers, hooks; 不读 auth),
 *        cache 下已启用 plugin 的 SKILL.md, agents 下的 .md, .claude-plugin/plugin.json.
 * writes: 无.
 * user asked: 把 skill/mcp/plugin 加载情况检查过程封装成 claudecode plugin.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_FRACTION = 0.01;
const DEFAULT_MAX_DESC = 1536;
const DEFAULT_CTX_TOKENS = 200000;
const CHARS_PER_TOKEN = 4;
const FRAME_OH = 24;

function parseArgs(argv) {
  const args = { json: false, ctx: DEFAULT_CTX_TOKENS, verbose: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--ctx') args.ctx = parseInt(argv[++i], 10) || DEFAULT_CTX_TOKENS;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node inspect.js [--json] [--ctx <tokens>] [--verbose]');
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
const fmtTk = c => `${fmtInt(Math.floor(c / CHARS_PER_TOKEN))} tk / ${fmtInt(c)} ch`;

function build(args) {
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
  return { ctxTokens, ctxChars, fraction, maxDesc, budget, enabledPlugins: roots.map(r => r.label),
    pluginRoots: roots, skills: budgeted.entries, agents, mcp, hooks, totals: budgeted };
}

function suggest(rep) {
  const { totals, budget, ctxChars, fraction, skills } = rep;
  const need = totals.totalAfterCap;
  const lines = [];
  if (need <= budget) {
    const headroom = (budget - need) * 100 / Math.max(1, budget);
    lines.push('│ ✅ 当前预算够用,所有 skill 描述都能完整注入 (per-cap 后)');
    lines.push(`│    还剩 ${headroom.toFixed(1)}% 预算余量`);
    if (fraction > 0.05 && headroom > 60) {
      const newFrac = +(need / ctxChars * 1.2).toFixed(3);
      lines.push(`│ 💡 预算显得偏大,可下调 skillListingBudgetFraction 至 ${newFrac} 省 ctx`);
    }
  } else {
    const needFrac = Math.min(1, +(need / ctxChars + 0.005).toFixed(3));
    lines.push(`│ ⚠  当前预算 ${fmtInt(budget)} chars 装不下 ${fmtInt(need)} chars`);
    lines.push(`│ 方案 A (推荐): 抬 skillListingBudgetFraction 至 ${needFrac}`);
    lines.push(`│   → 每 turn 多花 ${fmtTk(need - budget)},换取所有描述完整加载`);
    const n = Math.max(1, skills.length);
    const totalNameOh = skills.reduce((s, x) => s + x.name.length + FRAME_OH, 0);
    const avgDescBudget = Math.max(0, (budget - totalNameOh) / n);
    if (avgDescBudget >= 50) {
      lines.push(`│ 方案 B: 降 skillListingMaxDescChars 至 ~${Math.floor(avgDescBudget)}`);
      lines.push(`│   → 保持当前 fraction=${fraction},让每个 skill 都拿到一段短描述`);
    }
    const bySrc = {};
    for (const s of skills) bySrc[s.source] = (bySrc[s.source] || 0) + 1;
    const top = Object.entries(bySrc).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > n * 0.5) lines.push(`│ 方案 C: 关掉贡献最大的 plugin ${top[0]} 可减 ${top[1]} 个 skill`);
  }
  lines.push('│');
  lines.push('│ 通用建议: 用不上的 skill 关掉最省;都要用则至少保证 name+full description 装得下');
  return lines;
}

function renderHuman(rep, args) {
  const out = [];
  const { totals, ctxTokens, ctxChars, fraction, maxDesc, budget, enabledPlugins, skills, agents, mcp, hooks } = rep;
  out.push('═══ Claude Code Context Inspector ═══');
  out.push('');
  out.push(`ctx window            : ${fmtInt(ctxTokens)} tokens (~${fmtInt(ctxChars)} chars)`);
  out.push(`skillListingBudgetFraction : ${fraction}   →  预算 ${fmtInt(budget)} chars  (${fmtPct(budget, ctxChars)} of ctx)`);
  out.push(`skillListingMaxDescChars   : ${maxDesc}`);
  out.push(`已启用 plugin         : ${enabledPlugins.join(', ') || '(无)'}`);
  out.push('');
  out.push('┌─ 对象总览 ─────────────────────────────────────────────┐');
  out.push(`│  Skills : ${String(skills.length).padStart(4)}   Agents : ${String(agents.length).padStart(4)}   MCP : ${String(mcp.length).padStart(3)}   Hooks : ${String(hooks.length).padStart(4)}  │`);
  out.push('└────────────────────────────────────────────────────────┘');
  out.push('');
  out.push('┌─ Skill listing 字符预算 ───────────────────────────────┐');
  out.push(`│ 全量 (name+desc, 未裁剪)     : ${fmtTk(totals.totalFull).padStart(30)} │`);
  out.push(`│ per-cap 后 (≤${maxDesc}/skill)        : ${fmtTk(totals.totalAfterCap).padStart(30)} │`);
  out.push(`│ 预算 (${fraction} × ctx)              : ${fmtTk(budget).padStart(30)} │`);
  out.push(`│ 最终注入到系统提示           : ${fmtTk(totals.totalFinal).padStart(30)} │`);
  out.push(`│ 占 ctx 窗口                  : ${fmtPct(totals.totalFinal, ctxChars).padStart(30)} │`);
  out.push('└────────────────────────────────────────────────────────┘');
  out.push('');
  const counter = { full: 0, 'truncated-by-cap': 0, 'truncated-by-budget': 0, 'name-only': 0, 'no-description': 0 };
  for (const s of skills) counter[s.status] = (counter[s.status] || 0) + 1;
  const marker = { full: '✅', 'truncated-by-cap': '✂ ', 'truncated-by-budget': '⚠ ', 'name-only': '❌', 'no-description': '· ' };
  const label = { full: '完整加载', 'truncated-by-cap': '被 MaxDescChars 截断', 'truncated-by-budget': '被 BudgetFraction 压缩', 'name-only': '仅剩名称', 'no-description': '本就无描述' };
  out.push('┌─ Skill 描述加载状态 ──────────────────────────────────┐');
  for (const k of Object.keys(counter)) {
    const n = counter[k];
    const pct = fmtPct(n, skills.length);
    const barLen = Math.min(30, Math.floor(n * 30 / Math.max(1, skills.length)));
    out.push(`│ ${marker[k]} ${label[k].padEnd(24)} ${String(n).padStart(4)} (${pct.padStart(7)}) ${'█'.repeat(barLen)}`);
  }
  out.push('└────────────────────────────────────────────────────────┘');
  out.push('');
  const agentChars = agents.reduce((s, a) => s + FRAME_OH + a.name.length + (a.description || '').length, 0);
  const mcpChars = mcp.reduce((s, m) => s + FRAME_OH + m.name.length + 40, 0);
  out.push('┌─ 其他对象近似字符 (供参考) ────────────────────────────┐');
  out.push(`│ Agents  : ${fmtTk(agentChars).padStart(28)}  (Agent 工具目录)     │`);
  out.push(`│ MCP     : ${fmtTk(mcpChars).padStart(28)}  (只算 name+shim)      │`);
  out.push(`│ Hooks   : ${fmtTk(0).padStart(28)}  (不进系统提示)        │`);
  out.push('└────────────────────────────────────────────────────────┘');
  out.push('');
  const long = skills.slice().sort((a, b) => b.origLen - a.origLen).slice(0, 10);
  out.push('┌─ 描述最长 Top 10 ─────────────────────────────────────┐');
  for (const s of long) out.push(`│ ${String(s.origLen).padStart(5)}ch  ${s.name.padEnd(38)} [${s.status}]`);
  out.push('└────────────────────────────────────────────────────────┘');
  out.push('');
  const empty = skills.filter(s => s.origLen === 0).length;
  if (empty) out.push(`⚠ 有 ${empty} 个 skill 无 description 字段,不占预算但也不给模型任何提示。`);
  out.push('');
  out.push('┌─ 建议 ─────────────────────────────────────────────────┐');
  for (const l of suggest(rep)) out.push(l);
  out.push('└────────────────────────────────────────────────────────┘');
  if (args.verbose) {
    out.push('');
    out.push('── 全部 skill 明细 ──');
    const sorted = skills.slice().sort((a, b) => (a.status.localeCompare(b.status)) || a.name.localeCompare(b.name));
    for (const s of sorted) out.push(`  [${s.status.padStart(20)}] ${String(s.origLen).padStart(5)} → ${String(s.finalLen).padStart(5)}  ${s.name.padEnd(40)}  (${s.source})`);
  }
  return out.join('\n');
}

function renderJson(rep) {
  const counter = {};
  for (const s of rep.skills) counter[s.status] = (counter[s.status] || 0) + 1;
  return JSON.stringify({
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
    skills: rep.skills.map(s => ({ name: s.name, source: s.source, orig_desc_len: s.origLen, final_desc_len: s.finalLen, load_status: s.status })),
  }, null, 2);
}

const args = parseArgs(process.argv);
const rep = build(args);
process.stdout.write((args.json ? renderJson(rep) : renderHuman(rep, args)) + '\n');
