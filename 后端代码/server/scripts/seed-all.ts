/**
 * 统一种子数据运行器
 * 按依赖顺序执行所有种子脚本，确保数据完整性
 *
 * 用法: npx tsx scripts/seed-all.ts
 */

import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface SeedStep {
  name: string
  file: string
  description: string
}

const SEED_STEPS: SeedStep[] = [
  {
    name: '病理基础数据',
    file: 'seed-pathology-data.ts',
    description: '角色、用户、供应商、库位、分类(3级)、150+物料、项目、BOM'
  },
  {
    name: 'ABC 活动中心与成本动因',
    file: 'seed-abc-data.ts',
    description: '8个作业中心、7个成本动因'
  },
  {
    name: '收费标准',
    file: 'seed-fee-standards.ts',
    description: '72条收费标准（基于上海病理定价）'
  },
  {
    name: '业务交易数据',
    file: 'seed-test-transactions.ts',
    description: '20个采购单、33条入库、16条出库、盘点、退库、报废、供应商退货'
  },
  {
    name: '扩展业务数据',
    file: 'seed-comprehensive-data.ts',
    description: '12台设备、间接成本、ABC明细、预算、质量成本、预警、LIS案例'
  },
  {
    name: '流程测试补充数据',
    file: 'seed-flow-test-data.ts',
    description: '补充库存、调拨、退库、报废、成本预警规则、季度调整'
  },
  {
    name: 'BOM 收费映射',
    file: 'seed-bom-fee-mapping.ts',
    description: 'BOM 与收费标准的映射关系'
  }
]

function runSeed(step: SeedStep): void {
  const scriptPath = path.join(__dirname, step.file)
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📦 [${step.name}] ${step.description}`)
  console.log(`   文件: ${step.file}`)
  console.log(`${'='.repeat(60)}`)

  try {
    execSync(`npx tsx "${scriptPath}"`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      timeout: 120_000 // 2 分钟超时
    })
    console.log(`✅ [${step.name}] 完成`)
  } catch (error) {
    console.error(`❌ [${step.name}] 失败:`, (error as Error).message)
    // 继续执行其他种子脚本，不中断
  }
}

function main(): void {
  console.log('🚀 COREONE 统一种子数据初始化')
  console.log(`   共 ${SEED_STEPS.length} 个步骤`)
  console.log(`   开始时间: ${new Date().toLocaleString('zh-CN')}`)

  const startTime = Date.now()

  for (const step of SEED_STEPS) {
    runSeed(step)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🎉 种子数据初始化完成！`)
  console.log(`   耗时: ${elapsed}s`)
  console.log(`   结束时间: ${new Date().toLocaleString('zh-CN')}`)
  console.log(`${'='.repeat(60)}`)
}

main()
