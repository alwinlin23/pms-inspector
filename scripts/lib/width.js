/**
 * width.js — 可见宽度计算 (East Asian Width 感知)。零依赖.
 * 用途: 表格对齐. 中文/日文/韩文 / emoji 占 2 列, ASCII 占 1 列, 组合符 / 零宽 占 0 列.
 * 参考: Unicode TR11 (East Asian Width) + emoji Presentation.
 */
'use strict';

/** East Asian Wide/Fullwidth 主要范围; 未覆盖罕见块, 但对中英/日/韩/emoji足够. */
const WIDE_RANGES = [
  [0x1100, 0x115F],   // Hangul Jamo
  [0x231A, 0x231B],   // ⌚⌛
  [0x23E9, 0x23EC],   // ⏩⏬
  [0x23F0, 0x23F0],
  [0x23F3, 0x23F3],
  [0x25FD, 0x25FE],
  [0x2614, 0x2615],   // ☔☕
  [0x2648, 0x2653],   // 星座
  [0x267F, 0x267F],
  [0x2693, 0x2693],
  [0x26A1, 0x26A1],
  [0x26AA, 0x26AB],
  [0x26BD, 0x26BE],
  [0x26C4, 0x26C5],
  [0x26CE, 0x26CE],
  [0x26D4, 0x26D4],
  [0x26EA, 0x26EA],
  [0x26F2, 0x26F3],
  [0x26F5, 0x26F5],
  [0x26FA, 0x26FA],
  [0x26FD, 0x26FD],
  [0x2705, 0x2705],   // ✅ (真 wide)
  [0x270A, 0x270B],
  [0x2728, 0x2728],
  [0x274C, 0x274C],   // ❌
  [0x274E, 0x274E],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27B0, 0x27B0],
  [0x27BF, 0x27BF],
  [0x2E80, 0x303E],   // CJK Radicals / Kangxi / CJK Symbols
  [0x3041, 0x33FF],   // Hiragana, Katakana, Hangul, CJK
  [0x3400, 0x4DBF],   // CJK Ext A
  [0x4E00, 0x9FFF],   // CJK Unified
  [0xA000, 0xA4CF],   // Yi Syllables
  [0xAC00, 0xD7A3],   // Hangul Syllables
  [0xF900, 0xFAFF],   // CJK Compat Ideographs
  [0xFE30, 0xFE4F],   // CJK Compat Forms
  [0xFF00, 0xFF60],   // Fullwidth Forms
  [0xFFE0, 0xFFE6],   // Fullwidth Signs
  [0x1F300, 0x1F64F], // Emoji Misc / Symbols
  [0x1F680, 0x1F6FF], // Transport & Map
  [0x1F900, 0x1F9FF], // Supplemental Symbols
  [0x20000, 0x2FFFD], // CJK Ext B-F
  [0x30000, 0x3FFFD], // CJK Ext G
];
/** 主要 combining/zero-width; 未穷举但覆盖常见 diacritics 与 ZWJ/VS. */
const ZERO_RANGES = [
  [0x0300, 0x036F], [0x0483, 0x0489], [0x0591, 0x05BD], [0x05BF, 0x05BF],
  [0x0610, 0x061A], [0x064B, 0x065F], [0x0670, 0x0670], [0x06D6, 0x06DC],
  [0x0900, 0x0902], [0x093C, 0x093C], [0x0941, 0x0948], [0x1AB0, 0x1AFF],
  [0x1DC0, 0x1DFF], [0x200B, 0x200F], [0x2028, 0x202F], [0x2060, 0x206F],
  [0x20D0, 0x20FF], [0xFE00, 0xFE0F], [0xFE20, 0xFE2F], [0xFEFF, 0xFEFF],
];
function inRange(cp, ranges) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1, r = ranges[m];
    if (cp < r[0]) hi = m - 1;
    else if (cp > r[1]) lo = m + 1;
    else return true;
  }
  return false;
}
function charWidth(cp) {
  if (cp === 0) return 0;
  if (cp < 0x20 || (cp >= 0x7F && cp < 0xA0)) return 0;
  if (inRange(cp, ZERO_RANGES)) return 0;
  if (inRange(cp, WIDE_RANGES)) return 2;
  return 1;
}
/** 计算字符串在等宽终端里的可见列数 (未处理 ANSI 转义, 因为本项目不用色). */
function displayWidth(s) {
  if (s == null) return 0;
  let w = 0;
  for (const ch of String(s)) w += charWidth(ch.codePointAt(0));
  return w;
}
/** 右侧填充空格到目标可见宽度. 已超宽则原样返回, 不截断. */
function padEndVisual(s, width) {
  const w = displayWidth(s);
  return w >= width ? String(s) : String(s) + ' '.repeat(width - w);
}
/** 左侧填充空格到目标可见宽度. */
function padStartVisual(s, width) {
  const w = displayWidth(s);
  return w >= width ? String(s) : ' '.repeat(width - w) + String(s);
}
/** 按可见宽度截断,超出部分丢弃并追加 '…'. */
function truncateVisual(s, maxWidth) {
  if (displayWidth(s) <= maxWidth) return String(s);
  const chars = [...String(s)];
  let w = 0, out = '';
  for (const c of chars) {
    const cw = charWidth(c.codePointAt(0));
    if (w + cw > maxWidth - 1) break;
    out += c; w += cw;
  }
  return out + '…';
}
module.exports = { displayWidth, padEndVisual, padStartVisual, truncateVisual };
