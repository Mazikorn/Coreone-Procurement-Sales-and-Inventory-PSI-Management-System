import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'

// 数据层说明（React Query 选项 A，2026-06-25 PM 决策）：本项目服务端态采用 usePagination + 自定义页面 hook，
// React Query 从未实际使用（useQuery/useMutation 全仓 0 处）。此前挂载的 QueryClientProvider 为死依赖，已移除，
// 消除"规范要求用 RQ、代码全是手写"的矛盾。如未来前端规模显著扩张再作为主动技术投资专项评估迁移。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
