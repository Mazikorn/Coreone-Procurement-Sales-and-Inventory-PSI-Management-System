import axios from 'axios'
import { toast } from 'sonner'

const request = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// P1-11：统一清除所有认证态（登出 / 401-refresh 失败处共用），避免只清 token 残留 user/refreshToken
// 造成共用终端身份残留、前端按陈旧角色渲染。rememberUsername 仅记住用户名、不含敏感信息，故保留。
export function clearAuth() {
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
}

// P1-10：access token 过期(401)时用 refreshToken 自动续期并重放原请求（AC-01-002 操作无中断）。
// 单飞锁 + 等待队列避免并发 401 同时刷新；刷新用裸 axios 避免拦截器递归。
let isRefreshing = false
let refreshWaiters: Array<(token: string | null) => void> = []

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null
  try {
    const resp = await axios.post('/api/v1/auth/refresh', { refreshToken })
    const newToken = resp.data?.data?.token
    if (!newToken) return null
    localStorage.setItem('token', newToken)
    if (resp.data?.data?.refreshToken) localStorage.setItem('refreshToken', resp.data.data.refreshToken)
    return newToken
  } catch {
    return null
  }
}

request.interceptors.response.use(
  (response) => {
    if (response.config?.responseType === 'blob') {
      return response.data
    }
    const { data } = response
    if (!data.success) {
      toast.error(data.error?.message || '操作失败')
      return Promise.reject(data.error)
    }
    return data.data
  },
  (error) => {
    const original: any = error.config || {}
    const isAuthEndpoint = typeof original.url === 'string' && original.url.includes('/auth/')
    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshWaiters.push((token) => {
            if (token) {
              original.headers = original.headers || {}
              original.headers.Authorization = `Bearer ${token}`
              resolve(request(original))
            } else {
              reject(error)
            }
          })
        })
      }
      isRefreshing = true
      return refreshAccessToken().then((newToken) => {
        isRefreshing = false
        refreshWaiters.forEach((w) => w(newToken))
        refreshWaiters = []
        if (newToken) {
          original.headers = original.headers || {}
          original.headers.Authorization = `Bearer ${newToken}`
          return request(original)
        }
        // 续期失败（refreshToken 过期 / 账号停用降权）→ 清空认证态并跳登录
        clearAuth()
        toast.error('登录已过期，请重新登录')
        window.location.href = '/login'
        return Promise.reject(error)
      })
    }
    const msg = error.response?.data?.error?.message || error.message || '网络错误'
    toast.error(msg)
    return Promise.reject(error)
  }
)

export default request
