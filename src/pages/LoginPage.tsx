import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthProvider'
import { AREAS } from '../lib/domain'
import { supabase } from '../lib/supabase'

const loginSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe a senha.'),
})

const requestSchema = z
  .object({
    full_name: z.string().trim().min(5, 'Informe o nome completo.'),
    email: z
      .string()
      .trim()
      .email('Informe um e-mail válido.')
      .refine((value) => value.toLowerCase().endsWith('@trabalho.ce.gov.br'), 'Use o e-mail @trabalho.ce.gov.br.'),
    area: z.string().min(2, 'Escolha a coordenação.'),
    password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: 'As senhas não conferem.', path: ['confirm'] })

export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<'entrar' | 'solicitar'>('entrar')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session) return <Navigate to="/" replace />

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsed = loginSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
      return
    }
    setBusy(true)
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data)
    setBusy(false)
    if (authError) setError('E-mail ou senha incorretos.')
  }

  async function onRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setInfo('')
    const parsed = requestSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
      return
    }
    setBusy(true)
    const { data, error: authError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: { full_name: parsed.data.full_name, area: parsed.data.area } },
    })
    setBusy(false)
    if (authError) {
      setError(authError.message)
      return
    }
    if (!data.session) {
      setInfo('Solicitação registrada. Confirme o e-mail, se o sistema pedir, e aguarde a aprovação do administrador.')
      return
    }
    setInfo('Solicitação registrada. Um administrador precisa aprovar o acesso antes da entrada.')
  }

  return (
    <main className="loginScene">
      <section className="loginBrandPanel">
        <div className="brandShapes brandShapesOne" />
        <div className="brandShapes brandShapesTwo" />
        <div className="loginLogoWrap">
          <img src="/set.png" alt="Secretaria do Trabalho" />
        </div>
        <div className="loginBrandCopy">
          <span className="loginKicker">Secretaria do Trabalho</span>
          <h1>
            Controle de
            <br />
            Conformidade
          </h1>
          <p>Gestão, rastreabilidade e acompanhamento dos processos da SET.</p>
        </div>
      </section>
      <section className="loginCard">
        <div className="loginAppIcon">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <rect x="3" y="3" width="42" height="42" rx="12" fill="#0f7545" />
            <path d="M16 13h14l6 6v16H16z" fill="none" stroke="white" strokeWidth="3" />
            <path d="m19 27 4 4 9-10" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="loginTitle">
          <span>Acesso ao sistema</span>
          <h2>Controle de Conformidade</h2>
          <p>Entre com seu usuário institucional ou solicite acesso.</p>
        </div>
        <div className="switch">
          <button type="button" className={mode === 'entrar' ? 'on' : ''} onClick={() => setMode('entrar')}>
            Entrar
          </button>
          <button type="button" className={mode === 'solicitar' ? 'on' : ''} onClick={() => setMode('solicitar')}>
            Solicitar acesso
          </button>
        </div>
        {mode === 'entrar' ? (
          <form onSubmit={(event) => void onLogin(event)}>
            <label>
              E-mail institucional
              <input name="email" type="email" autoComplete="username" required placeholder="nome@trabalho.ce.gov.br" />
            </label>
            <label>
              Senha
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="button" disabled={busy}>
              {busy ? 'Entrando...' : 'Entrar no sistema'}
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void onRequest(event)}>
            <label>
              Nome completo
              <input name="full_name" required />
            </label>
            <label>
              E-mail institucional
              <input name="email" type="email" required placeholder="nome@trabalho.ce.gov.br" />
            </label>
            <label>
              Coordenação
              <select name="area" required defaultValue="COEMP">
                {AREAS.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.id} · {area.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Senha
              <input name="password" type="password" minLength={8} required />
            </label>
            <label>
              Confirmar senha
              <input name="confirm" type="password" minLength={8} required />
            </label>
            <button className="button" disabled={busy}>
              {busy ? 'Enviando...' : 'Enviar solicitação'}
            </button>
          </form>
        )}
        {error ? <p className="alert">{error}</p> : null}
        {info ? <p className="oknote">{info}</p> : null}
        <div className="loginStatus">
          <span className="dbDot" /> Ambiente institucional SET · Ceará
        </div>
      </section>
    </main>
  )
}
