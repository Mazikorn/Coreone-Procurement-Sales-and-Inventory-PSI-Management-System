import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
const topBarSource = readFileSync(resolve(process.cwd(), 'src/components/layout/TopBar.tsx'), 'utf8')

describe('App routes', () => {
  it('keeps the exposed material category entry routable', () => {
    expect(appSource).toContain("import Categories from '@/pages/master/Categories'")
    expect(appSource).toContain('<Route path="/categories" element={<Categories />} />')
  })

  it('protects admin-only system routes from direct URL entry', () => {
    expect(appSource).toContain("import { getAllowedPaths, getUserRole } from '@/lib/permissions'")
    expect(appSource).toContain('function RoleRoute')
    expect(appSource).toContain('<Route path="/users" element={<RoleRoute><Users /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/roles" element={<RoleRoute><Roles /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/logs" element={<RoleRoute><Logs /></RoleRoute>} />')
  })

  it('keeps logs behind the shared role menu map guard', () => {
    expect(appSource).toContain('getAllowedPaths(role)')
    expect(appSource).toContain('<Route path="/logs" element={<RoleRoute><Logs /></RoleRoute>} />')
  })

  it('guards inbound from direct URL entry so procurement cannot bypass purchase handoff', () => {
    expect(appSource).toContain('<Route path="/inbound" element={<RoleRoute><Inbound /></RoleRoute>} />')
  })

  it('guards outbound and reverse warehouse routes from direct URL entry', () => {
    expect(appSource).toContain('<Route path="/outbound" element={<RoleRoute><Outbound /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/returns" element={<RoleRoute><Returns /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/supplier-returns" element={<RoleRoute><SupplierReturns /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/stocktaking" element={<RoleRoute><Stocktaking /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/scraps" element={<RoleRoute><Scraps /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/transfers" element={<RoleRoute><Transfers /></RoleRoute>} />')
  })

  it('guards technical modeling routes from direct URL entry', () => {
    expect(appSource).toContain('<Route path="/projects" element={<RoleRoute><Projects /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/bom" element={<RoleRoute><BOMList /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/equipment" element={<RoleRoute><EquipmentList /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/labor-times" element={<RoleRoute><LaborTimeList /></RoleRoute>} />')
  })

  it('guards reconciliation and ABC cost routes from direct URL entry', () => {
    expect(appSource).toContain('<Route path="/reconciliation" element={<RoleRoute><Reconciliation /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/abc/slide-cost" element={<RoleRoute><SlideCostAnalysis /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/abc/fee-mappings" element={<RoleRoute><FeeMappingConfig /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/abc/cost-pools" element={<RoleRoute><CostPoolList /></RoleRoute>} />')
    expect(appSource).toContain('<Route path="/indirect-costs" element={<RoleRoute><IndirectCostCenterList /></RoleRoute>} />')
  })

  it('does not advertise retired cost placeholder routes as routable pages', () => {
    for (const path of ['/abc/forecast', '/abc/supplier-cost', '/abc/equipment-efficiency']) {
      expect(appSource).not.toContain(`path="${path}"`)
      expect(topBarSource).not.toContain(path)
    }
  })
})
