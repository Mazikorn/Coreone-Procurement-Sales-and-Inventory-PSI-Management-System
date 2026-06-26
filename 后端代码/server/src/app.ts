import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { getDatabase, initializeDatabase } from './database/DatabaseManager.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authenticateToken, requireCostWorkbenchAccess, requireRole, requireStrictRole } from './middleware/auth.js'
import { logOperation } from './utils/operation-logger.js'

// 路由导入
import authRoutes from './routes/auth.js'
import categoryRoutes from './routes/categories-v1.1.js'
import materialRoutes from './routes/materials.js'
import supplierRoutes from './routes/suppliers-v1.1.js'
import locationRoutes from './routes/locations-v1.1.js'
import inventoryRoutes from './routes/inventory-v1.1.js'
import inboundRoutes from './routes/inbound-v1.1.js'
import outboundRoutes from './routes/outbound-v1.1.js'
import projectRoutes from './routes/projects-v1.1.js'
import bomRoutes from './routes/bom-v1.1.js'
import reportRoutes from './routes/reports-v1.1.js'
import alertRoutes from './routes/alerts-v1.1.js'
import userRoutes from './routes/users-v1.1.js'
import roleRoutes from './routes/roles-v1.1.js'
import logRoutes from './routes/logs-v1.1.js'
import stocktakingRoutes from './routes/stocktaking-v1.1.js'
import returnRoutes from './routes/returns-v1.1.js'
import scrapRoutes from './routes/scraps-v1.1.js'
import depletionRoutes from './routes/depletion-v1.1.js'
import purchaseOrderRoutes from './routes/purchase-orders-v1.1.js'
import transferRoutes from './routes/transfers-v1.1.js'
import supplierReturnRoutes from './routes/supplier-returns-v1.1.js'
import reconciliationRoutes from './routes/reconciliation-v1.1.js'
import equipmentRoutes from './routes/equipment-v1.1.js'
import equipmentTypeRoutes from './routes/equipment-types-v1.1.js'
import laborTimeRoutes from './routes/labor-time-v1.1.js'
import indirectCostRoutes from './routes/indirect-cost-v1.1.js'
import abcRoutes from './routes/abc-v1.1.js'
import costAdjustmentRoutes from './routes/cost-adjustment-v1.1.js'

const app = express()
const PORT = process.env.PORT || 3001
const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080,http://127.0.0.1:8080')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)
const allowedOrigins = Array.from(new Set([
  ...configuredOrigins,
  ...configuredOrigins.map(origin => origin.replace('://localhost:', '://127.0.0.1:')),
  ...configuredOrigins.map(origin => origin.replace('://127.0.0.1:', '://localhost:')),
]))

// 中间件
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// 初始化数据库
initializeDatabase()

const masterDataAuditModules: Record<string, { module: string; label: string }> = {
  '/api/v1/categories': { module: 'categories', label: '物料分类' },
  '/api/v1/materials': { module: 'materials', label: '物料' },
  '/api/v1/locations': { module: 'locations', label: '库位' },
  '/api/v1/projects': { module: 'projects', label: '检测服务' },
  '/api/v1/boms': { module: 'bom', label: 'BOM' },
  '/api/v1/equipment': { module: 'equipment', label: '设备' },
  '/api/v1/equipment-types': { module: 'equipment_types', label: '设备类型' },
}

function normalizeAuditPath(path: string, modulePrefix: string) {
  const [withoutQuery] = path.split('?')
  if (withoutQuery === modulePrefix) return modulePrefix.replace('/api/v1', '')
  const suffix = withoutQuery.slice(modulePrefix.length)
  return `${modulePrefix.replace('/api/v1', '')}${suffix
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{8,}(?=\/|$)/g, '/:id')}`
}

function auditAction(method: string) {
  if (method === 'POST') return '创建'
  if (method === 'PUT') return '更新'
  if (method === 'PATCH') return '变更'
  if (method === 'DELETE') return '删除'
  return '维护'
}

app.use((req, res, next) => {
  const method = req.method.toUpperCase()
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    next()
    return
  }

  const path = req.path
  const entry = Object.entries(masterDataAuditModules)
    .find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  if (!entry) {
    next()
    return
  }

  const [modulePrefix, auditModule] = entry
  res.on('finish', () => {
    if (res.statusCode >= 400) return
    logOperation(getDatabase(), req as any, {
      operation: `${method} ${normalizeAuditPath(path, modulePrefix)}`,
      description: `${auditAction(method)}${auditModule.label}主数据`,
      requestData: {
        module: auditModule.module,
        path,
        method,
        body: req.body || null,
        params: req.params || null,
      },
      responseData: { statusCode: res.statusCode },
    })
  })
  next()
})

// 路由注册 - 公开路由
app.use('/api/v1/auth', authRoutes)

// 路由注册 - admin专属
app.use('/api/v1/users', authenticateToken, requireStrictRole('admin'), userRoutes)
app.use('/api/v1/roles', authenticateToken, requireStrictRole('admin'), roleRoutes)

