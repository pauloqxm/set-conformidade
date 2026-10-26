import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { projectLogo } from '../components/Brand'
import { areaLabel, isClosed, needsAttention, projectName, roleLabel, roleOf } from '../lib/domain'
import type { ChecklistItem, ProcessRow } from '../lib/types'

function itemsOf(items: ChecklistItem[], processId: string) {
  return items.filter((item) => item.process_id === processId)
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const role = roleOf(profile)
  const { data, isLoading, error } = useWorkspace()
  if (isLoading) return <p className="muted">Carregando o painel...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  const open = data.items.filter((item) => needsAttention(item.status, item.validated))
  const resolving = open.filter((item) => item.status === 'Em resolução')
  const closed = data.items.filter((item) => isClosed(item.status, item.validated))
  const byProject = new Map<string, { processes: number; open: number; closed: number }>()
  for (const process of data.processes) {
    const name = projectName(process.project_name)
    const row = byProject.get(name) ?? { processes: 0, open: 0, closed: 0 }
    row.processes += 1
    byProject.set(name, row)
  }
  for (const item of data.items) {
    const process = data.processes.find((row) => row.id === item.process_id)
    const name = projectName(process?.project_name)
    const row = byProject.get(name) ?? { processes: 0, open: 0, closed: 0 }
    if (needsAttention(item.status, item.validated)) row.open += 1
    if (isClosed(item.status, item.validated)) row.closed += 1
    byProject.set(name, row)
  }
  const projects = [...byProject.entries()].sort((a, b) => b[1].open - a[1].open || b[1].processes - a[1].processes)
  const byArea = new Map<string, number>()
  for (const process of data.processes) byArea.set(process.area, (byArea.get(process.area) ?? 0) + 1)

  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">Painel</p>
          <h1>
            {role === 'admin' ? 'Visão geral dos processos' : role === 'manager' ? `Visão da ${profile?.area || 'coordenação'}` : 'Meus processos e pendências'}
          </h1>
          <p className="muted">{role === 'user' ? 'Você visualiza somente os processos e as pendências atribuídos diretamente a você.' : roleLabel(role)}</p>
        </div>
      </div>
      <section className="metrics">
        <article><span>Processos</span><strong>{data.processes.length}</strong></article>
        <article><span>Pendências</span><strong>{open.length}</strong></article>
        <article><span>Em resolução</span><strong>{resolving.length}</strong></article>
        <article><span>Validados</span><strong>{closed.length}</strong></article>
      </section>
      <h2>Projetos</h2>
      <section className="cards">
        {projects.length === 0 ? <p className="muted">Nenhum processo visível para a sua coordenação.</p> : null}
        {projects.map(([name, row]) => {
          const total = row.open + row.closed
          const rate = total ? Math.round((row.closed / total) * 100) : 0
          const logo = projectLogo(name)
          return (
            <button key={name} className="project" type="button" onClick={() => navigate(`/pendencias?projeto=${encodeURIComponent(name)}`)}>
              <div className="projectHead">
                {logo ? (
                  <span className={`projectIcon${logo.src.includes('sebrae') ? ' wide' : ''}`}>
                    <img src={logo.src} alt={logo.alt} />
                  </span>
                ) : (
                  <span className="projectIcon">{name.trim().charAt(0).toUpperCase()}</span>
                )}
                <div>
                  <b>{name}</b>
                  <span>{row.processes} processo(s)</span>
                </div>
              </div>
              <div className="statline"><span>Pendências</span><strong>{row.open}</strong></div>
              <div className="statline"><span>Validados</span><strong>{row.closed}</strong></div>
              <div className="track"><i style={{ width: `${rate}%` }} /></div>
              <small>{rate}% resolvido</small>
            </button>
          )
        })}
      </section>
      <h2>Processos por coordenação</h2>
      <section className="panel">
        {[...byArea.entries()].map(([area, count]) => (
          <div className="statline" key={area}>
            <span>{areaLabel(area)}</span>
            <strong>{count}</strong>
          </div>
        ))}
        {byArea.size === 0 ? <p className="muted">Sem processos.</p> : null}
      </section>
      <h2>Últimos processos</h2>
      <ProcessTable processes={data.processes.slice(0, 8)} items={data.items} />
      <p className="note">
        A leitura automática das pastas do Drive e a análise dos PDFs passam a rodar no servidor. Esta versão já mostra e atualiza os resultados gravados.
        <Link to="/analises"> Abrir análises</Link>
      </p>
    </div>
  )
}

export function ProcessTable({ processes, items }: { processes: ProcessRow[]; items: ChecklistItem[] }) {
  if (!processes.length) return <p className="muted">Nenhum processo cadastrado.</p>
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Processo</th>
            <th>Projeto</th>
            <th>Coordenação</th>
            <th>Situação</th>
            <th>Pendências</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => {
            const count = itemsOf(items, process.id).filter((item) => needsAttention(item.status, item.validated)).length
            return (
              <tr key={process.id}>
                <td>
                  <b>{process.nup || process.instrument_title || 'Processo'}</b>
                  <small>{process.instrument_title}</small>
                </td>
                <td>{projectName(process.project_name)}</td>
                <td>{process.area}</td>
                <td>{process.status || '—'}</td>
                <td>{count}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
