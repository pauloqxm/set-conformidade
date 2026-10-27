import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { Shell } from './components/Shell'
import { AccessPage } from './pages/AccessPage'
import { AreaPage } from './pages/AreaPage'
import { AnalysisPage } from './pages/AnalysisPage'
import { ChecklistsPage } from './pages/ChecklistsPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { ManualPage } from './pages/ManualPage'
import { PendingPage } from './pages/PendingPage'
import { ProcessesPage } from './pages/ProcessesPage'
import { RequestsPage } from './pages/RequestsPage'

function Guard() {
  const { loading, session } = useAuth()
  if (loading) return <main className="gate"><p>Abrindo o sistema...</p></main>
  if (!session) return <Navigate to="/entrar" replace />
  return <Shell />
}

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route element={<Guard />}>
        <Route index element={<DashboardPage />} />
        <Route path="processos" element={<ProcessesPage />} />
        <Route path="pendencias" element={<PendingPage />} />
        <Route path="analises" element={<AnalysisPage />} />
        <Route path="checklists" element={<ChecklistsPage />} />
        <Route path="solicitacoes" element={<RequestsPage />} />
        <Route path="manual" element={<ManualPage />} />
        <Route path="acessos" element={<AccessPage />} />
        <Route path="coordenacoes/:area" element={<AreaPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
