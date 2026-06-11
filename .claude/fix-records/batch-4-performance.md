# Batch 4: 性能优化记录

> **状态**: ✅ 已完成
> **目标**: 消除全表扫描和 N+1 查询
> **开始时间**: 2026-06-02
> **完成时间**: 2026-06-02

---

## MF-10: 数据库完全无索引

**修复前**: DatabaseManager.ts 37 张表无任何索引（除 PRIMARY KEY）
**修复后**: 为高频查询字段添加索引

**验证**:
- [ ] DatabaseManager.ts 包含至少 10 个 CREATE INDEX 语句
- [ ] 索引覆盖: material_id, batch_id, status, is_deleted, created_at, bom_id, outbound_id 等

---

## SF-10: inventory 相关子查询改 JOIN

**修复前**: inventory-v1.1.ts:58-60 每行 3 个相关子查询
**修复后**: 改为 LEFT JOIN 或窗口函数

**验证**:
- [ ] inventory 列表查询无相关子查询（grep 确认）
- [ ] 查询结果与修复前一致

---

## SF-11: categories N+1 优化

**修复前**: categories-v1.1.ts buildTree 递归中每个节点执行 COUNT 查询
**修复后**: 一次查询所有数据，在内存中构建树

**验证**:
- [ ] 分类树加载无 N+1 查询
- [ ] 功能正常（创建/编辑/删除分类）

---

## SF-12: outbound N+1 优化

**修复前**: outbound-v1.1.ts:76-89 对每条出库记录单独查询 items
**修复后**: 先批量查询所有 items，再按 outbound_id 分组

**验证**:
- [ ] 出库列表无 N+1 查询
- [ ] 出库详情正常显示

---

## SF-13: 全成本报表添加分页

**修复前**: /full-cost-by-project 一次性处理所有记录
**修复后**: 添加 LIMIT/OFFSET 分页

**验证**:
- [ ] 全成本报表有分页参数
- [ ] 大数据量时不 OOM

---

## SF-14: 成本分析按 Tab 懒加载

**修复前**: useCostAnalysisPage.ts 一次发 6 个 API 请求
**修复后**: 按 Tab 切换时才请求对应数据

**验证**:
- [ ] 页面加载时只发 1 个请求
- [ ] 切换 Tab 时按需加载

---

## SF-15: 物料管理改为分页/搜索

**修复前**: useMaterialsPage.tsx 使用 pageSize: 99999 全量加载
**修复后**: 改为搜索模式，下拉使用 async search

**验证**:
- [ ] 物料列表使用分页
- [ ] 下拉选择使用搜索模式
- [ ] 无 99999 或 999 的 pageSize

---

## 本批次完成检查

- [ ] MF-10 修复完成
- [ ] SF-10~15 修复完成
- [ ] 后端测试通过
- [ ] 前端 build 成功
