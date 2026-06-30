# 段④ 复审修复发现

总体结论：这轮修复覆盖了不少首轮问题，但仍有几处需要返工；尤其是跨院同病理号只修了收入表写入，LIS/ABC/P&L 读写链路仍按 `case_no` 单键运行，不能认为 CRITICAL 串账问题已经闭环。

## CRITICAL

1. `后端代码/server/src/database/DatabaseManager.ts:321`、`后端代码/server/src/routes/lis-cases-v1.1.ts:41`、`后端代码/server/src/utils/partner-pnl-service.ts:57`、`后端代码/server/src/utils/abc-partner-link.ts:16`、`后端代码/server/src/utils/abc-partner-link.ts:53`

   问题：跨院同病理号修复只把 `case_revenue` 改成 `(partner_id, case_no, service_month)`，但 LIS 事实层、ABC 回填和 P&L 读取仍把 `case_no` 当全局唯一键。

   为什么仍错：首轮 CRITICAL 的业务前提是“不同医院可能有相同本地病理号”。当前 `lis_cases.case_no` 仍是全局 `UNIQUE`，LIS 导入 `ON CONFLICT(case_no)` 会让后导入医院覆盖先导入医院；P&L 收入拆分 `LEFT JOIN lis_cases lc ON lc.case_no = cr.case_no`，会把某一家医院的 LIS 数量挂到另一家同号收入上；ABC 回填也用 `SELECT lc.partner_id FROM lis_cases lc WHERE lc.case_no = outbound_abc_details.case_no`，成本维度同样可被同号病例串走。`getCaseCostRollup` 还按 `case_no` 汇总 case 成本，case 级下钻会把不同医院同号成本混在一起。

   复现/触发：医院 A 和医院 B 同月各 commit `S26-DUP` 后，新增测试只断言两条 `case_revenue` 和两组 lines 都存在；但如果 LIS 当前只有 A 的 `S26-DUP` 数量/成本，`buildPartnerPnl({ partnerId: B })` 仍会通过单键 join 读到 A 的 LIS 数量，`/partner-pnl/cases` 也会通过单键 cost map 取到 A 的成本。若随后导入 B 的 LIS，同一个 `case_no` 会覆盖 A 的 LIS 归属。

   具体改法：要么在产品层硬性禁止跨院同号并在收入导入时返回冲突，不能只靠收入表隔离；要么把 LIS 自然键、LIS 导入 upsert、人工覆盖、ABC 回填、P&L join、case 成本 rollup 全部升级为 `(partner_id, case_no[, service_month])` 口径。回归测试需要覆盖 `buildPartnerPnl`、`loadCasePnlsWithCost`、`backfillAbcPartnerIds`，而不只验证收入表不覆盖。

## HIGH

1. `后端代码/server/src/routes/statement-import-v1.1.ts:42`、`后端代码/server/src/routes/statement-import-v1.1.ts:64`、`前端代码/src/pages/import-console/ImportConsolePage.tsx:34`、`前端代码/src/pages/import-console/ImportConsolePage.tsx:51`、`后端代码/server/src/routes/statement-import-v1.1.ts:177`、`后端代码/server/src/utils/partner-config.ts:279`

   问题：`preview` 为无配置医院返回 `configVersion=0`，前端归类时把 `expectedVersion: 0` 发给 `/classify-rule`；但后端 `classify-rule` 先 `loadConfig()` seed 成 v1，再 `saveConfig(... expectedVersion: 0)`，必然 409。

   为什么仍错：首轮要求 `preview` 不落库、测试台内联归类带乐观锁。这两个修复组合后，新医院的第一次“待人工归类”会进入死路：用户按提示重新预览，仍然看到 v1 之后的旧行未归类；如果第一次请求已经被 seed 但未保存规则，用户需要再次点击才可能成功。这不是并发冲突，而是正常首用流程被误判冲突。

   复现/触发：创建一个没有 `partner_configs` 的 partner；上传样表预览，响应 `configVersion: 0`；在测试台点“归类”。接口返回 `CONFLICT`，错误为“期望 v0，当前已是 v1”。当前 `statement-import-routes.test.ts` 的 classify-rule 用例没有传 `expectedVersion`，所以抓不住这个回归。

   具体改法：`classify-rule` 不应先 `loadConfig` 再按 v0 锁；可以让 `saveConfig` 明确接受“无当前配置且 expectedVersion=0”的首次写入，或让路由在 `expectedVersion===0` 时以 `peekConfig` 的默认配置构造首个编辑版本。补一条“fresh partner: preview v0 -> classify-rule expectedVersion 0 -> 200 且规则生效”的路由测试。

