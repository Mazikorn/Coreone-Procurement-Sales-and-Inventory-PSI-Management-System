export const meta = {
  name: 'base-feature-audit',
  description: 'COREONE 非 ABC 基础功能(PSI)产品目的+前后端审查：每模块3维并行→对抗验证→横向交叉→结构化发现',
  phases: [
    { title: '三维审查', detail: '每模块组并行跑 产品目的/后端/前端 三名审查员' },
    { title: '对抗验证', detail: '对 critical/high 发现独立证伪核验' },
    { title: '横向交叉', detail: 'RBAC一致性 / 设计规范 / 库存守恒与事务' },
  ],
}

// ---------- 共享锚点 ----------
const R = '后端代码/server/src/routes/'
const PROJECT = 'COREONE = 实验室耗材进销存(PSI) + 单张切片成本控制系统。B 端多角色：admin / warehouse_manager(仓管) / technician(技术员) / pathologist(病理主任) / procurement(采购) / finance(财务) / manager。SQLite via node:sqlite DatabaseSync(非 sqlite3)。'

const PURPOSE_DOCS = `产品目的事实源(按需读取，勿全文复述)：
- docs/01_Project_Charter.md(章程/目标)、docs/02_PRD.md(需求)、docs/04_Business_Rules.md(业务规则 BR)
- docs/05_Role_Permission_Matrix.md(角色权限矩阵)、docs/07_Acceptance_Criteria.md(验收 AC)
- docs/role-story-list-2026-06-20.md / role-story-goal-workflow-2026-06-20.md(角色故事/目标工作流)
- docs/coreone-ux-product-purpose-review-2026-06-20.md(既有产品目的/UX 审查——在其基础上推进，勿复述其已记录结论)`

const CODE_STD = `编码规范真值：
- RBAC 注册真值：后端代码/server/src/app.ts:148-202(requireRole/requireStrictRole) + 后端代码/server/src/middleware/auth.ts
- 后端：每个写操作 express-validator 入口校验；SQL 必须参数化(出现 \${} 字符串拼接进 SQL = critical)；统一响应 {success,data} / {success:false,error}；错误走 errorHandler 中间件，不静默吞错、不泄露内部实现
- 前端设计规范(.claude/rules/coreone-guardrails.md)：font Inter；圆角 buttons/inputs=rounded-md、cards=rounded-lg、modals=rounded-xl、tags=rounded-full；主色 blue-500/hover blue-600；按钮 h-10；边框统一 border-gray-200；禁 text-black、禁 0px 圆角、禁内联 style(除动态计算)；focus:ring-[3px] ring-blue-500/10；服务端态用 React Query(出现 useEffect 内直接 fetch/axios = high)；表单 Zod 校验；组件 <400 行、函数 <50 行
- 采纳优先(最高否决权)：功能再正确，若目标角色不会用 / 录入摩擦过大 / 有更快线下替代 / 强制录入用户不愿填字段 → 即"有用但没人用"的产品失败风险`

const SCOPE = `范围：仅审【非 ABC 基础功能】。ABC/成本核算(cost/ 前端页、abc-v1.1、成本快照/动因费率/收费映射/对账差异异常化)已单独深度审过，作为集成边界不重复审；某基础模块若与 ABC 集成(如出库写成本快照)，只审其 PSI 侧行为。所有 finding 必须落到真实 file:line 证据(实际打开文件核对)，禁臆测；无问题则 findings 返回空数组。`

