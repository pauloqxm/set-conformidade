import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { AREAS, canManage, needsAttention, personName, roleLabel, roleOf } from '../lib/domain'
import { AppIcon, CheckMark } from './Brand'

const baseLinks = [
  { to: '/', label: 'Painel', end: true, manage: false },
  { to: '/processos', label: 'Cadastro de processos', end: false, manage: true },
  { to: '/pendencias', label: 'Pendências', end: false, manage: false },
  { to: '/solicitacoes', label: 'Minhas solicitações', end: false, manage: false },
  { to: '/checklists', label: 'Checklists', end: false, manage: true },
  { to: '/analises', label: 'Análises', end: false, manage: false },
  { to: '/manual', label: 'Manual de uso', end: false, manage: false },
]

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'SET'
}

export function Shell() {
  const { session, profile, signOut } = useAuth()
  const location = useLocation()
  const workspace = useWorkspace()
  const pending = (workspace.data?.items ?? []).filter((item) => needsAttention(item.status, item.validated)).length
  const mine = (workspace.data?.assignments ?? []).filter(
    (row) => row.assigned_to === session?.user.id && row.status !== 'Concluída' && row.status !== 'Cancelada',
  ).length
  const name = personName(profile?.full_name, session?.user.email)
  const role = roleOf(profile)
  const manage = canManage(profile)
  const links = baseLinks.filter((link) => manage || !link.manage)
  const areas = role === 'admin' ? AREAS : role === 'manager' ? AREAS.filter((area) => area.id === profile?.area) : []

  if (!profile?.active) {
    return (
      <main className="loginScene">
        <section className="loginBrandPanel">
          <div className="loginLogoWrap">
            <img src="/set.png" alt="Secretaria do Trabalho" />
          </div>
          <div className="loginBrandCopy">
            <span className="loginKicker">Secretaria do Trabalho</span>
            <h1>Aguardando aprovação</h1>
          </div>
        </section>
        <section className="loginCard">
          <p>
            A conta {session?.user.email} está cadastrada
            {profile?.area ? ` na coordenação ${profile.area}` : ''}, mas ainda não foi liberada por um administrador.
          </p>
          <button className="button" type="button" onClick={() => void signOut()}>
            Sair
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="sideBrandSimple">
          <CheckMark />
          <div>
            <strong>Controle</strong>
            <small>de Conformidade</small>
          </div>
        </div>
        <nav className="mainNav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              <span>{link.label}</span>
              {link.to === '/pendencias' && pending > 0 ? <b>{pending}</b> : null}
              {link.to === '/solicitacoes' && mine > 0 ? <b>{mine}</b> : null}
            </NavLink>
          ))}
          {profile.is_admin ? <NavLink to="/acessos">Acessos</NavLink> : null}
        </nav>
        {areas.length > 0 ? <div className="navSep" /> : null}
        {areas.length > 0 ? <div className="sideLabel">Coordenações</div> : null}
        <nav className="areaList">
          {areas.map((area) => (
            <NavLink
              key={area.id}
              to={`/pendencias?area=${area.id}`}
              className={location.search.includes(`area=${area.id}`) ? 'active' : ''}
            >
              <i style={{ background: area.color }} />
              <span>{area.id}</span>
            </NavLink>
          ))}
        </nav>
        <div className="statusStack">
          <div className="dbStatus online">
            <span className="dbDot" />
            <div>
              <span>Ambiente ativo</span>
              <small>Supabase conectado</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="content">
        <header>
          <div className="headerIdentity">
            <div className="headerGov">
              <img src="/set.png" alt="Governo do Estado do Ceará" />
              <div className="headerGovText">
                <span>Governo do Estado do Ceará</span>
                <strong>Secretaria do Trabalho • {profile.area}</strong>
              </div>
            </div>
            <div className="headerApp">
              <AppIcon />
              <div className="headerAppText">
                <span>Controle de</span>
                <strong>Conformidade</strong>
              </div>
            </div>
          </div>
          <div className="userBox">
            <div className="avatar">{initials(name)}</div>
            <div className="userMeta">
              <b>{name}</b>
              <span>
                {profile.area} · {roleLabel(role)}
              </span>
            </div>
            <button className="logout" type="button" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        </header>
        <div className="brandStripe">
          <i />
          <i />
          <i />
          <i />
        </div>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