2. `后端代码/server/src/routes/ngs-v1.1.ts:34`、`后端代码/server/src/routes/ngs-v1.1.ts:37`、`后端代码/server/src/utils/ngs-pnl.ts:112`、`后端代码/server/src/utils/ngs-pnl.ts:120`、`后端代码/server/src/routes/ngs-v1.1.ts:86`、`后端代码/server/src/utils/partner-pnl-service.ts:143`

   问题：NGS 缺售价/缺外包成本现在会先 409，但 `confirm:true` 后仍把缺失值按 `0` 写入 `ngs_orders`，P&L 再无质量标记地汇总进院级毛利。

   为什么仍错：首轮结论不是“加一次确认弹窗即可”，而是缺成本/售价会持久污染毛利；如果允许确认入库，必须写质量标记并让 P&L 默认排除或显著标注。当前 `normalizeNgsOrder` 把缺失数值归零，`import` 直接 upsert `sellPrice/outsourceCost/margin`，`loadNgsByPartner` 只 `SUM(no.margin)`，没有任何 `missing_cost`、`confirmed_incomplete` 或排除条件。确认后缺成本单仍表现为高毛利，缺售价单仍拉低收入和毛利率。

   复现/触发：导入 `{订单号:'N1', 产品名称:'X', 送检医院:'A', 售价:8500}`，第一次返回 `NEEDS_CONFIRM`；重发 `confirm:true` 后落库 `outsource_cost=0, margin=8500`，`buildPartnerPnl` 把 `ngsMargin=8500` 加进 `totalMargin`，看板无法区分这是未核成本还是确定利润。

   具体改法：更稳妥是缺售价/缺成本直接 400，不允许进入利润事实表；若业务确实要强行入库，表结构需持久化缺失标记/确认人/确认时间，P&L 默认排除或拆出“未核 NGS 毛利”，API 响应也要返回 `missingPriceCount` 而不是只返回 `missingCostCount`。

3. `后端代码/server/src/utils/partner-config.ts:213`、`后端代码/server/src/utils/partner-config.ts:241`、`后端代码/server/src/utils/partner-config.ts:258`、`后端代码/server/src/routes/partner-config-v1.1.ts:58`、`后端代码/server/src/utils/partner-config.ts:304`、`后端代码/server/src/utils/partner-config.ts:312`

   问题：`normalizeConfig` 只挂在 `PUT /partner-config/:id` 保存路径上，历史 current 配置和 rollback 目标版本仍按原始 JSON 读写。

   为什么仍错：首轮 HIGH 是“坏扣率/坏形状会落库并污染收入”。本轮确实让新保存的配置被归一和校验，但 `row2config()` 对已有 `config_json` 不做任何 normalize/migration；`preview`、`commit`、`loadConfig`、`peekConfig` 会直接使用历史 current 配置。`rollbackConfig` 也把旧版本 `target` 原样 `writeVersion` 成新 current，绕过保存校验。只要库里已有 `discount.def=90` 或坏 `lines` 历史版本，修复后仍能被读取或回滚成现行配置。

   复现/触发：修复前保存过 `discount.def=90` 的医院，升级后直接跑 `/statement-import/preview` 或 `/commit`，收入 fallback 仍按 90 倍扣率计算；或者先通过 DB/旧版本保留坏配置，再调用 `/partner-config/:id/rollback`，新 current 版本会继续带坏值。

   具体改法：启动迁移或 `loadConfig/peekConfig/getConfigVersion/rollbackConfig` 至少对读出的 JSON 做一次安全 normalize；对无法 normalize 的历史配置返回明确错误并阻止导入。`rollbackConfig` 写新版本前必须 normalize target，且补“回滚到坏历史版本应 400、不生成 current”的测试。

## MEDIUM

