---
name: frontend-dev
description: COREONE 前端开发技能。React + TypeScript + Tailwind + React Query + Zod。
---

# 前端开发技能

## 何时使用

开发或修改 COREONE 前端代码时激活。

## 技术栈

- React 18.3 (函数组件)
- TypeScript 5.8 (严格模式)
- Vite 5.4 (SWC)
- Tailwind CSS 3.4
- React Router DOM 6.30
- TanStack Query 5.83
- React Hook Form 7.61 + Zod 3.25
- Radix UI Primitives
- Axios 1.16

## 页面开发模式

```tsx
// 典型页面结构
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { api } from '@/api/inventory'

const schema = z.object({
  name: z.string().min(1, '名称不能为空'),
  quantity: z.number().min(0, '数量不能为负'),
})

type FormData = z.infer<typeof schema>

export default function InventoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: api.getInventory,
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      await api.createItem(data)
      toast.success('创建成功')
    } catch (error) {
      toast.error(error.message || '创建失败')
    }
  }

  if (isLoading) return <div>加载中...</div>

  return (
    <div className="p-4">
      {/* 页面内容 */}
    </div>
  )
}
```

## API 调用模式

```typescript
// api/inventory.ts
import axios from 'axios'

const client = axios.create({
  baseURL: 'http://localhost:3001/api/v1',
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const api = {
  getInventory: () => client.get('/inventory').then(r => r.data.data),
  createItem: (data: any) => client.post('/inventory', data).then(r => r.data),
}
```

## 表单验证模式

```typescript
import { z } from 'zod'

const inventorySchema = z.object({
  materialId: z.string().uuid('请选择物料'),
  quantity: z.number().positive('数量必须大于0'),
  locationId: z.string().optional(),
})

type InventoryFormData = z.infer<typeof inventorySchema>
```

## 注意事项
- 使用 React Query 的 `queryKey` 保持一致性
- 错误用 `sonner` toast 显示
- 加载状态必须处理
- 表单提交按钮加 `disabled={form.formState.isSubmitting}`