// 路由注册 - finance可访问
app.use('/api/v1/logs', authenticateToken, requireRole('admin', 'finance'), logRoutes)
app.use('/api/v1/reports', authenticateToken, requireRole('admin', 'pathologist', 'finance'), reportRoutes)
app.use('/api/v1/depletion', authenticateToken, requireStrictRole('admin', 'warehouse_manager', 'pathologist', 'finance'), depletionRoutes)

// 路由注册 - warehouse/technician/pathologist/procurement/manager共享 (库存/预警)
app.use('/api/v1/inventory', authenticateToken, requireRole('admin', 'warehouse_manager', 'technician', 'pathologist', 'procurement', 'manager'), inventoryRoutes)
app.use('/api/v1/alerts', authenticateToken, requireRole('admin', 'warehouse_manager', 'technician', 'pathologist', 'procurement', 'finance', 'manager'), alertRoutes)

// 路由注册 - warehouse/procurement共享 (入库相关)
app.use('/api/v1/inbound', authenticateToken, requireRole('admin', 'warehouse_manager', 'procurement'), inboundRoutes)
app.use('/api/v1/purchase-orders', authenticateToken, requireRole('admin', 'warehouse_manager', 'procurement'), purchaseOrderRoutes)
app.use('/api/v1/suppliers', authenticateToken, requireRole('admin', 'warehouse_manager', 'procurement'), supplierRoutes)

// 路由注册 - warehouse专属 (库存操作)
app.use('/api/v1/outbound', authenticateToken, requireStrictRole('admin', 'warehouse_manager'), outboundRoutes)
app.use('/api/v1/stocktaking', authenticateToken, requireRole('admin', 'warehouse_manager'), stocktakingRoutes)
app.use('/api/v1/locations', authenticateToken, requireRole('admin', 'warehouse_manager'), locationRoutes)
app.use('/api/v1/returns', authenticateToken, requireRole('admin', 'warehouse_manager'), returnRoutes)
app.use('/api/v1/scraps', authenticateToken, requireRole('admin', 'warehouse_manager'), scrapRoutes)
app.use('/api/v1/transfers', authenticateToken, requireRole('admin', 'warehouse_manager'), transferRoutes)
app.use('/api/v1/supplier-returns', authenticateToken, requireRole('admin', 'warehouse_manager', 'procurement', 'finance'), supplierReturnRoutes)

// 路由注册 - 检测项目/BOM 主数据；仓管出库需要只读选择，写入由模块权限守卫。
app.use('/api/v1/projects', authenticateToken, requireRole('admin', 'warehouse_manager', 'technician', 'pathologist'), projectRoutes)
app.use('/api/v1/boms', authenticateToken, requireRole('admin', 'warehouse_manager', 'technician', 'pathologist'), bomRoutes)

// 路由注册 - 成本对账：财务负责对账，技术员处理BOM异常；医生仅查看成本结果。
app.use('/api/v1/reconciliation', authenticateToken, requireStrictRole('admin', 'finance', 'technician'), reconciliationRoutes)

// 路由注册 - 设备管理 (admin/technician/pathologist可访问)
app.use('/api/v1/equipment', authenticateToken, requireRole('admin', 'technician', 'pathologist'), equipmentRoutes)
app.use('/api/v1/equipment-types', authenticateToken, requireRole('admin', 'technician', 'pathologist'), equipmentTypeRoutes)

// 路由注册 - 标准工时 (finance可维护；technician/pathologist按权限只读)
app.use('/api/v1/labor-times', authenticateToken, requireRole('admin', 'finance', 'technician', 'pathologist'), laborTimeRoutes)

// 路由注册 - 间接成本中心 (admin/finance可访问)
app.use('/api/v1/indirect-costs', authenticateToken, requireCostWorkbenchAccess, indirectCostRoutes)

// 路由注册 - ABC作业成本法：财务可管理，技术/医生/管理者可只读查看可信成本结果
app.use('/api/v1/abc', authenticateToken, requireRole('admin', 'finance', 'pathologist', 'technician', 'manager'), abcRoutes)

// 路由注册 - 季度成本调整 (admin/finance可访问)
app.use('/api/v1/cost-adjustments', authenticateToken, requireCostWorkbenchAccess, costAdjustmentRoutes)

// 路由注册 - 通用主数据 (所有已认证角色可查看)
app.use('/api/v1/categories', authenticateToken, categoryRoutes)
app.use('/api/v1/materials', authenticateToken, requireRole('admin', 'warehouse_manager', 'technician', 'procurement'), materialRoutes)

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

// 错误处理
app.use(errorHandler)

// 404处理
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } })
})

// 在测试环境下不自动启动服务器（由测试 globalSetup 控制）
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`COREONE Backend Server running on port ${PORT}`)
    console.log(`API Base URL: http://localhost:${PORT}/api/v1`)
  })
}

export default app
