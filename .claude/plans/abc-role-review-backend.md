# ABC 成本核算方案 — 后端视角审查报告

> **审查日期**: 2026-06-03
> **审查角色**: 后端开发负责人

---

## 发现的问题

### P0 严重（3 个）

1. **两套成本体系并行冲突** - 传统全成本体系和 ABC 作业成本法各自独立运行，数据不一致风险极高
2. **出库流程缺少 ABC 成本写入** - outbound-v1.1.ts 没有调用 calculateSlideCost()
3. **事务管理不完整** - 通用试剂库存不足时只是跳过，但主物料已经扣减

### P1 高（4 个）

4. **缺少关键索引** - equipment_usage、project_cost_details、case_cost_records 等表缺少索引
5. **设备折旧计算逻辑错误** - 假设设备全年 24 小时不间断运行，实际工作时间通常为每天 8-10 小时
6. **间接成本分摊逻辑过于简单** - 将所有成本中心的分摊率简单累加，没有区分成本类型
7. **缺少成本预览 API** - 深度集成计划中定义的 POST /api/v1/outbound/preview-cost 未实现

### P2 中（4 个）

8. **成本计算精度累积误差** - 大量使用 Math.round(x * 100) / 100
9. **JSON 字段查询效率低** - case_cost_records.activity_costs 使用 TEXT 类型存储 JSON
10. **表结构冗余** - bom_general_reagents、bom_general_consumables、bom_quality_controls 三个表结构几乎相同
11. **缺少成本差异分析实现**

### P3 低（3 个）

12. **硬编码的成本动因类型**
13. **缺少数据验证中间件**
14. **缺少审计日志**

---

*详细内容见 agent 输出。*
