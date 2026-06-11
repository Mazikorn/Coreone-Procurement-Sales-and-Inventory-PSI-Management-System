/**
 * 测试辅助工具
 * 提供HTTP请求工具和认证辅助
 */

export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001/api/v1'

export async function getJSON(path: string, token?: string): Promise<any> {
  const headers: any = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, { headers })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`HTTP ${res.status}: ${data.error?.message || 'Unknown error'}`)
  }
  return res.json()
}

export async function postJSON(path: string, body: any, token?: string): Promise<any> {
  const headers: any = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && !data.success) throw new Error(`HTTP ${res.status}: ${data.error?.message || 'Unknown error'}`)
  return data
}

export async function putJSON(path: string, body: any, token?: string): Promise<any> {
  const headers: any = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, { method: 'PUT', headers, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && !data.success) throw new Error(`HTTP ${res.status}: ${data.error?.message || 'Unknown error'}`)
  return data
}

export async function delJSON(path: string, token?: string): Promise<any> {
  const headers: any = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE', headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && !data.success) throw new Error(`HTTP ${res.status}: ${data.error?.message || 'Unknown error'}`)
  return data
}

export async function login(username: string, password: string): Promise<string> {
  const res = await postJSON('/auth/login', { username, password })
  if (!res.success || !res.data?.token) throw new Error('Login failed')
  return res.data.token
}

export function generateUnique(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
