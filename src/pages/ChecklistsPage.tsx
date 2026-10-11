import { useWorkspace } from '../data/useWorkspace'

export function ChecklistsPage() {
  const { data, isLoading, error } = useWorkspace()
  if (isLoading) return <p className="muted">Carregando checklists...</p>
  if (error || !data) return <p className="alert">{error instanceof Error ? error.message : 'Não foi possível carregar.'}</p>

  return (
    <div>
      <div className="heading">
        <div>
          <p className="eyebrow">Biblioteca</p>
          <h1>Checklists</h1>
        </div>
      </div>
      <p className="note">A importação de novos arquivos Word fica restrita ao administrador, pela função já existente no banco. Aqui a biblioteca pode ser consultada.</p>
      <section className="stack">
        {data.templates.length === 0 ? <p className="muted">Nenhum checklist cadastrado.</p> : null}
        {data.templates.map((template) => {
          const modules = data.modules.filter((module) => module.template_id === template.id)
          return (
            <article className="panel" key={template.id}>
              <h2>{template.name || 'Checklist'}</h2>
              <p className="muted">
                {template.instrument_type || 'Instrumento não informado'} · {template.source_file_name || 'sem arquivo'}
              </p>
              <ul>
                {modules.map((module) => (
                  <li key={module.id}>
                    {module.code ? `${module.code} · ` : ''}
                    {module.title || 'Módulo'}
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </section>
    </div>
  )
}
