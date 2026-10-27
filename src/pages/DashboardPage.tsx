import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { loadProfiles } from '../lib/api'
import { isClosed, needsAttention, personName, projectName } from '../lib/domain'
import type { ChecklistItem, ProcessRow } from '../lib/types'

const PANEL_AREAS = ['COEMP', 'COESA', 'COTRA', 'COAFI', 'ASCOI', 'CODIP', 'GABINETE']
const AREA_COLORS = ['#087d50', '#45b6ef', '#ff6e22', '#f5ba2c', '#3da4e8', '#5bc1b3', '#91c64d']

function itemsOf(items: ChecklistItem[], processId: string) {
  return items.filter((item) => item.process_id === processId)
}

function processOf(processes: ProcessRow[], id: string) {
  return processes.find((process) => process.id === id)
}

function complianceOf(items: ChecklistItem[]) {
  const conforme = items.filter((item) => item.status === 'Conforme' && item.validated).length
  const validacao = items.filter((item) => (item.status === 'Conforme' || item.status === 'Não se aplica') && !item.validated).length
  const naoConforme = items.filter((item) => item.status === 'Não conforme' || item.status === 'Pendente documental' || item.status === 'Em resolução').length
  const revisao = items.filter((item) => item.status === 'Revisão técnica necessária').length
  const total = conforme + validacao + naoConforme + revisao
  if (!total) return { total, parts: [0, 0, 0, 0] }
  const first = Math.round((conforme / total) * 100)
  const second = Math.round((validacao / total) * 100)
  const third = Math.round((naoConforme / total) * 100)
  return { total, parts: [first, second, third, Math.max(0, 100 - first - second - third)] }
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data, isLoading, error } = useWorkspace()
  const people = useQuery({
    queryKey: ['profiles'],
    queryFn: loadProfiles,
    enabled: !!profile?.is_admin,
  })
  if (isLoading) return <p className="muted">Carregando o painel...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  const admin = !!profile?.is_admin
  const areas = admin ? PANEL_AREAS : [profile?.area].filter((area): area is string => !!area)
  const pending = data.items.filter((item) => needsAttention(item.status, item.validated))
  const stats = {
    processos: data.processes.length,
    pendencias: pending.length,
    andamento: data.processes.filter((process) => process.status !== 'Em resolução' && process.status !== 'Concluído').length,
    resolucao: data.items.filter((item) => item.status === 'Em resolução').length,
    resolvidas: data.items.filter((item) => isClosed(item.status, item.validated)).length,
  }
  const compliance = complianceOf(data.items)
  const legend = [
    { label: 'Conforme', pct: compliance.parts[0], color: '#0d9a61', tone: 'green' },
    { label: 'Aguardando validação', pct: compliance.parts[1], color: '#58bdf0', tone: 'blue' },
    { label: 'Não conforme', pct: compliance.parts[2], color: '#ff6e22', tone: 'orange' },
    { label: 'Revisão técnica', pct: compliance.parts[3], color: '#f5bd2f', tone: 'yellow' },
  ]
  const areaRows = areas.map((code, index) => ({
    code,
    value: data.processes.filter((process) => process.area === code).length,
    color: AREA_COLORS[index % AREA_COLORS.length],
  }))
  const areaTotal = areaRows.reduce((sum, row) => sum + row.value, 0)
  let cursor = 0
  const stops: string[] = []
  for (const row of areaRows) {
    const slice = areaTotal ? (row.value / areaTotal) * 100 : 0
    if (slice) stops.push(`${row.color} ${cursor.toFixed(2)}% ${(cursor + slice).toFixed(2)}%`)
    cursor += slice
  }
  const pendingByArea = areas
    .map((code) => ({
      code,
      value: pending.filter((item) => processOf(data.processes, item.process_id)?.area === code).length,
    }))
    .sort((a, b) => b.value - a.value || a.code.localeCompare(b.code, 'pt-BR'))
  const pendingMax = Math.max(1, ...pendingByArea.map((row) => row.value))
  const projects = [...data.processes.reduce((map, process) => {
    const label = projectName(process.project_name)
    map.set(label, (map.get(label) ?? 0) + 1)
    return map
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  const names = new Map((people.data ?? []).map((row) => [row.user_id, personName(row.full_name, row.email)]))
  const activeAssignments = data.assignments.filter((row) => row.status !== 'Concluída' && row.status !== 'Cancelada')
  const assignedIds = new Set(data.assignments.filter((row) => row.status !== 'Cancelada').map((row) => row.checklist_item_id))
  const responsible = new Map<string, number>()
  for (const row of activeAssignments) {
    const label = names.get(row.assigned_to) || 'Responsável não identificado'
    responsible.set(label, (responsible.get(label) ?? 0) + 1)
  }
  const unassigned = pending.filter((item) => !assignedIds.has(item.id)).length
  if (unassigned) responsible.set('Sem responsável', (responsible.get('Sem responsável') ?? 0) + unassigned)
  const responsibleRows = [...responsible.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 7)
  const scope = admin ? 'Visão geral administrativa' : profile?.is_manager ? `Coordenação ${profile.area}` : 'Somente atribuições a mim'

  return (
    <div className="painel">
      <div className="heading">
        <div>
          <p className="eyebrow">Painel</p>
          <h1>{admin ? 'Visão geral dos processos' : profile?.is_manager ? `Visão da ${profile.area}` : 'Meus processos e pendências'}</h1>
        </div>
        <span className={`scopeChip${admin ? ' admin' : ''}`}>{scope}</span>
      </div>
      <section className="dashMetrics">
        <Metric tone="green" icon="doc" label="Processos" value={stats.processos} hint="Processos cadastrados" />
        <Metric tone="orange" icon="alert" label="Pendências" value={stats.pendencias} hint="Itens que exigem providência" />
        <Metric tone="blue" icon="gear" label="Em andamento" value={stats.andamento} hint="Processos ativos" />
        <Metric tone="gold" icon="clock" label="Em resolução" value={stats.resolucao} hint="Pendências em resolução" />
        <Metric tone="emerald" icon="check" label="Resolvidas" value={stats.resolvidas} hint="Pendências solucionadas" />
      </section>
      <section className="dashCharts">
        <article className="dashCard">
          <header>
            <h2>Situação geral da conformidade</h2>
            <button type="button" onClick={() => navigate('/analises')}>Ver análise completa →</button>
          </header>
          {compliance.total ? (
            <>
              <div className="stackBar">
                {legend.map((part) => part.pct ? <i key={part.label} className={part.tone} style={{ width: `${part.pct}%` }}>{part.pct >= 8 ? `${part.pct}%` : ''}</i> : null)}
              </div>
              <div className="stackLegend">
                {legend.map((part) => (
                  <span key={part.label}><i style={{ background: part.color }} />{part.label}</span>
                ))}
              </div>
            </>
          ) : <p className="muted">Ainda não há itens analisados.</p>}
        </article>
        {admin ? (
          <article className="dashCard">
            <header>
              <h2>Processos por área</h2>
              <span>Áreas</span>
            </header>
            <div className="donutWrap">
              <div className="donut" style={{ background: stops.length ? `conic-gradient(${stops.join(',')})` : '#eef3ef' }}>
                <div><strong>{areaTotal}</strong><small>processos</small></div>
              </div>
              <div className="areaLegend">
                {areaRows.map((row) => (
                  <button key={row.code} type="button" onClick={() => navigate(`/pendencias?area=${row.code}`)}>
                    <i style={{ background: row.color }} />
                    <span>{row.code}</span>
                    <b>{areaTotal ? Math.round((row.value / areaTotal) * 100) : 0}%</b>
                    <em>{row.value}</em>
                  </button>
                ))}
              </div>
            </div>
          </article>
        ) : (
          <article className="dashCard">
            <header>
              <h2>Processos por projeto/contrato</h2>
              <span>{profile?.area || 'Área'}</span>
            </header>
            <Rank rows={projects} mode="green" />
          </article>
        )}
        {admin ? (
          <article className="dashCard">
            <header>
              <h2>Pendências por coordenação</h2>
              <button type="button" onClick={() => navigate('/pendencias')}>Ver todas →</button>
            </header>
            <div className="hbar">
              {pendingByArea.map((row, index) => (
                <button key={row.code} type="button" onClick={() => navigate(`/pendencias?area=${row.code}`)}>
                  <span>{row.code}</span>
                  <i><b className={index < 2 && row.value ? 'orange' : 'blue'} style={{ width: `${Math.round((row.value / pendingMax) * 100)}%` }} /></i>
                  <strong>{row.value}</strong>
                </button>
              ))}
            </div>
          </article>
        ) : (
          <article className="dashCard">
            <header>
              <h2>Pendências por responsável</h2>
              <button type="button" onClick={() => navigate('/pendencias')}>Ver todas →</button>
            </header>
            <Rank rows={responsibleRows} mode="mixed" />
          </article>
        )}
      </section>
      {admin ? (
        <section className="dashExtra">
          <article className="dashCard">
            <header>
              <div>
                <h2>Processos por projeto/contrato</h2>
                <p>Distribuição global dos instrumentos cadastrados</p>
              </div>
              <span className="scopeChip admin">Admin</span>
            </header>
            <Rank rows={projects} mode="green" />
          </article>
          <article className="dashCard">
            <header>
              <div>
                <h2>Pendências por responsável</h2>
                <p>Distribuição global das atribuições em aberto</p>
              </div>
              <button type="button" onClick={() => navigate('/pendencias')}>Ver pendências →</button>
            </header>
            <Rank rows={responsibleRows} mode="mixed" />
          </article>
        </section>
      ) : null}
    </div>
  )
}

function Metric({ tone, icon, label, value, hint }: { tone: string; icon: string; label: string; value: number; hint: string }) {
  return (
    <article className={`dashMetric ${tone}`}>
      <span aria-hidden="true">{icon === 'doc' ? '▤' : icon === 'alert' ? '!' : icon === 'gear' ? '⚙' : icon === 'clock' ? '◷' : '✓'}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{hint}</em>
      </div>
    </article>
  )
}

function Rank({ rows, mode }: { rows: Array<[string, number]>; mode: 'green' | 'mixed' }) {
  const max = Math.max(1, ...rows.map((row) => row[1]))
  if (!rows.length) return <p className="muted">Ainda não há dados suficientes.</p>
  return (
    <div className="rank">
      {rows.map(([label, value], index) => (
        <div key={label}>
          <span>{label}</span>
          <i><b className={mode === 'mixed' && index < 2 ? 'orange' : mode === 'mixed' ? 'blue' : 'green'} style={{ width: `${Math.round((value / max) * 100)}%` }} /></i>
          <strong>{value}</strong>
        </div>
      ))}
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