// ---------- 模块组 ----------
const GROUPS = [
  { key:'auth-rbac', name:'认证与权限', purpose:'多角色登录 + JWT + RBAC，保证 6 角色各司其职、最小权限',
    be:[R+'auth.ts', R+'users-v1.1.ts', R+'roles-v1.1.ts', '后端代码/server/src/middleware/auth.ts'],
    fe:['前端代码/src/pages/auth/Login.tsx','前端代码/src/pages/system/components/UsersTable.tsx','前端代码/src/contexts 或 src/lib(用 Glob 找 AuthContext/useAuth/token 存储)'] },
  { key:'materials', name:'物料与分类主数据', purpose:'耗材 SKU 主数据 + 分类树，库存/出入库的基础主数据',
    be:[R+'materials.ts', R+'categories-v1.1.ts'],
    fe:['前端代码/src/pages/master/components/Material*','前端代码/src/pages/master/components/Category*','前端代码/src/pages/master/hooks/useMaterialsPage*','前端代码/src/pages/master/hooks/useCategoriesPage*'] },
  { key:'suppliers-purchase', name:'供应商与采购订单', purpose:'供应商主数据 + 采购订单，补货来源',
    be:[R+'suppliers-v1.1.ts', R+'purchase-orders-v1.1.ts'],
    fe:['前端代码/src/pages/master/components/Supplier*','前端代码/src/pages/purchase/','前端代码/src/pages/master/hooks/useSuppliersPage*'] },
  { key:'locations', name:'库位主数据', purpose:'库位主数据，批次/库存定位',
    be:[R+'locations-v1.1.ts'],
    fe:['前端代码/src/pages/master/components/LocationFormModal.tsx','前端代码/src/pages/master/hooks/useLocationsPage*'] },
  { key:'inbound', name:'入库', purpose:'收货入库(批次/效期/库位)，库存增加入口',
    be:[R+'inbound-v1.1.ts'],
    fe:['前端代码/src/pages/inbound/'] },
  { key:'outbound', name:'出库与消耗', purpose:'领用出库(普通/BOM)，库存减少主入口。只审 PSI 侧：批次扣减/库位余量/项目归属/校验',
    be:[R+'outbound-v1.1.ts', R+'depletion-v1.1.ts'],
    fe:['前端代码/src/pages/outbound/'] },
  { key:'inventory', name:'库存', purpose:'实时库存/批次余量/预警阈值，核心账面。注意 inventory/ 目录含盘点 modal，盘点单独成组、本组跳过 Stocktaking* 文件',
    be:[R+'inventory-v1.1.ts'],
    fe:['前端代码/src/pages/inventory/InventoryList.tsx','前端代码/src/pages/inventory/components/InventoryTable.tsx','前端代码/src/pages/inventory/components/OutboundModal.tsx','前端代码/src/pages/inventory/components/MaterialSelectorModal.tsx','前端代码/src/pages/inventory/components/BatchScrapModal.tsx'] },
  { key:'stocktaking', name:'盘点', purpose:'周期盘点与盈亏调整，账实相符',
    be:[R+'stocktaking-v1.1.ts'],
    fe:['前端代码/src/pages/inventory/components/StocktakingCreateModal.tsx','前端代码/src/pages/inventory/hooks/useStocktakingPage*'] },
  { key:'transfers', name:'调拨', purpose:'库位间调拨，库存位置流转',
    be:[R+'transfers-v1.1.ts'],
    fe:['前端代码/src/pages/transfers/'] },
  { key:'scraps', name:'报废', purpose:'过期/损坏报废，库存核销',
    be:[R+'scraps-v1.1.ts'],
    fe:['前端代码/src/pages/scraps/'] },
  { key:'returns', name:'退货(客户/供应商)', purpose:'退货处理，逆向库存流',
    be:[R+'returns-v1.1.ts', R+'supplier-returns-v1.1.ts'],
    fe:['前端代码/src/pages/returns/','前端代码/src/pages/supplier-returns/'] },
  { key:'projects', name:'项目主数据', purpose:'病理项目主数据，出库归属/BOM 关联/收费聚合锚',
    be:[R+'projects-v1.1.ts'],
    fe:['前端代码/src/pages/master/components/Project*','前端代码/src/pages/master/hooks/useProjectsPage*'] },
  { key:'bom', name:'BOM 基础配置', purpose:'BOM 物料清单+版本，出库用量/标准成本来源。只审 BOM 配置/版本/用量 CRUD，ABC 收费映射已单独审',
    be:[R+'bom-v1.1.ts'],
    fe:['前端代码/src/pages/bom/'] },
  { key:'equipment', name:'设备与类型台账', purpose:'设备与设备类型台账，折旧来源/维护',
    be:[R+'equipment-v1.1.ts', R+'equipment-types-v1.1.ts'],
    fe:['前端代码/src/pages/equipment/'] },
  { key:'alerts-dashboard', name:'预警与首页工作台', purpose:'库存预警 + 工作台首页 + 侧栏导航，监控与角色入口',
    be:[R+'alerts-v1.1.ts'],
    fe:['前端代码/src/pages/alerts/','前端代码/src/pages/Dashboard.tsx','前端代码/src/components/layout/AppSidebar.tsx'] },
  { key:'logs-audit', name:'操作日志与审计归档', purpose:'操作审计日志 + 日志归档，合规追溯(1729 行大文件)',
    be:[R+'logs-v1.1.ts'],
    fe:['前端代码/src/pages/system/components/Logs*','前端代码/src/pages/system/components/LogArchive*'] },
  { key:'reconciliation', name:'对账(物料/LIS)', purpose:'项目物料理论 vs 实际对账 + LIS 病例导入。只审 PSI 侧，ABC 差异异常化已单独审',
    be:[R+'reconciliation-v1.1.ts'],
    fe:['前端代码/src/pages/reconciliation/'] },
]

