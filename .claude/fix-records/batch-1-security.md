# Batch 1: 安全紧急修复记录

> **状态**: ✅ 已完成
> **目标**: 消除上线前的安全高危漏洞
> **开始时间**: 2026-06-02
> **完成时间**: 2026-06-02

---

## MF-07: Outbound.tsx document.write XSS

**修复前**:
- 文件: `前端代码/src/pages/outbound/Outbound.tsx:308-309`
- 问题: `w.document.write()` 直接拼接未转义的用户数据

**修复后**:
- 文件: `前端代码/src/pages/outbound/Outbound.tsx:___`
- 方案: 添加 escapeHtml 函数或替换为 DOM API

**验证**:
- [ ] `grep -r "document.write" 前端代码/src/` 返回 0 结果
- [ ] 打印功能正常工作
- [ ] 物料名称含特殊字符时无 XSS

**测试用例**: —

---

## MF-08: DatabaseManager.ts 硬编码密码

**修复前**:
- 文件: `后端代码/server/src/database/DatabaseManager.ts:466,481`
- 问题: `bcrypt.hashSync('admin123', 12)` 和 `bcrypt.hashSync('CoreOne2026!', 12)`

**修复后**:
- 文件: `后端代码/server/src/database/DatabaseManager.ts:___`
- 方案: 从 .env 读取或禁用默认用户创建

**验证**:
- [ ] DatabaseManager.ts 中无 `admin123` 或 `CoreOne2026!` 明文
- [ ] 系统可正常启动并创建默认用户（从 .env 读取密码）

**测试用例**: —

---

## MF-09: CORS 允许所有来源

**修复前**:
- 文件: `后端代码/server/src/app.ts:39`
- 问题: `app.use(cors())` 无任何配置

**修复后**:
- 文件: `后端代码/server/src/app.ts:___`
- 方案: `cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:8080', credentials: true })`

**验证**:
- [ ] app.ts 中 cors() 配置了 origin
- [ ] 前端请求正常（无 CORS 错误）
- [ ] 第三方网站无法调用 API

**测试用例**: —

---

## 本批次完成检查

- [ ] MF-07 修复完成
- [ ] MF-08 修复完成
- [ ] MF-09 修复完成
- [ ] 前端单元测试 84 例通过
- [ ] 后端单元/集成测试 64 例通过
- [ ] Vite build 成功
