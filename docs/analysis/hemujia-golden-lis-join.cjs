/**
 * 复现和睦家纯实验室 golden（全月 26.2）= ¥27,870，及 LIS 双核验。
 * 用法: node hemujia-golden-lis-join.cjs <xlsx模块路径> <LIS.xls> <结算表26.2.xlsx>
 *   xlsx 模块: 前端代码/node_modules/xlsx
 *   LIS: ~/Downloads/病例导出文档20260701 (1).xls
 *   结算表: 2026年对账单.7z 内 上海康湾-上海和睦家医院 结算表（26.2）.xlsx（py7zr 解压）
 * 口径: 制片份额 = 36×LIS蜡块 /(36×LIS蜡块+105) 逐病例；染色=IN整条；报告/现场=诊断桶；检诊/TCT/冰冻=拆。
 */
const XLSX = require(process.argv[2]);
const readGrid = (f, pick) => {
  const wb = XLSX.readFile(f);
  const sn = pick ? wb.SheetNames.find(pick) || wb.SheetNames[0] : wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
};

// ---- LIS: 病理号 -> {blk, ihc, sp}（和睦家系）----
const lg = readGrid(process.argv[3]);
const LH = lg[0].map((x) => String(x).trim());
const lc = (n) => LH.indexOf(n);
const [cNo, cH, cB, cI, cS] = ['病理号', '送检医院', '蜡块数', '免疫组化数', '特染数'].map(lc);
const lis = {};
for (let i = 1; i < lg.length; i++) {
  if (!/和睦家/.test(String(lg[i][cH] || ''))) continue;
  const no = String(lg[i][cNo] || '').trim().toUpperCase();
  if (no) lis[no] = { blk: +lg[i][cB] || 0, ihc: +lg[i][cI] || 0, sp: +lg[i][cS] || 0 };
}

// ---- 结算表 26.2: 按病理号归类 ----
const sg = readGrid(process.argv[4], (s) => /2026\.2|和睦家/.test(s));
let hr = -1, C = {};
for (let i = 0; i < 8; i++) {
  const r = (sg[i] || []).map((x) => String(x));
  if (r.some((c) => /病理号/.test(c))) {
    hr = i;
    r.forEach((c, j) => { if (/病理号/.test(c)) C.no = j; if (/项目名称/.test(c)) C.it = j; if (/数量/.test(c)) C.q = j; if (/结算金额/.test(c)) C.n = j; });
    break;
  }
}
const cases = {};
for (let i = hr + 1; i < sg.length; i++) {
  const no = String(sg[i][C.no] || '').trim().toUpperCase(), it = String(sg[i][C.it] || '').trim(), net = parseFloat(sg[i][C.n]), q = parseFloat(sg[i][C.q]) || 1;
  if (!no || !it || isNaN(net) || /合计|小计/.test(no) || /合计|小计/.test(it)) continue;
  const c = (cases[no] = cases[no] || { histo: 0, tct: 0, frozen: 0, inW: 0, diag: 0, hq: 0, tq: 0, fq: 0 });
  if (/现场服务|报告/.test(it)) c.diag += net;
  else if (/免疫组化|特殊染色|酶组织化学/.test(it)) c.inW += net;
  else if (/TCT/.test(it)) { c.tct += net; c.tq += q; }
  else if (/术中|冰冻切片/.test(it)) { c.frozen += net; c.fq += q; }
  else if (/检查与诊断/.test(it)) { c.histo += net; c.hq += q; }
}

// ---- join + golden ----
const DIAG = 105, RT = 36, RC = 75;
const all = Object.keys(cases), matched = all.filter((no) => lis[no]);
let IN = 0, D = 0;
for (const no of all) {
  const c = cases[no]; IN += c.inW; D += c.diag;
  if (c.histo > 0) { const blk = lis[no] ? lis[no].blk : c.hq; const f = (RT * blk) / (RT * blk + DIAG); IN += c.histo * f; D += c.histo * (1 - f); }
  if (c.tct > 0) { const f = (RC * c.tq) / (RC * c.tq + DIAG); IN += c.tct * f; D += c.tct * (1 - f); }
  if (c.frozen > 0) { const f = (RT * c.fq) / (RT * c.fq + DIAG); IN += c.frozen * f; D += c.frozen * (1 - f); }
}
console.log('对账单病例:', all.length, '| LIS匹配:', matched.length, `(${(matched.length / all.length * 100).toFixed(0)}%)`);
console.log('纯实验室 IN = ¥' + Math.round(IN), '| 诊断桶 = ¥' + Math.round(D), '| 守恒 =', Math.round(IN + D));
console.log('预期: IN 27870 / 诊断 27671 / 守恒 55541');