// ---------- Schema(从宽，避免过严重试失败) ----------
const FINDING_ITEM = {
  type:'object',
  properties:{
    title:{type:'string'},
    severity:{type:'string', enum:['critical','high','medium','low']},
    category:{type:'string', description:'如 security/correctness/validation/rbac/sql/transaction/error-handling/design-spec/react-pattern/types/dead-code/perf/ux/产品目的/采纳/空壳/流程断裂'},
    location:{type:'string', description:'file:line'},
    evidence:{type:'string'},
    impact:{type:'string'},
    recommendation:{type:'string'},
  },
  required:['title','severity','evidence','recommendation'],
}
const PURPOSE_SCHEMA = {
  type:'object',
  properties:{
    module:{type:'string'},
    intendedPurpose:{type:'string'},
    achievement:{type:'string', enum:['achieved','partial','not_achieved']},
    adoptionRisk:{type:'string', enum:['low','medium','high']},
    summary:{type:'string'},
    findings:{type:'array', items:FINDING_ITEM},
  },
  required:['module','achievement','adoptionRisk','findings'],
}
const CODE_SCHEMA = {
  type:'object',
  properties:{
    module:{type:'string'},
    dimension:{type:'string'},
    summary:{type:'string'},
    findings:{type:'array', items:FINDING_ITEM},
  },
  required:['module','findings'],
}
const VERDICT_SCHEMA = {
  type:'object',
  properties:{
    verdict:{type:'string', enum:['confirmed','refuted','uncertain']},
    adjustedSeverity:{type:'string', enum:['critical','high','medium','low']},
    reasoning:{type:'string'},
  },
  required:['verdict','reasoning'],
}

// ---------- Prompt 构造 ----------
const purposePrompt = (g) => `${PROJECT}

你是资深 B 端产品经理，审查模块【${g.name}】的产品目的达成度与采纳风险。
模块目的(初判)：${g.purpose}
相关代码：后端 ${g.be.join('、')}；前端 ${g.fe.join('、')}。

${PURPOSE_DOCS}

${SCOPE}

步骤：
1) 读相关治理文档 + 该模块前后端代码，确定该模块服务哪个/哪些角色的什么 job-to-be-done，以及"应当达成"的产品目的(intendedPurpose)。
2) 判定 achievement(achieved/partial/not_achieved) 与 adoptionRisk(low/medium/high)，summary 给一句话结论。
3) 列 findings：空壳/装饰功能(返回空/null/未接线/TODO)、流程断裂(与相邻模块衔接不顺，如入库→库存→出库数据不连贯)、采纳摩擦(步骤过繁/强制录入用户不愿填字段/缺默认值/缺批量/缺导入/有更快线下替代)、目的未闭环。
每条 finding 给 file:line 证据 + impact + 可执行 recommendation。严格按 schema。`

const backendPrompt = (g) => `${PROJECT}

你是资深后端工程师，对模块【${g.name}】做后端代码审查。
后端文件：${g.be.join('、')}。

${CODE_STD}

${SCOPE}

逐项核查并列 findings(critical/high/medium/low)：
- RBAC：route 级 requireRole/requireStrictRole 是否与 app.ts:148-202 + 05_Role_Permission_Matrix 一致且符合最小权限；越权(只读角色能写)/缺权/route 内二次鉴权缺失
- 输入校验：每个写操作有无 express-validator；列表/分页/日期/枚举过滤是否拒非法
- SQL：是否全参数化(\${} 拼接进 SQL = critical)；join/软删(is_deleted)/状态过滤是否正确
- 事务与并发：库存类多步写(扣批次/库位余量/写流水)是否在事务内；并发 check-then-act 是否致负库存/竞态
- 业务正确性：负库存防护、批次/效期、幂等(重复提交)、金额/数量边界、取消/删除回滚
- 错误处理：try-catch→errorHandler；静默吞错；错误消息泄露内部实现
- 响应一致性 {success,data}/{success:false,error}；审计：关键写是否写操作日志
每条给 file:line + 证据 + impact + recommendation。严格按 schema(module 填"${g.name}"，dimension 填"backend")。`

