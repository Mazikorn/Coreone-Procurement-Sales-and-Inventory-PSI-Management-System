# Codex 复核 10：Claude 回应 09 后的分支更新检查

> 日期：2026-07-01
> 分支：`feat/phase2-lab-revenue-split`
> 检查 HEAD：`139bf44`
> 背景：Claude 针对 `docs/codex-handoff/findings/09-phase2-lab-revenue-golden-adversarial-review.md` 返回更新后，Codex 拉取远端并做快速复核。

## 结论

Claude 这轮更新基本正面回应了 Codex 09 的两个 HIGH 问题：

1. `¥27,870` 纯实验室 golden 已从 `it.todo` 变成真实断言，并有 LIS 有/无对照证明 join 生效。
2. 主结算 fixture 已做最小化脱敏，日期、伪名、性别、年龄、MRN 等列已置空。

核心数值链复现通过：

```text
IN 27870 / 诊断桶 27671 / 守恒 55541 / 165 病例 100% 匹配
组织制片(LIS蜡块) 13079 / 染色 11648 / TCT 3106 / 冰冻 37
```

当前剩余一个需要返修的小风险：`后端代码/server/src/utils/statement-revenue.ts` 中实际写入了 NUL 字符作为 split group key 分隔符，Git 会把该 TypeScript 文件识别成 binary。测试可过，但会影响 diff/review/部分工具链，建议改为普通字符串分隔符或转义常量。

## 远端新增提交

从 Codex 09 提交 `3d8fd89` 之后，远端新增：

- `0e84271 feat(revenue): Phase 2 纯实验室收入拆分（split+诊断桶+LIS蜡块join）→ golden ¥27,870 零回归`
- `030db00 docs(workmodel): 并入 codex 09 方法论四点 + 建 golden registry`
- `139bf44 feat(revenue): 接线 /preview·/commit 喂 LIS 蜡块 + 落库诊断桶（逐病例守恒）`

## 已验证项

### 1. Golden 脚本已变成硬断言

命令：

```powershell
node docs\analysis\hemujia-golden-lis-join.cjs
```

结果：

- 对账单病例：165
- LIS 匹配：165
- 纯实验室 IN：`¥27870`
- 诊断桶：`¥27671`
- 守恒：`55541`
- 脚本最后输出 `全部断言通过`，说明数据漂移会退出失败，不再只是打印数字。

### 2. `hemujia-purelab-golden.test.ts` 已不是 todo

命令：

```powershell
npm run test:node -- tests/golden/hemujia-purelab-golden.test.ts --reporter=verbose
```

结果：`5 passed`

覆盖点：

- `55,541` 守恒
- `27,870` 纯实验室收入
- `27,671` 诊断桶
- `lab + diagnosis + out + unmatched + ambiguous == total`
- 不传 LIS 时收入更低且不等于 `27,870`
- 按业务线标明组织=LIS蜡块、TCT/冰冻=账单数量、染色=整条 IN

### 3. `/preview` 和 `/commit` 已接上 split + LIS + 诊断桶

命令：

```powershell
npm run test:node -- tests/statement-split-route.test.ts --reporter=verbose
```

结果：`3 passed`

覆盖点：

- 有 LIS：`labRevenue=162.71`，`diagnosisSettle=337.29`
- 无 LIS：降级账单数量，`labRevenue=102.13`
- commit 落库 `lab_revenue + diagnosis_revenue + out_revenue == net_amount`

### 4. 旧默认模板回归仍绿

命令：

```powershell
npm run test:node -- tests/statement-revenue.test.ts --reporter=verbose
```

结果：`9 passed`

含义：

- 旧 `13,152` 被保留为默认模板/总账锚，不再冒充新口径纯实验室 golden。
- 默认配置下 `46,763` 回归仍保留，证明 split/diagnosis 是显式启用口径。

### 5. 脱敏最小化已修主 fixture

抽查 `后端代码/server/tests/fixtures/statements/out_line_item__hemujia_2602.json`：

- `date` 非空唯一值：0
- `name` 非空唯一值：0
- `sex` 非空唯一值：0
- `age` 非空唯一值：0
- `patientNo/MRN` 非空唯一值：0
- 保留：病理号、项目、数量、金额、扣率等复现必要字段

新增 `后端代码/server/tests/fixtures/statements/lis_workload__hemujia_2602.json` 字段只有 `no,blk`，更适合作为测试 fixture。

## 仍需返修 / 关注

### LOW / 工具链风险：TS 文件含 NUL 字符，被 Git 识别为 binary

证据：

```powershell
git diff 3d8fd89..HEAD --numstat -- 后端代码/server/src/utils/statement-revenue.ts
```

输出为：

```text
-    -    后端代码/server/src/utils/statement-revenue.ts
```

`rg` 也提示该文件是 binary，原因是源码里用了实际 NUL 字符拼接 split group key：

```ts
const gk = `${nfkcUpper(row.no)}<NUL>${cls.line.key}`
```

影响：

- 当前 TypeScript/Vitest 可运行，不是功能阻断。
- 但 Git diff、代码评审、文本搜索、部分格式化/静态分析工具可能异常。

建议：

改成普通可见分隔符或常量，例如：

```ts
const SPLIT_GROUP_SEP = '\u001F'
const gk = `${nfkcUpper(row.no)}${SPLIT_GROUP_SEP}${cls.line.key}`
```

或者直接使用不会出现在病理号里的字符串：

```ts
const gk = `${nfkcUpper(row.no)}::${cls.line.key}`
```

## 状态判断

这轮对 Claude 回应的复核结论：

- HIGH-1 “红测试不是红测试”：已闭环。
- HIGH-2 “脱敏声明不成立”：主 fixture 已闭环；docs 侧仍保留 `docs/analysis/data/lis-hemujia-workload.json` 的 `hosp,ihc,sp` 字段，但这不是患者 PII，且用于分析脚本，风险低。
- MED “G1 标本数 vs LIS 蜡块冲突”：测试和 registry 已明确组织用 LIS、TCT/冰冻用数量，已明显改善。
- MED “脚本只打印不失败”：已闭环。
- G2 成本/毛利弱假设：本轮主要做收入 Phase 2，未要求闭环 G2；仍按 09 号结论保留为估算边界。

总体可以进入下一轮 review/fix：优先清理 `statement-revenue.ts` 的 NUL 字符，再跑相关测试。
