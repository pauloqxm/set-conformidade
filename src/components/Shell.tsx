import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../data/useWorkspace'
import { COORDINATIONS, canManage, needsAttention, personName, roleLabel, roleOf } from '../lib/domain'
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

function AreaMark({ id }: { id: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {id === 'COEMP' ? (
        <>
          <rect x="4" y="8" width="16" height="11" rx="2" {...common} />
          <path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M4 12h16" {...common} />
        </>
      ) : null}
      {id === 'COESA' ? (
        <>
          <circle cx="9" cy="9" r="2.2" {...common} />
          <circle cx="15.5" cy="9.5" r="1.8" {...common} />
          <path d="M4.5 18c.6-2.4 2.2-3.6 4.5-3.6s3.8 1.2 4.4 3.6M13 18c.4-1.7 1.5-2.8 3.2-2.8 1.4 0 2.5.7 3.1 2" {...common} />
        </>
      ) : null}
      {id === 'COTRA' ? <path d="M5 12h14M14 7l5 5-5 5M10 7 5 12l5 5" {...common} /> : null}
      {id === 'COAFI' ? (
        <>
          <rect x="6" y="4" width="12" height="16" rx="2" {...common} />
          <path d="M9 8h6M9 12h6M9 16h3" {...common} />
        </>
      ) : null}
      {id === 'ASCOI' ? (
        <>
          <path d="M12 3.5 19 6v6.2c0 3.4-2.4 5.4-7 6.8-4.6-1.4-7-3.4-7-6.8V6L12 3.5Z" {...common} />
          <path d="m8.8 12 2 2 3.6-4" {...common} />
        </>
      ) : null}
      {id === 'CODIP' ? (
        <>
          <path d="M6 17V9M12 17V6M18 17v-5" {...common} />
          <circle cx="6" cy="7.5" r="1.3" fill="currentColor" />
          <circle cx="12" cy="4.8" r="1.3" fill="currentColor" />
          <circle cx="18" cy="10.2" r="1.3" fill="currentColor" />
        </>
      ) : null}
      {id === 'GABINETE' ? (
        <>
          <path d="M4 20h16M6 20V10h12v10M9 10V7h6v3" {...common} />
          <path d="M9 13h1.5M13.5 13H15M9 16.5h1.5M13.5 16.5H15" {...common} />
        </>
      ) : null}
    </svg>
  )
}

function initials(name: string) {
  const parts = name.split(' ').filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'SET'
}

export function Shell() {
  const { session, profile, signOut } = useAuth()
  const workspace = useWorkspace()
  const pending = (workspace.data?.items ?? []).filter((item) => needsAttention(item.status, item.validated)).length
  const mine = (workspace.data?.assignments ?? []).filter(
    (row) => row.assigned_to === session?.user.id && row.status !== 'Concluída' && row.status !== 'Cancelada',
  ).length
  const name = personName(profile?.full_name, session?.user.email)
  const role = roleOf(profile)
  const manage = canManage(profile)
  const links = baseLinks.filter((link) => manage || !link.manage)
  const areas = role === 'admin' ? COORDINATIONS : role === 'manager' ? COORDINATIONS.filter((area) => area.id === profile?.area) : []

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
            <NavLink key={area.id} to={`/coordenacoes/${area.id}`}>
              <AreaMark id={area.id} />
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