const frontendPrompt = (g) => `${PROJECT}

你是资深前端工程师(React18/TS/Tailwind/React Query)，对模块【${g.name}】做前端代码审查。
前端文件/目录：${g.fe.join('、')}(用 Glob/Read 展开)。

${CODE_STD}

${SCOPE}

逐项核查并列 findings(critical/high/medium/low)：
- 数据层：服务端态是否用 React Query(useEffect 内直接 fetch/axios = high)；缓存失效/乐观更新是否合理
- 校验：表单是否 Zod；提交前校验与后端是否一致
- 类型：props/返回值是否有类型；滥用 any
- 设计规范：圆角分级/主色 blue-500/按钮 h-10/border-gray-200/font Inter/禁 text-black/禁内联 style(除动态)/focus ring——逐条对照 coreone-guardrails
- 组件规模 >400 行需拆、函数 >50 行
- 状态完备：loading/error/empty 三态；API 失败是否 toast 提示
- 可访问性：label/键盘可达/aria；安全：localStorage 存敏感数据(token 除外)、dangerouslySetInnerHTML；死代码/注释代码/console.log
每条给 file:line + 证据 + impact + recommendation。严格按 schema(module 填"${g.name}"，dimension 填"frontend")。`

const verifyPrompt = (f) => `${PROJECT}

你是对抗式审查员。下面是一条来自模块【${f.module}】(${f.dim})的 ${f.severity} 级发现，请独立核验真伪——默认怀疑、倾向 refuted，除非实际打开引用文件核对后证据确凿。
标题：${f.title}
位置：${f.location || '—'}
类别：${f.category || '—'}
证据：${f.evidence}
影响：${f.impact || '—'}
建议：${f.recommendation || '—'}

任务：实际打开 location 引用的文件与行号核对上下文。判定 verdict=confirmed(确为真实问题且严重度恰当) / refuted(不成立、误读代码、已被他处处理、属设计取舍而非缺陷) / uncertain(需更多上下文)；给 adjustedSeverity(校准后严重度) 与 reasoning。`

// ---------- 执行 ----------
phase('三维审查')
log(`开始审查 ${GROUPS.length} 个非 ABC 基础模块组 × 3 维(产品目的/后端/前端) + 对抗验证 + 横向交叉`)

const groupResults = await pipeline(
  GROUPS,
  // stage 1：三维并行
  (g) => parallel([
    () => agent(purposePrompt(g),  { label:`purpose:${g.key}`,  phase:'三维审查', schema:PURPOSE_SCHEMA }),
    () => agent(backendPrompt(g),   { label:`backend:${g.key}`,  phase:'三维审查', schema:CODE_SCHEMA }),
    () => agent(frontendPrompt(g),  { label:`frontend:${g.key}`, phase:'三维审查', schema:CODE_SCHEMA }),
  ]).then(arr => ({ group:g, purpose:arr[0], backend:arr[1], frontend:arr[2] })),
  // stage 2：对 critical/high 对抗验证
  (r, g) => {
    const all = []
    const push = (res, dim) => { if (res && Array.isArray(res.findings)) res.findings.forEach(f => all.push({ ...f, module:g.name, key:g.key, dim })) }
    push(r.purpose,'purpose'); push(r.backend,'backend'); push(r.frontend,'frontend')
    const hot = all.filter(f => f.severity === 'critical' || f.severity === 'high')
    log(`[${g.key}] 发现 ${all.length} 条(其中需验证 ${hot.length} 条 critical/high)`)
    return parallel(hot.map(f => () =>
      agent(verifyPrompt(f), { label:`verify:${g.key}`, phase:'对抗验证', schema:VERDICT_SCHEMA })
        .then(v => ({ ...f, verify:v }))
        .catch(() => ({ ...f, verify:{ verdict:'uncertain', reasoning:'验证 agent 失败' } }))
    )).then(verifiedHot => ({
      key:g.key, name:g.name, purpose:g.purpose,
      achievement: r.purpose?.achievement || 'unknown',
      adoptionRisk: r.purpose?.adoptionRisk || 'unknown',
      purposeSummary: r.purpose?.summary || '',
      intendedPurpose: r.purpose?.intendedPurpose || '',
      backendSummary: r.backend?.summary || '',
      frontendSummary: r.frontend?.summary || '',
      allFindings: all,
      verifiedHot,
    }))
  }
)

