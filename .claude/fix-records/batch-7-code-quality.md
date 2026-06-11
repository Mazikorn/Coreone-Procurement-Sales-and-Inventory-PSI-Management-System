# Batch 7: 代码质量优化记录

> **状态**: ✅ 已完成
> **目标**: 提升代码质量和可维护性
> **开始时间**: 2026-06-02
> **完成时间**: 2026-06-02

---

## NH-01: 修复 4 个 TS 编译错误

**修复前**: DatabaseSync 类型声明 + outbound BatchAllocation/GroupBatchAllocation 未导入
**修复后**: 修复 sqlite.ts 类型导出，outbound-v1.1.ts 导入 allocation.ts 类型

**验证**:
- [ ] `npx tsc --noEmit` 前后端均零错误

---

## NH-02: BOMFormModal 拆分

**修复前**: BOMFormModal.tsx ~600 行
**修复后**: 拆分为多个子组件（< 400 行/文件）

**验证**:
- [ ] BOMFormModal.tsx < 400 行
- [ ] 功能正常（创建/编辑/复制 BOM）

---

## NH-03: 清理 inline style

**修复前**: 13 个文件使用 style={{}}
**修复后**: 替换为 Tailwind 类名（仅保留动态计算场景）

**验证**:
- [ ] inline style ≤ 3 处（仅动态计算）

---

## NH-04: materials.ts 重命名

**修复前**: materials.ts 缺少版本后缀
**修复后**: 重命名为 materials-v1.1.ts 并更新 app.ts

**验证**:
- [ ] 后端路由文件均有 -v1.1 后缀
- [ ] 物料 API 正常工作

---

## NH-05: 生产环境 console.log 清理

**修复前**: app.ts、DatabaseManager.ts 有大量 console.log
**修复后**: 移除或替换为日志库

**验证**:
- [ ] 后端无 console.log（grep 确认）

---

## NH-07: 健康检查隐藏版本号

**修复前**: /api/health 返回 version: '1.1.0'
**修复后**: 移除版本号或从 package.json 动态读取

**验证**:
- [ ] /api/health 不暴露固定版本号

---

## NH-11: auth 响应动态权限

**修复前**: 登录响应返回固定权限数组
**修复后: 从 ROLE_PERMISSIONS 动态获取

**验证**:
- [ ] 不同角色获得不同权限列表

---

## NH-12: 清理 as any 类型断言

**修复前**: 49 处 as any
**修复后**: 替换为具体类型（至少减少 50%）

**验证**:
- [ ] as any 数量 ≤ 25 处

---

## NH-15: 合并独立 COUNT 查询

**修复前**: 多处独立 COUNT 查询
**修复后**: 合并为单次查询

**验证**:
- [ ] 相关查询数量减少

---

## 本批次完成检查

- [ ] NH-01~15 修复完成
- [ ] `npx tsc --noEmit` 零错误
- [ ] 前端 build 成功
- [ ] 后端测试通过
