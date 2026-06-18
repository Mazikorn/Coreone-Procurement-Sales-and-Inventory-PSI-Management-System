import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')

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
})
