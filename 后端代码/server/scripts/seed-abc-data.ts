/**
 * ABC 作业成本法种子数据
 * 初始化作业中心、成本动因等基础数据
 */

import { getDatabase } from '../src/database/DatabaseManager.js'
import { v4 as uuidv4 } from 'uuid'

export function seedAbcData(): void {
  const db = getDatabase()

  // 检查是否已有数据
  const count = db.prepare('SELECT COUNT(*) as count FROM abc_activity_centers').get() as any
  if (count && count.count > 0) {
    console.log('ABC数据已存在，跳过初始化')
    return
  }

  console.log('正在初始化ABC作业中心和成本动因...')

  // 1. 作业中心定义
  const activityCenters = [
    { id: uuidv4(), code: 'SPECIMEN', name: '标本处理中心', description: '标本接收、登记、取材、包埋', cost_driver_type: 'block_count', sort_order: 1 },
    { id: uuidv4(), code: 'SECTION', name: '切片制作中心', description: '切片、摊片、烤片', cost_driver_type: 'slide_count', sort_order: 2 },
    { id: uuidv4(), code: 'HE_STAIN', name: '常规染色中心', description: 'HE 染色', cost_driver_type: 'stain_count', sort_order: 3 },
    { id: uuidv4(), code: 'IHC', name: '免疫组化中心', description: 'IHC 染色（普通+靶向）', cost_driver_type: 'test_count', sort_order: 4 },
    { id: uuidv4(), code: 'SS', name: '特染中心', description: '抗酸、PAS、GMS、网状纤维、弹力纤维', cost_driver_type: 'slide_count', sort_order: 5 },
    { id: uuidv4(), code: 'MP', name: '分子病理中心', description: 'FISH、PCR（普通+荧光）、NGS', cost_driver_type: 'probe_locus_panel', sort_order: 6 },
    { id: uuidv4(), code: 'DIAGNOSIS', name: '诊断中心', description: '阅片、报告', cost_driver_type: 'report_count', sort_order: 7 },
    { id: uuidv4(), code: 'CYTOLOGY', name: '细胞病理中心', description: '细胞学处理、制片、染色', cost_driver_type: 'slide_block_count', sort_order: 8 },
  ]

  const insertCenter = db.prepare(`
    INSERT INTO abc_activity_centers (id, code, name, description, cost_driver_type, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  for (const ac of activityCenters) {
    insertCenter.run(ac.id, ac.code, ac.name, ac.description, ac.cost_driver_type, ac.sort_order)
  }

  // 2. 成本动因定义
  const costDrivers = [
    { id: uuidv4(), code: 'block_count', name: '蜡块数', unit: '个', calculation_method: 'tiered', description: '标本处理成本动因，支持阶梯定价' },
    { id: uuidv4(), code: 'slide_count', name: '切片数', unit: '张', calculation_method: 'linear', description: '切片/特染成本动因' },
    { id: uuidv4(), code: 'stain_count', name: '染色次数', unit: '次', calculation_method: 'fixed', description: 'HE染色成本动因，固定收费' },
    { id: uuidv4(), code: 'test_count', name: '检测项数', unit: '项', calculation_method: 'tiered', description: '免疫组化成本动因，支持阶梯定价' },
    { id: uuidv4(), code: 'probe_locus_panel', name: '探针/位点/面板', unit: '个', calculation_method: 'tiered', description: '分子病理成本动因' },
    { id: uuidv4(), code: 'report_count', name: '报告数', unit: '份', calculation_method: 'tiered', description: '诊断成本动因' },
    { id: uuidv4(), code: 'slide_block_count', name: '玻片数+蜡块数', unit: '个', calculation_method: 'linear', description: '细胞病理成本动因' },
  ]

  const insertDriver = db.prepare(`
    INSERT INTO abc_cost_drivers (id, code, name, unit, calculation_method, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  for (const cd of costDrivers) {
    insertDriver.run(cd.id, cd.code, cd.name, cd.unit, cd.calculation_method, cd.description)
  }

  // 3. 为 standard_labor_times 中的工序创建作业关联
  // 将现有的 step_code 映射到作业中心
  const stepToActivityMap: Record<string, string> = {
    'RECEIVE': 'SPECIMEN',
    'SECTION': 'SECTION',
    'AR': 'IHC',
    'IHC_STAIN': 'IHC',
    'SS_STAIN': 'SS',
    'MOUNT': 'SECTION',
    'REVIEW': 'DIAGNOSIS',
    'HE_STAIN': 'HE_STAIN',
    'PCR_RUN': 'MP',
  }

  console.log('ABC数据初始化完成')
}

// 直接运行
seedAbcData()
