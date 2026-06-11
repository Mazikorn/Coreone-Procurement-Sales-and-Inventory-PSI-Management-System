# COREONE 病理科耗材管理系统 — 功能需求规格文档 (FRS)

> **版本**: v1.1.0  
> **生成时间**: 2026-05-12  
> **覆盖模块**: 16个功能入口  
> **数据来源**: 后端路由源码逆向分析

---

## 目录

1. [全局规范](#一全局规范)
2. [FRS-01 认证与登录](#二frs-01-认证与登录)
3. [FRS-02 用户管理](#三frs-02-用户管理)
4. [FRS-03 角色管理](#四frs-03-角色管理)
5. [FRS-04 供应商管理](#五frs-04-供应商管理)
6. [FRS-05 物料分类](#六frs-05-物料分类)
7. [FRS-06 物料管理](#七frs-06-物料管理)
8. [FRS-07 库存管理](#八frs-07-库存管理)
9. [FRS-08 入库管理](#九frs-08-入库管理)
10. [FRS-09 出库管理](#十frs-09-出库管理)
11. [FRS-10 库位管理](#十一frs-10-库位管理)
12. [FRS-11 采购订单](#十二frs-11-采购订单)
13. [FRS-12 BOM管理](#十三frs-12-bom管理)
14. [FRS-13 项目管理](#十四frs-13-项目管理)
15. [FRS-14 成本分析](#十五frs-14-成本分析)
16. [FRS-15 预警管理](#十六frs-15-预警管理)
17. [FRS-16 操作日志](#十七frs-16-操作日志)

---

## 一、全局规范

### 1.1 通用响应格式

```json
// 成功（单条）
{ "success": true, "data": { ... }, "message": "操作成功" }

// 成功（列表）
{ "success": true, "data": { "list": [...], "pagination": { "page": 1, "pageSize": 20, "total": 100 } }, "message": "操作成功" }

// 错误
{ "success": false, "error": { "code": "INVALID_PARAMETER", "message": "..." } }
```

### 1.2 分页规则

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | integer | 1 | 当前页码，page=0 时按1处理 |
| `pageSize` | integer | 20 | 每页条数，支持pageSize=1000 |

**隐含规则**: 分页从1开始计数，page=0时后端按1处理。

### 1.3 错误码体系

| 错误码 | HTTP状态 | 含义 |
|--------|---------|------|
| `INVALID_PARAMETER` | 400 | 参数缺失/格式错误 |
| `UNAUTHORIZED` | 401 | 未认证/Token无效/密码错误 |
| `FORBIDDEN` | 403 | 无权限访问（RBAC拦截） |
| `NOT_FOUND` | 404 | 记录不存在 |
| `RESOURCE_CONFLICT` | 409 | 唯一性冲突/业务冲突 |
| `BUSINESS_RULE` | 400 | 违反业务规则 |
| `STOCK_INSUFFICIENT` | 422 | 库存不足 |
| `CONFLICT` | 409 | 存在关联数据，无法删除 |
| `INTERNAL_ERROR` | 500 | 内部错误 |

### 1.4 通用字段规范

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | UUIDv4 | 自动生成 | 主键，全局唯一 |
| `created_at` | datetime | CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | datetime | CURRENT_TIMESTAMP | 更新时间（UPDATE时自动刷新） |
| `is_deleted` | integer(0/1) | 0 | 逻辑删除标志 |
| `status` | integer(0/1) | 1 | 1=active, 0=inactive |

### 1.5 非功能性需求

| 维度 | 要求 |
|------|------|
| **响应时间** | 简单查询 < 200ms，复杂报表 < 1s |
| **并发** | SQLite文件锁限制，不支持高并发写入 |
| **数据精度** | 金额/数量使用 DECIMAL(18,4) |
| **密码安全** | bcrypt 12轮哈希，服务端不返回password字段 |
| **Token安全** | JWT HS256，8h有效期，refreshToken 7天 |

---

## 二、FRS-01 认证与登录

### 2.1 功能概述

系统认证入口，支持密码登录、Token刷新、登出。

**可访问角色**: 全部角色（无需认证）

### 2.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/auth/login` | 用户名密码登录 |
| POST | `/auth/refresh` | 刷新Access Token |
| POST | `/auth/logout` | 登出 |

### 2.3 表单字段

#### 2.3.1 POST /auth/login — 登录

| 字段 | 必填 | 类型 | 长度 | 格式 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|------|------|--------|---------|---------|
| `username` | ✅ | string | - | - | - | 非空 | "Username and password required" |
| `password` | ✅ | string | - | - | - | 非空 | "Username and password required" |

**业务流程规则**:
1. 查询用户：`SELECT * FROM users WHERE username = ? AND status = 1 AND is_deleted = 0`
2. 用户不存在 → 返回401，错误码`UNAUTHORIZED`，文案"User not found or disabled"
3. 密码不匹配（bcrypt.compareSync失败）→ 返回401，错误码`UNAUTHORIZED`，文案"Invalid password"
4. 成功 → 生成JWT Token + RefreshToken

**自动生成字段**:
- `token`: JWT，payload含`userId`+`username`+`role`，有效期8h
- `refreshToken`: JWT，payload含`userId`+`type:'refresh'`，有效期7天
- `expiresIn`: 固定值28800（秒）
- `user.permissions`: 固定返回`['inventory:view', 'inventory:edit', 'report:view', 'system:view']`（实际权限由RBAC控制，此字段仅为前端展示）

**隐含规则**: `permissions`字段为硬编码，不反映真实角色权限；真实权限由`auth.ts`中间件控制。

#### 2.3.2 POST /auth/refresh — Token刷新

| 字段 | 必填 | 类型 | 校验规则 | 错误提示 |
|------|------|------|---------|---------|
| `refreshToken` | ✅ | string | 非空 | "Refresh token required" |

**业务流程规则**:
1. 验证refreshToken签名和`type === 'refresh'`
2. type不匹配 → 401 "Invalid refresh token"
3. 查询用户是否存在且status=1
4. 用户不存在/禁用 → 401 "User not found or disabled"
5. 成功 → 生成新access token（新的8h有效期）

#### 2.3.3 POST /auth/logout — 登出

| 字段 | 必填 | 说明 |
|------|------|------|
| 无 | - | 无参数，始终返回成功 |

**隐含规则**: 服务端**无Token黑名单**，登出仅前端清除localStorage中的token，已颁发的token在8h内仍然有效。

### 2.4 交互细节

| 场景 | 反馈 |
|------|------|
| 登录成功 | 返回200，含token+user信息，前端跳转至Dashboard |
| 登录失败 | Toast提示错误文案，保留用户名，清空密码框 |
| Token过期 | API返回401，前端自动调用/refresh刷新；refresh失败则跳转登录页 |
| 并发登录 | 允许多处同时登录，各自独立token |

---

## 三、FRS-02 用户管理

### 3.1 功能概述

系统用户CRUD管理，仅admin可访问。

**可访问角色**: `admin`（RBAC: `requireRole('admin')`）

### 3.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/users` | 列表（分页+搜索） |
| POST | `/users` | 创建用户 |
| PUT | `/users/:id` | 编辑用户 |
| DELETE | `/users/:id` | 删除用户（逻辑删除） |

### 3.3 表单字段

#### 3.3.1 GET /users — 用户列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `keyword` | ❌ | string | - | 搜索用户名或真实姓名（LIKE模糊匹配） |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `username` | string | 登录用户名 |
| `realName` | string | 真实姓名 |
| `role` | string | 角色编码 |
| `department` | string | 部门 |
| `phone` | string | 电话 |
| `email` | string | 邮箱 |
| `status` | enum | "active"/"inactive"（1→active, 0→inactive） |
| `createdAt` | datetime | 创建时间 |

**隐含规则**: 密码字段`password`不返回给前端；仅返回`is_deleted = 0`的用户。

#### 3.3.2 POST /users — 创建用户

| 字段 | 必填 | 类型 | 长度 | 格式 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|------|------|--------|---------|---------|
| `username` | ✅ | string | - | - | - | 非空 | "Username, password and realName required" |
| `password` | ✅ | string | - | - | - | 非空 | "Username, password and realName required" |
| `realName` | ✅ | string | - | - | - | 非空 | "Username, password and realName required" |
| `role` | ❌ | string | - | - | "operator" | 有效角色编码之一 | - |
| `department` | ❌ | string | - | - | null | - | - |
| `phone` | ❌ | string | - | - | null | - | - |

**业务流程规则**:
1. `id` = UUIDv4() 自动生成
2. `password` = bcrypt.hashSync(password, 12) 自动加密
3. `status` = 1（active）
4. username唯一性冲突 → 409 "Username exists"

**隐含规则**: 
- `role`若不传则默认为"operator"，但该角色不在系统的6个正式角色中（系统的角色是admin/warehouse_manager/technician/pathologist/procurement/finance）
- 创建用户后不会自动分配权限，权限完全由role字段决定

#### 3.3.3 PUT /users/:id — 编辑用户

| 字段 | 必填 | 类型 | 校验规则 | 说明 |
|------|------|------|---------|------|
| `realName` | ❌ | string | - | 真实姓名 |
| `role` | ❌ | string | - | 角色 |
| `department` | ❌ | string | - | 部门 |
| `phone` | ❌ | string | - | 电话 |
| `email` | ❌ | string | - | 邮箱 |
| `status` | ❌ | enum | "active"/"inactive" | 状态 |
| `password` | ❌ | string | - | 新密码（若传则重新bcrypt哈希） |

**隐含规则**: 仅传需要修改的字段，未传字段保持原值；`status`字符串转整数存储（"active"→1, "inactive"→0）。

#### 3.3.4 DELETE /users/:id — 删除用户

**业务流程规则**: 逻辑删除，UPDATE `is_deleted = 1`；无前置关联校验（即使该用户有操作记录也可删除）。

### 3.4 交互细节

| 场景 | 反馈 |
|------|------|
| 创建成功 | 201 Created，返回新用户id |
| 用户名重复 | 409冲突提示 |
| 编辑成功 | 200，返回{id} |
| 删除成功 | 200，无data |

---

## 四、FRS-03 角色管理

### 4.1 功能概述

角色CRUD管理，定义角色的编码、名称、权限列表。仅admin可访问。

**可访问角色**: `admin`

### 4.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/roles` | 列表（分页） |
| POST | `/roles` | 创建角色 |
| PUT | `/roles/:id` | 编辑角色 |
| DELETE | `/roles/:id` | 删除角色（逻辑删除） |

### 4.3 表单字段

#### 4.3.1 GET /roles — 角色列表

| 查询参数 | 必填 | 类型 | 默认值 |
|---------|------|------|--------|
| `page` | ❌ | integer | 1 |
| `pageSize` | ❌ | integer | 20 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `code` | string | 角色编码（唯一） |
| `name` | string | 角色名称 |
| `description` | string | 描述 |
| `permissions` | string(JSON) | 权限列表JSON字符串 |
| `status` | integer | 1=active, 0=inactive |

**隐含规则**: `permissions`字段在数据库中存储为JSON字符串（如`'["inventory", "alerts"]'`），非字符串数组。前端需`JSON.parse()`解析。

#### 4.3.2 POST /roles — 创建角色

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `code` | ✅ | string | - | 非空，全局唯一 | "Code and name required" / "Role code already exists" |
| `name` | ✅ | string | - | 非空 | "Code and name required" |
| `description` | ❌ | string | '' | - | - |
| `permissions` | ❌ | string[] | [] | 字符串数组 | - |
| `status` | ❌ | enum | "active" | "active"/"inactive" | - |

**业务流程规则**:
1. 校验`code`和`name`非空
2. 查询`code`是否已存在（`is_deleted = 0`）→ 存在则409
3. `permissions`序列化为JSON字符串存储
4. `status` = "active" ? 1 : 0

**隐含规则**: 
- `code`区分大小写
- 预置6个角色（admin/warehouse_manager/technician/pathologist/procurement/finance），其code不可被新角色占用

#### 4.3.3 PUT /roles/:id — 编辑角色

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `code` | ❌ | string | 角色编码 |
| `name` | ❌ | string | 角色名称 |
| `description` | ❌ | string | 描述 |
| `permissions` | ❌ | string[] | 权限数组（序列化存储） |
| `status` | ❌ | enum | "active"/"inactive" |

**业务流程规则**: 
1. 查询角色是否存在且`is_deleted = 0` → 不存在404
2. 全字段覆盖更新（PUT语义）

#### 4.3.4 DELETE /roles/:id — 删除角色

**业务流程规则**: 逻辑删除，UPDATE `is_deleted = 1`；无关联校验（即使有用户绑定此角色也可删除）。

**隐含规则**: 删除角色后，已绑定该角色的用户登录不受影响（RBAC基于role字段字符串匹配，不校验roles表存在性）。

### 4.4 交互细节

| 场景 | 反馈 |
|------|------|
| 创建重复code | 409，文案"Role code already exists" |
| 编辑不存在的角色 | 404 "Role not found" |
| 权限编辑 | permissions为JSON数组，如`["inventory", "alerts"]` |

---

## 五、FRS-04 供应商管理

### 5.1 功能概述

供应商档案CRUD管理，含编码自动生成、评级字段。

**可访问角色**: `admin`（全操作）、`warehouse_manager`（读）、`procurement`（读）

### 5.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/suppliers` | 列表（分页+搜索+状态筛选） |
| POST | `/suppliers` | 创建供应商 |
| PUT | `/suppliers/:id` | 编辑供应商 |
| DELETE | `/suppliers/:id` | 删除供应商 |

### 5.3 表单字段

#### 5.3.1 GET /suppliers — 供应商列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `keyword` | ❌ | string | - | 搜索名称或编码（LIKE `%keyword%`） |
| `status` | ❌ | enum | - | "active"/"inactive"筛选 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `code` | string | 供应商编码（SUP-xxxxx格式） |
| `name` | string | 供应商名称 |
| `contact` | string | 联系人 |
| `phone` | string | 联系电话 |
| `email` | string | 邮箱 |
| `address` | string | 地址 |
| `status` | enum | "active"/"inactive" |
| `cooperationCount` | integer | 合作次数 |
| `totalAmount` | decimal | 累计采购金额 |
| `rating` | integer | 评级(1-5) |

#### 5.3.2 POST /suppliers — 创建供应商

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `name` | ✅ | string | - | 非空 | "Name required" |
| `contact` | ❌ | string | null | - | - |
| `phone` | ❌ | string | null | - | - |
| `email` | ❌ | string | null | - | - |
| `address` | ❌ | string | null | - | - |

**业务流程规则**:
1. `code`自动生成：`SUP-${String(num).padStart(5, '0')}`，num为现有SUP-编码最大值+1
2. `status` = 1（active）
3. `cooperationCount` = 0, `totalAmount` = 0, `rating` = 5（默认值）

**隐含规则**: 
- code生成公式：`MAX(CAST(SUBSTR(code, 5) AS INTEGER)) + 1`，其中SUBSTR(code, 5)提取"SUP-"后的数字部分
- code唯一性冲突 → 409 "Code exists"

#### 5.3.3 PUT /suppliers/:id — 编辑供应商

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `code` | ❌ | string | 供应商编码 |
| `name` | ❌ | string | 名称 |
| `contact` | ❌ | string | 联系人 |
| `phone` | ❌ | string | 电话 |
| `email` | ❌ | string | 邮箱 |
| `address` | ❌ | string | 地址 |
| `status` | ❌ | enum | "active"/"inactive" |

**隐含规则**: 仅传字段更新，不传保持原值；字段级PATCH语义。

#### 5.3.4 DELETE /suppliers/:id — 删除供应商

**业务流程规则**: 逻辑删除；无关联校验（即使有采购订单引用也可删除）。

**隐含规则**: 删除供应商后，物料表中的`supplier_id`外键成为悬空引用，不会级联更新。

---

## 六、FRS-05 物料分类

### 6.1 功能概述

三级分类树管理，支持编码自动生成、树形展示。分类下可挂载物料。

**可访问角色**: 全部角色可读；创建/编辑/删除仅admin

### 6.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/categories/tree` | 三级分类树 |
| GET | `/categories` | 列表（分页+搜索） |
| POST | `/categories` | 创建分类 |
| PUT | `/categories/:id` | 编辑分类 |
| DELETE | `/categories/:id` | 删除分类 |

### 6.3 表单字段

#### 6.3.1 GET /categories/tree — 分类树

**响应结构**:
```json
[
  {
    "id": "CAT-100", "code": "100", "name": "试剂类", "level": 1,
    "children": [
      { "id": "CAT-101", "code": "101", "name": "HE染色", "level": 2,
        "children": [
          { "id": "CAT-10101", "code": "10101", "name": "苏木素", "level": 3, "isLeaf": true, "count": 5 }
        ]
      }
    ]
  }
]
```

**隐含规则**: 
- `count` = 该分类下直接关联的物料数量（`SELECT COUNT(*) FROM materials WHERE category_id = ?`）
- `isLeaf` = 无子节点时为true

#### 6.3.2 POST /categories — 创建分类

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `name` | ✅ | string | - | 非空 | "Name and level required" |
| `level` | ✅ | integer(1-3) | - | 1/2/3 | "Name and level required" |
| `parentId` | ❌ | string | null | 指向父分类id | - |
| `sortOrder` | ❌ | integer | 0 | - | - |

**业务流程规则**:
1. `code`自动生成：
   - 一级分类：`MAX(CAST(code AS INTEGER)) + 100`（步长100，如100, 200, 300）
   - 二级/三级：`MAX(同parent下的code) + 1`
2. `status` = 1
3. code唯一性冲突 → 409 "Code already exists"

**隐含规则**: 
- code为纯数字字符串，一级以00结尾（100, 200...），二级在100-199之间，三级在101-199之间
- `parentId`为null时创建一级分类

#### 6.3.3 DELETE /categories/:id — 删除分类

**业务流程规则**:
1. 检查是否有子分类 → 有则409 "Has children"
2. 检查是否有关联物料 → 有则409 "Has materials"
3. 通过校验 → 逻辑删除

### 6.4 交互细节

| 场景 | 反馈 |
|------|------|
| 创建一级分类 | code自动分配为100, 200, 300... |
| 删除有子分类 | 禁止删除，提示"Has children" |
| 删除有关联物料 | 禁止删除，提示"Has materials" |

---

## 七、FRS-06 物料管理

### 7.1 功能概述

物料主数据管理，含自动编码生成、分类/供应商/库位关联、批次追踪详情。

**可访问角色**: admin（全操作）、warehouse_manager/technician/pathologist/procurement（读）

### 7.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/materials` | 列表（分页+多维筛选） |
| GET | `/materials/next-code` | 获取下一个物料编码 |
| GET | `/materials/:id` | 详情（含批次+流水） |
| POST | `/materials` | 创建物料 |
| PUT | `/materials/:id` | 编辑物料 |
| DELETE | `/materials/:id` | 删除物料 |
| PATCH | `/materials/batch-status` | 批量启停 |

### 7.3 表单字段

#### 7.3.1 GET /materials — 物料列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `keyword` | ❌ | string | - | 搜索名称或编码 |
| `categoryId` | ❌ | string | - | 按分类筛选 |
| `supplierId` | ❌ | string | - | 按供应商筛选 |
| `status` | ❌ | enum | - | "active"/"inactive" |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `code` | string | 物料编码（REA-xxxxx/CON-xxxxx/DEV-xxxxx/HZP-xxxxx） |
| `name` | string | 物料名称 |
| `spec` | string | 规格 |
| `unit` | string | 单位 |
| `specQty` | decimal | 规格数量 |
| `specUnit` | string | 规格单位 |
| `price` | decimal | 单价 |
| `stock` | decimal | 当前库存（JOIN inventory） |
| `minStock` | integer | 最低库存 |
| `maxStock` | integer | 最高库存（默认999999） |
| `safetyStock` | integer | 安全库存 |
| `locationId` | string | 默认库位 |
| `locationName` | string | 库位名称 |
| `categoryId` | string | 分类id |
| `categoryPath` | string | 分类名称 |
| `supplierId` | string | 供应商id |
| `supplierName` | string | 供应商名称 |
| `status` | enum | "active"/"inactive" |

#### 7.3.2 GET /materials/next-code — 获取下一个编码

| 查询参数 | 必填 | 类型 | 说明 |
|---------|------|------|------|
| `categoryId` | ✅ | string | 分类id |

**业务流程规则**:
1. 查询分类code → 计算前缀：`floor(code / 100)`
   - 1 → "REA"（试剂）
   - 2 → "CON"（耗材）
   - 3 → "DEV"（设备）
   - 4 → "HZP"（危化品）
2. 查询该前缀下的最大编号 → +1

**隐含规则**: 
- 编码格式：`PREFIX-xxxxx`，5位数字，不足补零
- 示例：`REA-00001`, `CON-00042`

#### 7.3.3 GET /materials/:id — 物料详情

**响应扩展字段**（在列表字段基础上增加）:

| 字段 | 类型 | 说明 |
|------|------|------|
| `batches` | array | 活跃批次列表（status=1，按expiry_date升序） |
| `stockLogs` | array | 最近20条库存流水 |

**批次字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 批次id |
| `batchNo` | string | 批号 |
| `quantity` | decimal | 入库数量 |
| `productionDate` | date | 生产日期 |
| `expiryDate` | date | 有效期至 |
| `inboundId` | string | 关联入库单 |

#### 7.3.4 POST /materials — 创建物料

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `name` | ✅ | string | - | 非空 | "Name, unit and category required" |
| `unit` | ✅ | string | - | 非空 | "Name, unit and category required" |
| `categoryId` | ✅ | string | - | 非空 | "Name, unit and category required" |
| `code` | ❌ | string | 自动生成 | 唯一性 | "Code already exists" |
| `spec` | ❌ | string | null | - | - |
| `specQty` | ❌ | decimal | 0 | - | - |
| `specUnit` | ❌ | string | null | - | - |
| `supplierId` | ❌ | string | null | - | - |
| `price` | ❌ | decimal | 0 | ≥0 | - |
| `minStock` | ❌ | integer | 0 | ≥0 | - |
| `maxStock` | ❌ | integer | 999999 | ≥0 | - |
| `safetyStock` | ❌ | integer | 0 | ≥0 | - |
| `locationId` | ❌ | string | null | - | - |
| `remark` | ❌ | string | null | - | - |

**业务流程规则**:
1. 若传`code` → 校验唯一性 → 冲突则409
2. 若未传`code` → 按分类自动生成（调用`generateMaterialCode`）
3. `status` = 1（active）
4. 自动创建inventory记录：`stock = 0`, `locked_stock = 0`

**隐含规则**: 
- `price` = 0 是允许的（边界测试已验证）
- `price` < 0 后端未显式校验（但前端应限制）
- 创建物料后立即有一条inventory记录（stock=0），即使从未入库

#### 7.3.5 PUT /materials/:id — 编辑物料

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `code` | ❌ | string | 编码 |
| `name` | ❌ | string | 名称 |
| `spec` | ❌ | string | 规格 |
| `unit` | ❌ | string | 单位 |
| `specQty` | ❌ | decimal | 规格数量 |
| `specUnit` | ❌ | string | 规格单位 |
| `categoryId` | ❌ | string | 分类 |
| `supplierId` | ❌ | string | 供应商 |
| `price` | ❌ | decimal | 单价 |
| `minStock` | ❌ | integer | 最低库存 |
| `maxStock` | ❌ | integer | 最高库存 |
| `safetyStock` | ❌ | integer | 安全库存 |
| `locationId` | ❌ | string | 库位 |
| `remark` | ❌ | string | 备注 |
| `status` | ❌ | enum | "active"/"inactive" |

#### 7.3.6 DELETE /materials/:id — 删除物料

**业务流程规则**:
1. 检查inventory.stock > 0 → 是则409 "Stock exists"
2. 通过校验 → 逻辑删除

**隐含规则**: 
- 仅检查`inventory.stock`，不检查`inventory.locked_stock`
- 删除后，该物料的历史入库/出库记录仍然保留（通过material_id关联）

#### 7.3.7 PATCH /materials/batch-status — 批量启停

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `ids` | ✅ | string[] | 物料id数组 |
| `status` | ✅ | enum | "active"/"inactive" |

**业务流程规则**: 事务批量更新所有id的status字段。

---

## 八、FRS-07 库存管理

### 8.1 功能概述

库存实时查询与统计，基于入库记录聚合计算，支持多状态筛选。

**可访问角色**: admin/warehouse_manager/technician/pathologist/procurement（读）；finance不可访问

### 8.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/inventory` | 库存列表（按批次聚合） |
| GET | `/inventory/stats` | 库存统计看板 |

### 8.3 表单字段

#### 8.3.1 GET /inventory — 库存列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `keyword` | ❌ | string | - | 搜索名称/编码 |
| `categoryId` | ❌ | string | - | 分类筛选 |
| `locationId` | ❌ | string | - | 库位筛选 |
| `status` | ❌ | enum | - | "low-stock"（低库存筛选） |

**核心计算逻辑**:
```sql
SELECT material_id, batch_no, SUM(quantity) as stock, location_id, MAX(expiry_date) as expiry
FROM inbound_records
WHERE status = 'completed' AND is_deleted = 0
GROUP BY material_id, batch_no, location_id
```

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 合成ID：`INV-${material_id}-${batch_no}` |
| `materialId` | string | 物料id |
| `code` | string | 物料编码 |
| `name` | string | 物料名称 |
| `spec` | string | 规格 |
| `unit` | string | 单位 |
| `stock` | decimal | 库存数量（SUM(inbound.quantity)） |
| `minStock` | integer | 最低库存 |
| `maxStock` | integer | 最高库存 |
| `availableStock` | decimal | 可用库存（= stock，无锁定概念） |
| `locationId` | string | 库位 |
| `locationName` | string | 库位名称 |
| `supplierId` | string | 供应商 |
| `supplierName` | string | 供应商名称 |
| `status` | enum | 动态计算状态 |
| `batch` | string | 批号 |
| `expiry` | date | 有效期 |

**状态计算规则**（按优先级降序）:

| 条件 | 状态 | 说明 |
|------|------|------|
| `stock <= 0` | `out-of-stock` | 缺货 |
| `expiry <= today` | `expired` | 已过期 |
| `expiry <= today + 30天` | `warning` | 临期 |
| `stock <= minStock` AND `minStock > 0` | `low-stock` | 低库存 |
| 以上都不满足 | `normal` | 正常 |

**隐含规则**: 
- 库存查询基于`inbound_records`聚合，而非`inventory`表；`inventory`表仅用于快速库存扣减
- 同物料+同批号+同库位合并为一条记录
- `expiry`取该批次入库记录中的最大有效期

#### 8.3.2 GET /inventory/stats — 库存统计

**响应字段**:

| 字段 | 类型 | 计算公式 |
|------|------|---------|
| `totalMaterials` | integer | `COUNT(*) FROM materials WHERE is_deleted = 0` |
| `totalStockValue` | decimal | `SUM(inbound.quantity * material.price)` |
| `totalStockCount` | integer | 有库存的批次数 |
| `normalCount` | integer | 正常状态批次数 |
| `lowStockCount` | integer | 低库存批次数 |
| `expiringCount` | integer | 临期批次数（30天内过期） |
| `expiredCount` | integer | 已过期批次数 |
| `categoryDistribution` | array | 一级分类物料分布 |

**状态统计公式**:

```
normal = stock > min_stock AND (expiry IS NULL OR expiry > today+30days)
low_stock = min_stock > 0 AND stock <= min_stock
expiring = expiry IS NOT NULL AND expiry <= today+30days AND expiry > today
expired = expiry IS NOT NULL AND expiry <= today
```

### 8.4 交互细节

| 场景 | 反馈 |
|------|------|
| 低库存筛选 | 仅返回`status=low-stock`的记录 |
| 状态优先级 | expired > warning > low-stock > normal |
| 统计看板 | 按批次维度统计，非物料维度 |

---

## 九、FRS-08 入库管理

### 9.1 功能概述

入库单全流程管理，支持采购入库/退货入库/调拨入库，自动更新库存、批次、采购订单收货量。

**可访问角色**: admin/warehouse_manager（创建/读）；procurement（读）

### 9.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/inbound` | 列表（分页+状态+日期筛选） |
| GET | `/inbound/:id/check-deletable` | 检查可否删除 |
| POST | `/inbound` | 创建入库单 |
| PUT | `/inbound/:id` | 编辑入库单 |
| DELETE | `/inbound/:id` | 删除入库单 |
| POST | `/inbound/:id/cancel` | 取消入库单 |

### 9.3 表单字段

#### 9.3.1 GET /inbound — 入库列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `status` | ❌ | enum | - | "completed"/"pending"/"cancelled" |
| `startDate` | ❌ | date | - | 开始日期（>= created_at） |
| `endDate` | ❌ | date | - | 结束日期（<= created_at + 23:59:59） |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `inboundNo` | string | 入库单号（IB-yyyymmdd-xxx格式） |
| `type` | string | 入库类型（purchase/return/transfer） |
| `materialId` | string | 物料id |
| `materialName` | string | 物料名称 |
| `batchNo` | string | 批号 |
| `quantity` | decimal | 数量 |
| `unit` | string | 单位 |
| `price` | decimal | 单价 |
| `amount` | decimal | 金额 = quantity × price |
| `supplierId` | string | 供应商id |
| `supplierName` | string | 供应商名称 |
| `locationId` | string | 库位id |
| `locationName` | string | 库位名称 |
| `productionDate` | date | 生产日期 |
| `expiryDate` | date | 有效期至 |
| `operator` | string | 操作人 |
| `status` | string | "completed"/"pending"/"cancelled" |
| `purchaseOrderId` | string | 关联采购单id |
| `purchaseOrderNo` | string | 关联采购单号 |

**隐含规则**: 
- `endDate`筛选时自动附加`T23:59:59`时间后缀
- 单号格式：`IB-` + 日期(8位) + `-` + 3位随机数

#### 9.3.2 GET /inbound/:id/check-deletable — 删除前检查

**业务流程规则**:

| 检查项 | 条件 | 结果 |
|--------|------|------|
| 出库记录 | `SUM(outbound_items.quantity) > 0` | canDelete=false，原因"该批次已有出库记录 X unit" |
| 使用中 | `batch_usage_tracking.status='in-use'` | canDelete=false，原因"该批次库存正在使用中" |
| 库存为负 | `剩余入库 < 已出库` | canDelete=false，原因"删除后该批次库存将变为负数" |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `canDelete` | boolean | 是否可删除 |
| `reasons` | string[] | 不可删除的原因列表 |
| `record` | object | 入库记录摘要 |

#### 9.3.3 POST /inbound — 创建入库单

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `type` | ✅ | string | - | 非空 | "Missing required fields" |
| `materialId` | ✅ | string | - | 非空 | "Missing required fields" |
| `quantity` | ✅ | decimal | - | >0 | "Missing required fields" |
| `locationId` | ✅ | string | - | 非空 | "Missing required fields" |
| `batchNo` | ❌ | string | null | - | - |
| `price` | ❌ | decimal | 0 | ≥0 | - |
| `supplierId` | ❌ | string | null | - | - |
| `purchaseOrderId` | ❌ | string | null | - | - |
| `productionDate` | ❌ | date | null | - | - |
| `expiryDate` | ❌ | date | null | - | - |
| `remark` | ❌ | string | null | - | - |
| `operator` | ❌ | string | "system" | - | - |

**业务流程规则**:
1. `inboundNo`自动生成：`IB-yyyymmdd-xxx`
2. `unit`自动从materials表获取
3. `amount` = `quantity × price`
4. `status` = "completed"
5. 若关联`purchaseOrderId` → 自动更新PO的`received_qty`和`status`
6. 若传`batchNo` → 检查batches表是否存在 → 存在则累加quantity/remaining → 不存在则创建新批次
7. 更新inventory表：stock += quantity
8. 写入stock_logs流水

**采购订单状态更新规则**:

```
newReceived = PO.received_qty + quantity
IF newReceived >= PO.ordered_qty THEN PO.status = 'completed'
ELSE PO.status = 'partial'
```

**批次管理规则**:

```
IF batchNo存在 THEN
  UPDATE batches SET quantity += quantity, remaining += quantity
ELSE
  INSERT batches (quantity = quantity, remaining = quantity, status = 1)
```

#### 9.3.4 DELETE /inbound/:id — 删除入库单

**业务流程规则**（共7步，事务级联）:

| 步骤 | 操作 | 失败条件 |
|------|------|---------|
| 1 | 检查出库记录 | 有出库 → 400 "已有出库记录，不可删除" |
| 2 | 检查使用中 | 使用中 → 400 "正在使用中" |
| 3 | 检查库存为负 | 删除后库存<0 → 400 "库存将变为负数" |
| 4 | 回退采购订单 | PO.received_qty -= quantity，status更新为pending/partial |
| 5 | 扣减批次数量 | batches.quantity -= quantity, remaining -= quantity |
| 6 | 软删除入库记录 | is_deleted = 1 |
| 7 | 记录操作日志 | stock_logs写入delete类型流水 |

**采购订单回退规则**:

```
newReceived = MAX(0, PO.received_qty - quantity)
IF newReceived == 0 THEN PO.status = 'pending'
ELSE PO.status = 'partial'
```

**批次回退规则**:

```
batches.remaining -= quantity
IF batches.remaining <= 0 THEN batches.status = 0
```

#### 9.3.5 POST /inbound/:id/cancel — 取消入库单

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `reason` | ❌ | string | 取消原因 |

**业务流程规则**: 仅更新status="cancelled"和cancel_reason，不触发库存/批次/PO回退。

**隐含规则**: 取消与删除不同，取消不扣减库存；取消后该记录仍在列表中显示（status=cancelled）。

### 9.4 交互细节

| 场景 | 反馈 |
|------|------|
| 创建入库 | 成功200，返回入库单详情 |
| 数量=0 | 后端未显式拦截（边界测试：通过） |
| 负数数量 | 后端未显式拦截（边界测试：通过） |
| 删除有出库 | 弹窗提示不可删除原因 |
| 取消入库 | 可填写取消原因，状态变为cancelled |

---

## 十、FRS-09 出库管理

### 10.1 功能概述

出库单创建与查询，支持项目领用/调拨/报废，自动FIFO批次分配和库存扣减。

**可访问角色**: admin/warehouse_manager/technician/pathologist（创建/读）；procurement不可创建

### 10.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/outbound` | 列表（分页+项目/状态筛选） |
| POST | `/outbound` | 创建出库单 |

### 10.3 表单字段

#### 10.3.1 GET /outbound — 出库列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `projectId` | ❌ | string | - | 按项目筛选 |
| `status` | ❌ | enum | - | "completed"等 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `outboundNo` | string | 出库单号（OB-yyyymmdd-xxx） |
| `type` | string | 类型（project/transfer/scrap） |
| `projectId` | string | 项目id |
| `projectName` | string | 项目名称 |
| `items` | array | 出库明细列表 |
| `totalCost` | decimal | 总成本 |
| `operator` | string | 操作人 |
| `status` | string | "completed" |
| `remark` | string | 备注 |
| `createdAt` | datetime | 创建时间 |

**明细字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 明细id |
| `materialId` | string | 物料id |
| `materialName` | string | 物料名称 |
| `batchNo` | string | 分配的批号 |
| `quantity` | decimal | 数量 |
| `unit` | string | 单位 |
| `unitCost` | decimal | 单位成本（入库价） |
| `totalCost` | decimal | 明细成本 = quantity × unitCost |

#### 10.3.2 POST /outbound — 创建出库单

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `type` | ✅ | string | - | 非空 | "Missing required fields" |
| `items` | ✅ | array | - | 非空数组 | "Missing required fields" |
| `projectId` | ❌ | string | null | - | - |
| `operator` | ❌ | string | "system" | - | - |
| `remark` | ❌ | string | null | - | - |

**items数组元素字段**:

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `materialId` | ✅ | string | 物料id |
| `quantity` | ✅ | decimal | 数量 |
| `usage` | ❌ | string | 用途（self/return），默认"self" |
| `receiver` | ❌ | string | 领用人 |

**业务流程规则**（共6步）:

| 步骤 | 操作 | 失败条件 |
|------|------|---------|
| 1 | 校验库存充足 | `inventory.stock < quantity` → 422 "Insufficient stock" |
| 2 | FIFO批次分配 | 查询最早过期批次（`ORDER BY expiry_date ASC`） |
| 3 | 计算成本 | `unitCost` = 批次入库价，`itemCost` = quantity × unitCost |
| 4 | 创建出库记录 | INSERT outbound_records + outbound_items |
| 5 | 扣减库存 | inventory.stock -= quantity；batch.remaining -= quantity |
| 6 | 记录流水 | stock_logs写入outbound类型 |

**FIFO批次分配规则**:

```sql
SELECT * FROM batches 
WHERE material_id = ? AND remaining > 0 AND status = 1 
ORDER BY expiry_date ASC 
LIMIT 1
```

**隐含规则**: 
- FIFO仅取最早一个批次，不跨批次分配（若该批次剩余不足，仍只分配该批次）
- `batchNo`可能为null（若该物料无活跃批次记录）
- 批次剩余<=0时自动设置status=0

### 10.4 交互细节

| 场景 | 反馈 |
|------|------|
| 库存不足 | 422，整单拒绝（非部分出库） |
| 创建成功 | 200，返回出库单详情 |
| 成本计算 | 按最早过期批次的入库价计算 |

---

## 十一、FRS-10 库位管理

### 11.1 功能概述

库位档案管理，支持树形结构和区域划分。

**可访问角色**: admin/warehouse_manager（全操作）；其他角色不可访问

### 11.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/locations` | 列表（分页+区域/类型/状态筛选） |
| GET | `/locations/tree` | 库位树形结构 |
| POST | `/locations` | 创建库位 |
| PUT | `/locations/:id` | 编辑库位 |
| DELETE | `/locations/:id` | 删除库位 |

### 11.3 表单字段

#### 11.3.1 GET /locations — 库位列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `zone` | ❌ | string | - | 区域筛选 |
| `type` | ❌ | string | - | 类型筛选（shelf/room/cabinet/refrigerator） |
| `status` | ❌ | enum | - | "active"/"inactive" |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `code` | string | 编码（LOC-xxxxx） |
| `name` | string | 名称 |
| `type` | string | 类型 |
| `parentId` | string | 父库位 |
| `zone` | string | 区域 |
| `shelf` | string | 货架 |
| `position` | string | 位置 |
| `capacity` | integer | 容量 |
| `used` | integer | 已用数量 |
| `status` | enum | "active"/"inactive" |

#### 11.3.2 POST /locations — 创建库位

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `name` | ✅ | string | - | 非空 | "Name and zone required" |
| `zone` | ✅ | string | - | 非空 | "Name and zone required" |
| `type` | ❌ | string | "shelf" | shelf/room/cabinet/refrigerator | - |
| `parentId` | ❌ | string | null | - | - |
| `shelf` | ❌ | string | null | - | - |
| `position` | ❌ | string | null | - | - |
| `capacity` | ❌ | integer | 999999 | ≥0 | - |

**业务流程规则**:
1. `code`自动生成：`LOC-${String(num).padStart(5, '0')}`
2. `status` = 1
3. `used` = 0

#### 11.3.3 DELETE /locations/:id — 删除库位

**业务流程规则**: 逻辑删除；无关联校验（即使有库存关联也可删除）。

**隐含规则**: 删除库位后，inventory表中的`location_id`成为悬空引用。

---

## 十二、FRS-11 采购订单

### 12.1 功能概述

采购订单全生命周期管理：创建→收货→完成。

**可访问角色**: admin/procurement（创建/读）；warehouse_manager（读）

### 12.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/purchase-orders` | 列表（分页+状态/供应商/搜索筛选） |
| GET | `/purchase-orders/:id` | 详情 |
| POST | `/purchase-orders` | 创建采购单 |
| PUT | `/purchase-orders/:id/receive` | 更新收货数量 |
| PUT | `/purchase-orders/:id/cancel` | 取消采购单 |

### 12.3 表单字段

#### 12.3.1 GET /purchase-orders — 采购单列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `status` | ❌ | enum | - | "pending"/"partial"/"completed" |
| `supplierId` | ❌ | string | - | 供应商筛选 |
| `keyword` | ❌ | string | - | 搜索单号/物料名称 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `orderNo` | string | 单号（POyyyymmdd-xxxx） |
| `materialId` | string | 物料id |
| `materialName` | string | 物料名称 |
| `supplierId` | string | 供应商id |
| `orderedQty` | decimal | 采购数量 |
| `receivedQty` | decimal | 已收货数量 |
| `remainingQty` | decimal | 剩余数量 = orderedQty - receivedQty |
| `unit` | string | 单位 |
| `unitPrice` | decimal | 单价 |
| `totalAmount` | decimal | 总金额 = orderedQty × unitPrice |
| `expectedDate` | date | 预期到货日期 |
| `status` | enum | "pending"/"partial"/"completed"/"cancelled" |
| `remark` | string | 备注 |

**隐含规则**: `remainingQty`为计算字段，非数据库存储。

#### 12.3.2 POST /purchase-orders — 创建采购单

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `materialId` | ✅ | string | - | 非空 | "物料和采购数量必填" |
| `orderedQty` | ✅ | decimal | - | >0 | "物料和采购数量必填" |
| `materialName` | ❌ | string | '' | - | - |
| `supplierId` | ❌ | string | null | - | - |
| `unit` | ❌ | string | "个" | - | - |
| `unitPrice` | ❌ | decimal | 0 | ≥0 | - |
| `expectedDate` | ❌ | date | null | - | - |
| `remark` | ❌ | string | '' | - | - |

**业务流程规则**:
1. `orderNo`自动生成：`PO` + yyyymmdd + `-` + 4位序号
2. `receivedQty` = 0
3. `status` = "pending"
4. `totalAmount` = `orderedQty × unitPrice`

**单号生成规则**:

```
prefix = 'PO' + year + month(2位) + day(2位)
seq = COUNT(*) FROM purchase_orders WHERE order_no LIKE prefix + '%' + 1
orderNo = prefix + '-' + String(seq).padStart(4, '0')
```

#### 12.3.3 PUT /purchase-orders/:id/receive — 收货

| 字段 | 必填 | 类型 | 校验规则 | 错误提示 |
|------|------|------|---------|---------|
| `quantity` | ✅ | decimal | >0 | "入库数量必填" |

**业务流程规则**:
1. `newReceived = receivedQty + quantity`
2. `IF newReceived > orderedQty THEN` 400 "入库数量超过订单数量"
3. `IF newReceived >= orderedQty THEN status = 'completed' ELSE status = 'partial'`

**状态流转**:

```
pending → partial → completed
   ↑        ↑         ↓
cancelled ← ───────────
```

#### 12.3.4 PUT /purchase-orders/:id/cancel — 取消

**业务流程规则**:
1. `IF status == 'completed'` → 400 "已完成的订单不能取消"
2. `status = "cancelled"`

**隐含规则**: 取消后不可恢复；取消的订单在列表中仍可见（status=cancelled）。

---

## 十三、FRS-12 BOM管理

### 13.1 功能概述

检测项目的BOM（物料清单）管理，支持版本控制。

**可访问角色**: admin/technician/pathologist（读）；admin（创建/编辑/删除）

### 13.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/boms` | 列表（分页+类型筛选） |
| GET | `/boms/:id` | 详情（含物料明细+成本占比） |
| POST | `/boms` | 创建BOM |
| PUT | `/boms/:id` | 编辑BOM（自动升级版本） |
| DELETE | `/boms/:id` | 删除BOM |

### 13.3 表单字段

#### 13.3.1 GET /boms — BOM列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `type` | ❌ | string | - | 类型筛选（ihc/he/mp/fish/cyto/ss） |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `code` | string | BOM编码 |
| `name` | string | 名称 |
| `version` | string | 版本号（v1.0格式） |
| `type` | string | 检测类型 |
| `serviceId` | string | 服务项目id |
| `materialCount` | integer | 物料数量（固定返回0，需前端统计） |
| `supportableSamples` | integer | 可检测样本数 |
| `unitCost` | decimal | 单位成本 |
| `status` | enum | "active"/"inactive" |

**隐含规则**: `materialCount`固定返回0（后端未实现JOIN统计），前端需自行统计。

#### 13.3.2 GET /boms/:id — BOM详情

**响应扩展字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `materials` | array | 物料明细列表 |
| `versionHistory` | array | 版本历史（仅当前一条） |

**物料明细字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 物料id |
| `name` | string | 物料名称 |
| `spec` | string | 规格 |
| `usagePerSample` | decimal | 每样本用量 |
| `unit` | string | 单位 |
| `price` | decimal | 单价 |
| `stock` | decimal | 当前库存 |
| `costRatio` | decimal | 成本占比 = (price × usagePerSample) / totalCost |

**成本计算规则**:

```
totalCost = Σ(materials.price × materials.usagePerSample)
material.costRatio = (material.price × material.usagePerSample) / totalCost
```

#### 13.3.3 POST /boms — 创建BOM

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `code` | ✅ | string | - | 非空 | "Missing required fields" |
| `name` | ✅ | string | - | 非空 | "Missing required fields" |
| `type` | ✅ | string | - | 非空 | "Missing required fields" |
| `materials` | ✅ | array | - | 非空数组 | "Missing required fields" |
| `serviceId` | ❌ | string | null | - | - |
| `description` | ❌ | string | null | - | - |
| `supportableSamples` | ❌ | integer | null | - | - |

**materials元素字段**:

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `materialId` | ✅ | string | 物料id |
| `usagePerSample` | ✅ | decimal | 每样本用量 |
| `unit` | ✅ | string | 单位 |

**业务流程规则**:
1. `version` = "v1.0"（固定初始版本）
2. `status` = 1
3. 逐条插入bom_items
4. `(code, version)`联合唯一冲突 → 409 "Code version exists"

#### 13.3.4 PUT /boms/:id — 编辑BOM

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ❌ | string | 名称 |
| `description` | ❌ | string | 描述 |
| `supportableSamples` | ❌ | integer | 可检测样本数 |
| `materials` | ❌ | array | 物料列表（传则全量替换） |

**版本升级规则**:

```
version = existing.version  // 如 "v1.0"
parts = version.replace('v', '').split('.').map(Number)
parts[1] += 1
newVersion = 'v' + parts[0] + '.' + parts[1]  // 如 "v1.1"
```

**业务流程规则**:
1. 版本号自动+0.1（次版本）
2. 若传`materials` → 先DELETE所有bom_items再INSERT新列表（全量替换）
3. 未传`materials` → 仅更新基础字段

### 13.4 交互细节

| 场景 | 反馈 |
|------|------|
| 创建BOM | 201，版本固定v1.0 |
| 编辑BOM | 版本自动升级（v1.0→v1.1→v1.2） |
| 物料替换 | 全量替换，非增量更新 |

---

## 十四、FRS-13 项目管理

### 14.1 功能概述

检测项目管理，关联BOM，统计项目成本。

**可访问角色**: admin/technician/pathologist（读+写）；其他角色不可访问

### 14.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/projects` | 列表（分页+类型/状态/搜索筛选） |
| GET | `/projects/:id` | 详情（含成本统计） |
| POST | `/projects` | 创建项目 |
| PUT | `/projects/:id` | 编辑项目 |
| DELETE | `/projects/:id` | 删除项目 |

### 14.3 表单字段

#### 14.3.1 GET /projects — 项目列表

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `type` | ❌ | string | - | 类型筛选 |
| `status` | ❌ | enum | - | "active"/"inactive" |
| `keyword` | ❌ | string | - | 搜索名称/编码 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `code` | string | 项目编码 |
| `name` | string | 项目名称 |
| `type` | string | 类型（ihc/he/mp/fish/cyto/ss） |
| `cycle` | string | 检测周期 |
| `bomId` | string | 关联BOM |
| `supportableSamples` | integer | 可检测样本数 |
| `status` | enum | "active"/"inactive" |
| `manager` | string | 项目负责人 |
| `description` | string | 描述 |
| `createdAt` | datetime | 创建时间 |

#### 14.3.2 GET /projects/:id — 项目详情

**响应扩展字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `costStats` | object | 成本统计 |

**costStats字段**:

| 字段 | 类型 | 计算公式 |
|------|------|---------|
| `totalCost` | decimal | `SUM(outbound_records.total_cost WHERE project_id = ?)` |
| `sampleCount` | integer | `COUNT(DISTINCT outbound_records.id WHERE project_id = ?)` |
| `unitCost` | decimal | `IF sampleCount > 0 THEN totalCost / sampleCount ELSE 0` |

#### 14.3.3 POST /projects — 创建项目

| 字段 | 必填 | 类型 | 默认值 | 校验规则 | 错误提示 |
|------|------|------|--------|---------|---------|
| `code` | ✅ | string | - | 非空，唯一 | "Code, name and type required" / "Code exists" |
| `name` | ✅ | string | - | 非空 | "Code, name and type required" |
| `type` | ✅ | string | - | 非空 | "Code, name and type required" |
| `cycle` | ❌ | string | null | - | - |
| `manager` | ❌ | string | null | - | - |
| `description` | ❌ | string | null | - | - |

**业务流程规则**: `status` = 1（active）

---

## 十五、FRS-14 成本分析

### 15.1 功能概述

多维度成本分析报表：按项目、按物料、按供应商。

**可访问角色**: admin/pathologist/finance（读）

### 15.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/reports/cost-by-project` | 按项目成本 |
| GET | `/reports/cost-by-material` | 按物料成本 |
| GET | `/reports/cost-by-supplier` | 按供应商成本 |

### 15.3 表单字段

#### 15.3.1 GET /reports/cost-by-project — 按项目成本

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `startDate` | ❌ | date | - | 开始日期（>= created_at） |
| `endDate` | ❌ | date | - | 结束日期（<= created_at+23:59:59） |

**响应字段**:

| 字段 | 类型 | 计算公式 |
|------|------|---------|
| `summary.totalCost` | decimal | `SUM(total_cost)` |
| `summary.totalSamples` | integer | `SUM(sample_count)` |
| `projects[].unitCost` | decimal | `total_cost / sample_count`（IF sample_count>0 ELSE 0） |
| `projects[].ratio` | string | `(total_cost / totalCost × 100).toFixed(1)` |
| `projects[].changeRate` | integer | 固定0 |
| `projects[].changeDirection` | string | 固定"down" |

#### 15.3.2 GET /reports/cost-by-material — 按物料成本

| 查询参数 | 必填 | 类型 | 说明 |
|---------|------|------|------|
| `startDate` | ❌ | date | 开始日期 |
| `endDate` | ❌ | date | 结束日期 |
| `categoryId` | ❌ | string | 分类筛选 |

**响应字段**:

| 字段 | 类型 | 计算公式 |
|------|------|---------|
| `materials[].consumption` | decimal | `SUM(quantity)` |
| `materials[].totalCost` | decimal | `SUM(total_cost)` |
| `materials[].ratio` | string | `(total_cost / totalCost × 100).toFixed(1)` |

**数据源**: `outbound_items` JOIN `outbound_records` JOIN `materials`

#### 15.3.3 GET /reports/cost-by-supplier — 按供应商成本

**响应字段**:

| 字段 | 类型 | 计算公式 |
|------|------|---------|
| `suppliers[].amount` | decimal | `SUM(inbound_records.amount)` |
| `suppliers[].orderCount` | integer | `COUNT(inbound_records.id)` |
| `suppliers[].ratio` | string | `(amount / totalAmount × 100).toFixed(1)` |
| `suppliers[].status` | string | 固定"long-term" |

**数据源**: `inbound_records`（非采购订单）

### 15.4 交互细节

| 场景 | 反馈 |
|------|------|
| 无数据 | 返回空数组，ratio=0 |
| 占比显示 | 保留1位小数，如"32.5" |
| 趋势变化 | changeRate固定0，changeDirection固定"down" |

---

## 十六、FRS-15 预警管理

### 16.1 功能概述

库存预警规则配置和预警记录管理，支持低库存和临期两类预警。

**可访问角色**: 全部角色可读；admin可编辑规则

### 16.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/alerts/rules` | 预警规则列表 |
| PUT | `/alerts/rules/:id` | 编辑预警规则 |
| GET | `/alerts` | 预警记录列表（分页+状态/类型筛选） |
| POST | `/alerts/:id/handle` | 处理预警 |
| POST | `/alerts/generate` | 手动生成预警 |

### 16.3 表单字段

#### 16.3.1 GET /alerts/rules — 预警规则

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `type` | string | "low-stock"或"expiry" |
| `name` | string | 规则名称 |
| `threshold` | integer | 阈值（低库存用） |
| `thresholdDays` | integer | 阈值天数（临期用） |
| `enabled` | boolean | 是否启用 |

#### 16.3.2 PUT /alerts/rules/:id — 编辑规则

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `threshold` | ❌ | integer | 阈值 |
| `thresholdDays` | ❌ | integer | 阈值天数 |
| `enabled` | ❌ | boolean | 是否启用 |

#### 16.3.3 GET /alerts — 预警记录

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `status` | ❌ | enum | - | "pending"/"handled"/"ignored" |
| `type` | ❌ | string | - | "low-stock"/"expiry" |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `type` | string | 预警类型 |
| `level` | string | 级别（warning/danger） |
| `materialId` | string | 物料id |
| `materialName` | string | 物料名称 |
| `currentStock` | integer | 当前库存 |
| `threshold` | integer | 阈值 |
| `message` | string | 预警消息 |
| `status` | string | "pending"/"handled"/"ignored" |
| `createdAt` | datetime | 创建时间 |

#### 16.3.4 POST /alerts/:id/handle — 处理预警

| 字段 | 必填 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `action` | ❌ | string | "processed" | 处理动作 |
| `remark` | ❌ | string | '' | 备注 |

**业务流程规则**: UPDATE `status = action`, `remark = remark`, `handled_at = CURRENT_TIMESTAMP`

#### 16.3.5 POST /alerts/generate — 手动生成预警

**业务流程规则**:

| 类型 | 触发条件 | SQL条件 |
|------|---------|---------|
| 低库存 | `stock <= safety_stock` AND `safety_stock > 0` | `JOIN inventory ON materials.id = inventory.material_id` |
| 临期 | `expiry_date <= today + threshold_days` | `JOIN batches ON materials.id = batches.material_id` |

**去重规则**: 同一物料同一类型的pending预警不会重复生成。

```sql
-- 低库存去重
SELECT COUNT(*) FROM alerts WHERE material_id = ? AND type = 'low-stock' AND status = 'pending'
-- 若=0则生成新预警
```

**隐含规则**: 
- 低库存预警消息格式：`"Low stock: current {stock}, safety {safety_stock}"`
- 临期预警消息格式：`"Batch {batch_no} expires at {expiry_date}"`
- 生成预警不会自动通知（无消息推送机制）

---

## 十七、FRS-16 操作日志

### 17.1 功能概述

系统操作日志查询，记录用户操作行为。

**可访问角色**: admin/finance（读）

### 17.2 API列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/logs/operation` | 操作日志列表（分页+日期/用户筛选） |

### 17.3 表单字段

#### 17.3.1 GET /logs/operation — 操作日志

| 查询参数 | 必填 | 类型 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `page` | ❌ | integer | 1 | 页码 |
| `pageSize` | ❌ | integer | 20 | 每页条数 |
| `startDate` | ❌ | date | - | 开始日期 |
| `endDate` | ❌ | date | - | 结束日期 |
| `userId` | ❌ | string | - | 用户id筛选 |

**响应字段**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | UUID |
| `userId` | string | 用户id |
| `username` | string | 用户名 |
| `operation` | string | 操作类型 |
| `description` | string | 操作描述 |
| `ip` | string | IP地址 |
| `userAgent` | string | 浏览器UA |
| `createdAt` | datetime | 操作时间 |

**隐含规则**: 
- 日志由后端路由手动写入（非自动中间件）
- 当前系统仅seed数据中有13条操作日志
- 日志不支持删除/清理

---

## 附录：全局隐含规则汇总

### A.1 金额/数量精度

| 场景 | 精度 | 说明 |
|------|------|------|
| 金额 | DECIMAL(18,4) | 支持4位小数 |
| 数量 | DECIMAL(18,4) | 支持4位小数 |
| 占比 | 1位小数 | `.toFixed(1)` |

### A.2 日期格式

| 场景 | 格式 | 说明 |
|------|------|------|
| 接口传输 | yyyy-mm-dd | 纯日期 |
| 数据库存储 | DATETIME | 含时分秒 |
| 筛选结束日期 | yyyy-mm-ddT23:59:59 | 自动附加 |

### A.3 逻辑删除统一规则

| 表 | 删除方式 | 关联影响 |
|------|---------|---------|
| users | is_deleted=1 | 无级联 |
| roles | is_deleted=1 | 无级联（用户仍可用该role登录） |
| suppliers | is_deleted=1 | materials.supplier_id悬空 |
| materials | is_deleted=1 | 历史inbound/outbound保留 |
| categories | is_deleted=1 | 有子/有物料时禁止删除 |
| locations | is_deleted=1 | inventory.location_id悬空 |
| boms | is_deleted=1 | 无级联 |
| projects | is_deleted=1 | 无级联 |
| inbound_records | is_deleted=1 | 同步扣减库存/批次/PO |

### A.4 响应时间基准

| 操作类型 | 目标响应时间 |
|---------|------------|
| 简单查询 | < 200ms |
| 列表查询（分页） | < 300ms |
| 复杂报表 | < 1s |
| 写操作（含事务） | < 500ms |

### A.5 并发限制

| 限制项 | 说明 |
|--------|------|
| SQLite文件锁 | 同一时间仅允许一个写入事务 |
| JWT Token | 无黑名单，有效期内始终可用 |
| 会话管理 | 无服务端会话，纯Token认证 |

---

*文档版本: v1.0*  
*生成时间: 2026-05-12*  
*数据来源: 后端路由源码逆向分析*