// 横向交叉(barrier：需读多模块)
phase('横向交叉')
const crossPrompts = [
  { label:'cross:rbac', dim:'cross-rbac', prompt:`${PROJECT}\n\n你审查【全模块 RBAC 一致性】。读 后端代码/server/src/app.ts:148-202 + 后端代码/server/src/middleware/auth.ts + docs/05_Role_Permission_Matrix.md，逐路由比对"注册的角色集"与"矩阵声明的权限"。\n${SCOPE}\n找：① 代码与角色矩阵不一致 ② 同类操作 strict vs loose 不一致(如 outbound 用 requireStrictRole 而 transfers/scraps 用 requireRole 是否合理) ③ 只读角色能写/越权 ④ 缺失认证或 route 内二次鉴权缺失 ⑤ categories 路由未加 requireRole(app.ts:201 仅 authenticateToken)是否风险。每条给 file:line + 证据 + impact + recommendation。严格按 schema(module="全局RBAC"，dimension="cross-rbac")。` },
  { label:'cross:design', dim:'cross-design', prompt:`${PROJECT}\n\n你审查【全前端设计规范一致性】。Glob 前端代码/src/pages 与 前端代码/src/components，抽样核查 .claude/rules/coreone-guardrails.md 设计规则的系统性违反。\n${SCOPE}\n报"系统性/高频"违规点(给代表性 file:line 样本，不必逐文件)：圆角分级误用、非 blue-500 主色、按钮非 h-10、border 非 gray-200、内联 style 滥用、text-black、非 Inter 字体、focus ring 缺失、useEffect 直接 fetch 的普遍程度。每条给证据样本 + 影响 + 统一修复建议。严格按 schema(module="全局设计规范"，dimension="cross-design")。` },
  { label:'cross:data-integrity', dim:'cross-data-integrity', prompt:`${PROJECT}\n\n你审查【跨模块库存守恒与事务一致性】——PSI 系统命脉。审 入库/出库/调拨/盘点/报废/退货 六类写操作对 inventory、batch_location_balances、库存流水表 的读改写(读相关 routes：inbound/outbound/transfers/stocktaking/scraps/returns/supplier-returns)。\n${SCOPE}\n找：① 多步写是否都在事务内(node:sqlite 事务用法) ② 并发下 check-then-act 无锁是否致负库存/超扣/竞态 ③ 库存守恒(Σ入−Σ出−Σ报废±调拨±盘盈亏=结存)是否可能被破坏 ④ 软删/取消/删除是否正确回滚库存与库位余量 ⑤ 同一批次跨库位余量是否一致。每条给 file:line + 证据 + impact + recommendation。严格按 schema(module="全局库存一致性"，dimension="cross-data-integrity")。` },
]
const crossRaw = await parallel(crossPrompts.map(c => () =>
  agent(c.prompt, { label:c.label, phase:'横向交叉', schema:CODE_SCHEMA }).then(res => ({ ...c, res }))
))
// 横向 critical/high 也验证
const crossFindings = []
crossRaw.filter(Boolean).forEach(c => { if (c.res && Array.isArray(c.res.findings)) c.res.findings.forEach(f => crossFindings.push({ ...f, module:c.res.module || c.dim, dim:c.dim })) })
const crossHot = crossFindings.filter(f => f.severity === 'critical' || f.severity === 'high')
log(`横向交叉 ${crossFindings.length} 条(需验证 ${crossHot.length} 条)`)
const crossVerified = await parallel(crossHot.map(f => () =>
  agent(verifyPrompt(f), { label:`verify:${f.dim}`, phase:'对抗验证', schema:VERDICT_SCHEMA })
    .then(v => ({ ...f, verify:v }))
    .catch(() => ({ ...f, verify:{ verdict:'uncertain', reasoning:'验证失败' } }))
))

// 汇总统计
const flat = []
groupResults.filter(Boolean).forEach(g => (g.allFindings || []).forEach(f => flat.push(f)))
crossFindings.forEach(f => flat.push(f))
const bySev = { critical:0, high:0, medium:0, low:0 }
flat.forEach(f => { if (bySev[f.severity] != null) bySev[f.severity]++ })
log(`审查完成：${GROUPS.length} 组 + 3 横向；共 ${flat.length} 条发现 (C${bySev.critical}/H${bySev.high}/M${bySev.medium}/L${bySev.low})`)

return {
  groupResults: groupResults.filter(Boolean),
  crossCutting: crossRaw.filter(Boolean).map(c => c.res),
  crossVerified,
  totals: { findings: flat.length, bySeverity: bySev, groups: GROUPS.length },
}
