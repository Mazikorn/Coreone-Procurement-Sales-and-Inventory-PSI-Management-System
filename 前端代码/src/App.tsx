import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import AppSidebar from '@/components/layout/AppSidebar'
import TopBar from '@/components/layout/TopBar'
import { getAllowedPaths, getUserRole } from '@/lib/permissions'
import Dashboard from '@/pages/Dashboard'
import NotFound from '@/pages/NotFound'
import Login from '@/pages/auth/Login'
import Alerts from '@/pages/alerts/Alerts'
import Inbound from '@/pages/inbound/Inbound'
import InventoryList from '@/pages/inventory/InventoryList'
import Stocktaking from '@/pages/inventory/Stocktaking'
import Outbound from '@/pages/outbound/Outbound'
import PurchaseOrders from '@/pages/purchase/PurchaseOrders'
import Returns from '@/pages/returns/Returns'
import Suppliers from '@/pages/master/Suppliers'
import Materials from '@/pages/master/Materials'
import Categories from '@/pages/master/Categories'
import Locations from '@/pages/master/Locations'
import Projects from '@/pages/master/Projects'
import BOMList from '@/pages/bom/BOMList'
import Users from '@/pages/system/Users'
import Roles from '@/pages/system/Roles'
import Logs from '@/pages/system/Logs'
import Scraps from '@/pages/scraps/Scraps'
import SupplierReturns from '@/pages/supplier-returns/SupplierReturns'
import Transfers from '@/pages/transfers/Transfers'
import Reconciliation from '@/pages/reconciliation/Reconciliation'
import EquipmentList from '@/pages/equipment/EquipmentList'
import EquipmentTypeList from '@/pages/equipment/EquipmentTypeList'
import EquipmentDepreciationStats from '@/pages/equipment/EquipmentDepreciationStats'
import LaborTimeList from '@/pages/labor/LaborTimeList'
import CostDashboard from '@/pages/cost/CostDashboard'
import SlideCostAnalysis from '@/pages/cost/SlideCostAnalysis'
import { ProfitabilityAnalysis } from '@/pages/cost/ProfitabilityAnalysis'
import FeeComparison from '@/pages/cost/FeeComparison'
import FeeMappingConfig from '@/pages/cost/FeeMappingConfig'
import CostTrend from '@/pages/cost/CostTrend'
import { ActivityCenterList } from '@/pages/cost/ActivityCenterList'
import { CostDriverList } from '@/pages/cost/CostDriverList'
import CostPoolList from '@/pages/cost/CostPoolList'
import BudgetManagement from '@/pages/cost/BudgetManagement'
import QualityCostAnalysis from '@/pages/cost/QualityCostAnalysis'
import CostVarianceAnalysis from '@/pages/cost/CostVarianceAnalysis'
import CostAlerts from '@/pages/cost/CostAlerts'
import AuditTrail from '@/pages/cost/AuditTrail'
import QuarterlyAdjustment from '@/pages/cost/QuarterlyAdjustment'
import PersonnelEfficiency from '@/pages/cost/PersonnelEfficiency'
import CostModelValidation from '@/pages/cost/CostModelValidation'
import IndirectCostCenterList from '@/pages/cost-center/IndirectCostCenterList'

function RoleRoute({ children }: { children: ReactElement }) {
  const location = useLocation()
  const role = getUserRole()
  const allowedPaths = getAllowedPaths(role)
  const canAccess = allowedPaths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))

  return canAccess ? children : <Navigate to="/" replace />
}

function ProtectedLayout() {
  const token = localStorage.getItem('token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f9fafb]">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/inbound" element={<RoleRoute><Inbound /></RoleRoute>} />
            <Route path="/inventory" element={<InventoryList />} />
            <Route path="/outbound" element={<RoleRoute><Outbound /></RoleRoute>} />
            <Route path="/stocktaking" element={<RoleRoute><Stocktaking /></RoleRoute>} />
            <Route path="/purchase-orders" element={<PurchaseOrders />} />
            <Route path="/returns" element={<RoleRoute><Returns /></RoleRoute>} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/materials" element={<Materials />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/locations" element={<Locations />} />
            <Route path="/projects" element={<RoleRoute><Projects /></RoleRoute>} />
            <Route path="/bom" element={<RoleRoute><BOMList /></RoleRoute>} />
            <Route path="/users" element={<RoleRoute><Users /></RoleRoute>} />
            <Route path="/roles" element={<RoleRoute><Roles /></RoleRoute>} />
            <Route path="/logs" element={<RoleRoute><Logs /></RoleRoute>} />
            <Route path="/scraps" element={<RoleRoute><Scraps /></RoleRoute>} />
            <Route path="/supplier-returns" element={<RoleRoute><SupplierReturns /></RoleRoute>} />
            <Route path="/transfers" element={<RoleRoute><Transfers /></RoleRoute>} />
            <Route path="/reconciliation" element={<RoleRoute><Reconciliation /></RoleRoute>} />
            <Route path="/equipment" element={<RoleRoute><EquipmentList /></RoleRoute>} />
            <Route path="/equipment/types" element={<RoleRoute><EquipmentTypeList /></RoleRoute>} />
            <Route path="/equipment/depreciation" element={<RoleRoute><EquipmentDepreciationStats /></RoleRoute>} />
            <Route path="/labor-times" element={<RoleRoute><LaborTimeList /></RoleRoute>} />
            <Route path="/abc/dashboard" element={<RoleRoute><CostDashboard /></RoleRoute>} />
            <Route path="/abc/slide-cost" element={<RoleRoute><SlideCostAnalysis /></RoleRoute>} />
            <Route path="/abc/profitability" element={<RoleRoute><ProfitabilityAnalysis /></RoleRoute>} />
            <Route path="/abc/fee-comparison" element={<RoleRoute><FeeComparison /></RoleRoute>} />
            <Route path="/abc/fee-mappings" element={<RoleRoute><FeeMappingConfig /></RoleRoute>} />
            <Route path="/abc/trend" element={<RoleRoute><CostTrend /></RoleRoute>} />
            <Route path="/abc/activity-centers" element={<RoleRoute><ActivityCenterList /></RoleRoute>} />
            <Route path="/abc/cost-drivers" element={<RoleRoute><CostDriverList /></RoleRoute>} />
            <Route path="/abc/cost-pools" element={<RoleRoute><CostPoolList /></RoleRoute>} />
            <Route path="/abc/budgets" element={<RoleRoute><BudgetManagement /></RoleRoute>} />
            <Route path="/abc/quality-costs" element={<RoleRoute><QualityCostAnalysis /></RoleRoute>} />
            <Route path="/abc/variance" element={<RoleRoute><CostVarianceAnalysis /></RoleRoute>} />
            <Route path="/abc/alerts" element={<RoleRoute><CostAlerts /></RoleRoute>} />
            <Route path="/abc/audit" element={<RoleRoute><AuditTrail /></RoleRoute>} />
            <Route path="/abc/quarterly-adjustment" element={<RoleRoute><QuarterlyAdjustment /></RoleRoute>} />
            <Route path="/abc/personnel-efficiency" element={<RoleRoute><PersonnelEfficiency /></RoleRoute>} />
            <Route path="/abc/model-validation" element={<RoleRoute><CostModelValidation /></RoleRoute>} />
            <Route path="/indirect-costs" element={<RoleRoute><IndirectCostCenterList /></RoleRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </>
  )
}
