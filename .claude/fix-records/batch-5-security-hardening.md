# Batch 5: 安全加固记录

> **状态**: ✅ 已完成
> **目标**: 加固认证、授权和输入验证
> **开始时间**: 2026-06-02
> **完成时间**: 2026-06-02

---

## SF-01: express-validator 接入核心路由

**修复前**: 26 个路由文件无 express-validator，128 处手动 if-check
**修复后**: 至少 5 个核心路由使用 express-validator 校验链

**验证**:
- [ ] 至少 5 个路由文件导入 express-validator
- [ ] 覆盖: /users, /login, /inbound, /outbound, /materials

---

## SF-02: pathToPermission 补充 v1.2 模块

**修复前**: auth.ts:35-57 缺失 /equipment、/labor-times、/indirect-costs
**修复后**: 补充三个映射

**验证**:
- [ ] pathToPermission 包含 /equipment、/labor-times、/indirect-costs
- [ ] 非 admin 用户访问这些模块时权限检查生效

---

## SF-03: 登录 rate limiting

**修复前**: POST /login 无频率限制
**修复后**: 添加 express-rate-limit 中间件

**验证**:
- [ ] /login 路由有 rate-limiting（如 5次/分钟/IP）
- [ ] express-rate-limit 已安装

---

## SF-04: 移除软删除自动恢复

**修复前**: auth.ts:23-30 登录时自动恢复被软删除用户
**修复后**: 移除自动恢复逻辑，返回明确错误

**验证**:
- [ ] 被软删除的用户无法登录
- [ ] auth.ts 无 `UPDATE users SET is_deleted = 0` 逻辑

---

## SF-05: 过期预警去重区分批次

**修复前**: alerts-v1.1.ts:130-136 去重仅检查 material_id + type
**修复后**: 去重条件增加 batch_no

**验证**:
- [ ] 同一物料不同批次过期时各生成独立预警

---

## NH-06: errorHandler NODE_ENV 严格判断

**修复前**: `process.env.NODE_ENV === 'development'`
**修复后**: `process.env.NODE_ENV !== 'production'`

**验证**:
- [ ] errorHandler 和 response.ts 使用 `!== 'production'`

---

## NH-09: 401 跳转防抖锁

**修复前**: 多个 401 响应各触发一次重定向
**修复后**: 添加 isRedirecting 标志位

**验证**:
- [ ] 401 时只执行一次重定向

---

## NH-10: 操作人从 JWT 解析

**修复前**: operator 从 localStorage 读取
**修复后**: 后端从 req.user(JWT) 解析

**验证**:
- [ ] 操作日志中的 operator 来自 JWT token
- [ ] 前端传入的 operator 字段被忽略

---

## 本批次完成检查

- [ ] SF-01~05 修复完成
- [ ] NH-06/09/10 修复完成
- [ ] 后端测试通过