1. `后端代码/server/src/middleware/rbac-matrix.ts:62`、`后端代码/server/src/middleware/rbac-matrix.ts:66`、`后端代码/server/src/routes/ngs-v1.1.ts:22`、`后端代码/server/src/routes/ngs-v1.1.ts:154`、`后端代码/server/src/routes/ngs-v1.1.ts:161`、`后端代码/server/src/routes/ngs-v1.1.ts:166`

   问题：NGS 写路由已收窄到 finance/admin，但读路由仍用 `cost_analysis R`，会让 procurement 等非财务角色读取 NGS 协议价、外包成本和院级毛利。

   为什么有风险：`SEED_MATRIX.procurement.cost_analysis='R'`，而 `/ngs/products` 返回 `agreementPrice`，`/ngs/partner-pnl` 返回 `costTotal/marginTotal/marginRate`。这些不是普通对账数据，而是外购成本与医院毛利。若产品口径是“NGS 利润由财务/管理员维护和查看”，读权限也应跟写权限一致或使用成本可见性白名单。

   具体改法：确认产品权限边界；若 NGS 毛利属于财务敏感数据，将 `/products` 的协议价字段和 `/partner-pnl` 收窄到 `requireAnyRole('finance')` 或 `getCostVisibilityRoles`，普通 `cost_analysis R` 只能看脱敏目录。

2. `前端代码/src/pages/partner-config/PartnerConfigPage.tsx:15`、`前端代码/src/pages/partner-config/PartnerConfigPage.tsx:17`、`前端代码/src/pages/partner-config/PartnerConfigPage.tsx:20`、`前端代码/src/pages/partner-config/PartnerConfigPage.tsx:26`、`前端代码/src/pages/partner-config/PartnerConfigPage.tsx:27`

   问题：`window.confirm` 已换成应用内弹层，但焦点管理还不完整：打开后默认聚焦“确认”，危险动作也一样；没有 focus trap，也没有关闭后回到触发按钮。

   为什么仍错：首轮和实测指出的是“高风险动作需要可控弹层、焦点管理、Esc/焦点回收”。当前弹层有 `role=dialog` 和 Esc，但键盘 Tab 可以离开弹层到背景控件，危险确认成为默认焦点，关闭后焦点丢失。对“放弃改动/删除业务线/回滚”这类不可逆动作，这仍然不符合错误预防。

   具体改法：改用现有 Dialog/AlertDialog 组件或补齐本地实现：打开时聚焦“取消”，Tab/Shift+Tab 限定在弹层内，关闭后恢复到触发按钮；危险动作的确认按钮不应是初始焦点。

## 已确认修对的关键项

- 月度向导 409 门禁已改为读取 `e.response.data.error`，`NEEDS_CONFIRM` 能进入确认态，二次提交会带 `confirm:true`。
- `statement-import` 的 commit 写入、delete、upsert 已在收入表和明细表层面带上 `partner_id`；新增测试能覆盖“后一次导入不覆盖前一家收入行/明细行”，但还缺 P&L/ABC 链路覆盖。
- `classify-rule` 前端已支持 `keyword/prefix/remark`，并传 `expectedVersion`；问题在 fresh partner v0 的后端锁处理。
- `classifier` 同长前缀已返回 `ambiguous`，`startsWithPrefix/containsKeyword` 做了 NFKC 与大小写折叠，新增红测覆盖了同长前缀场景。
- `preview` 使用 `peekConfig`，首访不再 seed 写库；这项本身正确，但和 classify 首写版本锁组合出了上面的 HIGH。
- 上传入口已改为可聚焦 button 触发 file input；金额展示改为保留两位小数；医院列表错误态也已显式可重试。
- 看板请求竞态用 `reqRef/selectedRef` 处理，行点击补了键盘操作和 `aria-label`；侧边栏移动/折叠按钮补了 `aria-label/aria-expanded`。

## 测试说明

- 本次复审主要为静态代码与现有测试覆盖审查；当前干净 worktree 未安装 `node_modules`，未运行自动化测试。
- 已核查新增测试覆盖点：跨院同号测试只验证 `case_revenue`/`case_revenue_lines`，未覆盖 `buildPartnerPnl`、`loadCasePnlsWithCost` 或 `backfillAbcPartnerIds`；`classify-rule` 路由测试没有传 `expectedVersion`，未覆盖 fresh partner v0 死路。
