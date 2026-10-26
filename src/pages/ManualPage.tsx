import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { canManage, roleLabel, roleOf } from '../lib/domain'

type Step = { title: string; text: string }
type Section = {
  id: string
  number: string
  title: string
  description: string
  scope: string
  audience: 'all' | 'manage' | 'admin'
  steps: Step[]
  image?: { src: string; alt: string }
  note?: string
}

const SECTIONS: Section[] = [
  {
    id: 'acesso',
    number: '01',
    title: 'Acesso ao sistema e perfis',
    description: 'Entenda o que cada nível de acesso pode visualizar e executar.',
    scope: 'Todos os perfis',
    audience: 'all',
    steps: [
      { title: 'Administrador', text: 'Vê todas as coordenações, aprova usuários e define quem é gestor ou usuário da área.' },
      { title: 'Gestor da área', text: 'Vê os processos e as pendências da própria coordenação e pode atribuir demandas.' },
      { title: 'Usuário da área', text: 'Vê somente os processos e as pendências atribuídos diretamente a ele.' },
    ],
  },
  {
    id: 'cadastro',
    number: '02',
    title: 'Cadastrar um processo',
    description: 'Cadastro inicial e vínculo da pasta principal do processo.',
    scope: 'Administrador e gestor',
    audience: 'manage',
    image: { src: '/manual/02-processos-area.png', alt: 'Painel de processos da coordenação' },
    note: 'Mantenha os documentos do processo na pasta vinculada. Se entrar um documento novo depois da análise, use Ler Drive e reanalisar.',
    steps: [
      { title: 'Abra Cadastro de Processos', text: 'Use esta opção para registrar um processo novo dentro da sua área de gestão.' },
      { title: 'Informe a pasta principal do Drive', text: 'Cole o link da pasta do processo. O sistema identifica a estrutura disponível.' },
      { title: 'Confira as informações identificadas', text: 'Valide NUP, projeto, tipo de instrumento, etapa, objeto e responsável pelo upload.' },
      { title: 'Salve o processo', text: 'O processo passa a aparecer no painel e poderá receber o checklist compatível.' },
    ],
  },
  {
    id: 'checklists',
    number: '03',
    title: 'Checklists oficiais no Google Drive',
    description: 'Como o administrador mantém a fonte oficial dos checklists.',
    scope: 'Somente administrador',
    audience: 'admin',
    image: { src: '/manual/01-checklists-drive.png', alt: 'Tela de vínculo da pasta oficial de checklists' },
    note: 'Quando o Word mudar, sincronize novamente. A versão fica marcada para nova leitura e validação.',
    steps: [
      { title: 'Abra Checklists', text: 'A área de checklists oficiais é a fonte normativa utilizada pelo sistema.' },
      { title: 'Conecte a pasta oficial', text: 'Cole o link da pasta onde ficam os arquivos Word oficiais e sincronize a pasta.' },
      { title: 'Leia e interprete o arquivo', text: 'Para arquivos novos ou alterados, use Ler e interpretar.' },
      { title: 'Confira a interpretação', text: 'Revise módulos, etapas vinculadas, evidências esperadas e critérios de conforme e não conforme.' },
      { title: 'Aprove e salve', text: 'Somente depois da aprovação o checklist fica disponível para vinculação aos processos.' },
    ],
  },
  {
    id: 'drive',
    number: '04',
    title: 'Como o Drive participa da análise',
    description: 'O sistema trabalha com o conteúdo atual da pasta vinculada ao processo.',
    scope: 'Todos os perfis',
    audience: 'all',
    steps: [
      { title: 'Pasta principal', text: 'O processo deve ter uma pasta principal do Google Drive vinculada.' },
      { title: 'Subpastas por etapa', text: 'Use nomes coerentes com as etapas, como Celebração, Termo Aditivo, Execução, Fiscalização ou Prestação de Contas.' },
      { title: 'Documentos em PDF', text: 'O sistema lê o texto dos PDFs e registra as páginas pesquisáveis para localizar evidências.' },
      { title: 'Documento novo', text: 'Depois de incluir ou alterar um documento no Drive, use Ler Drive e reanalisar para atualizar a base de leitura.' },
      { title: 'Documento removido', text: 'Na nova sincronização, arquivos que não existem mais no Drive deixam de participar da próxima análise.' },
    ],
  },
  {
    id: 'analise',
    number: '05',
    title: 'Executar e revisar a análise',
    description: 'Leitura dos PDFs, confronto com o checklist e revisão do resultado.',
    scope: 'Administrador e gestor',
    audience: 'manage',
    image: { src: '/manual/03-analise.png', alt: 'Tela de revisão da análise do checklist' },
    steps: [
      { title: 'Inicie a análise', text: 'No processo, use a leitura e a análise disponíveis nas ações.' },
      { title: 'Aguarde a leitura', text: 'O sistema lê as páginas pesquisáveis e aproveita o que já foi lido quando os documentos não mudaram.' },
      { title: 'Confira a classificação', text: 'Cada item fica como Conforme, Não conforme, Não se aplica ou Revisão técnica necessária.' },
      { title: 'Abra os itens', text: 'Confira ocorrência, páginas localizadas, análise e recomendação antes de salvar a revisão.' },
      { title: 'Salve a revisão', text: 'A revisão salva alimenta as pendências do processo. Os resultados já gravados aparecem em Análises.' },
    ],
  },
  {
    id: 'pendencias',
    number: '06',
    title: 'Pendências e atribuições',
    description: 'Quem visualiza cada pendência e como o tratamento acontece.',
    scope: 'Todos os perfis',
    audience: 'all',
    image: { src: '/manual/04-pendencias.png', alt: 'Painel de pendências e filtros' },
    note: 'O usuário comum não recebe a lista completa da coordenação. Ele recebe somente as ocorrências que o gestor atribuiu a ele.',
    steps: [],
  },
  {
    id: 'reanalisar',
    number: '07',
    title: 'Documento novo: reler o Drive e reanalisar',
    description: 'Use este fluxo sempre que a pasta do processo for atualizada.',
    scope: 'Administrador e gestor',
    audience: 'manage',
    steps: [
      { title: 'Atualize a pasta no Google Drive', text: 'Inclua, substitua ou remova os documentos necessários.' },
      { title: 'Clique em Ler Drive e reanalisar', text: 'O sistema consulta novamente a estrutura real da pasta.' },
      { title: 'Atualização da leitura', text: 'Arquivos novos entram, alterados são relidos e removidos deixam de ser considerados.' },
      { title: 'Nova análise', text: 'O checklist é confrontado novamente com o conjunto documental atualizado.' },
    ],
  },
  {
    id: 'usuarios',
    number: '08',
    title: 'Administrar usuários e permissões',
    description: 'Defina quem é administrador, gestor ou usuário da área.',
    scope: 'Somente administrador',
    audience: 'admin',
    steps: [
      { title: 'Abra Acessos', text: 'Veja solicitações pendentes e usuários aprovados.' },
      { title: 'Escolha a coordenação', text: 'Confirme a área correta antes de liberar o acesso.' },
      { title: 'Defina o perfil', text: 'Administrador tem acesso global. Gestor tem acesso integral à própria área. Usuário vê somente atribuições diretas.' },
      { title: 'Edite quando necessário', text: 'Um usuário pode ser promovido a gestor ou voltar a usuário da área sem recriar a conta.' },
    ],
  },
  {
    id: 'mobile',
    number: '09',
    title: 'Uso no celular, iPad, tablet e notebook',
    description: 'A interface se adapta ao tamanho da tela sem mudar a lógica do sistema.',
    scope: 'Todos os perfis',
    audience: 'all',
    steps: [
      { title: 'Celular', text: 'Os menus e cartões se reorganizam para toque e tela estreita.' },
      { title: 'iPad e tablet', text: 'A navegação fica compacta e os conteúdos usam a largura disponível.' },
      { title: 'Notebook menor', text: 'Espaçamentos e cartões são reduzidos sem alterar o funcionamento do desktop.' },
      { title: 'Mesma conta', text: 'As permissões são as mesmas em qualquer dispositivo.' },
    ],
  },
  {
    id: 'problemas',
    number: '10',
    title: 'Problemas frequentes',
    description: 'Verificações rápidas antes de abrir um chamado.',
    scope: 'Todos os perfis',
    audience: 'all',
    steps: [
      { title: 'Processo não aparece', text: 'Confirme se ele foi atribuído a você. Gestores devem confirmar se o processo pertence à sua área.' },
      { title: 'Documento novo não entrou', text: 'Sincronize a pasta e use Ler Drive e reanalisar.' },
      { title: 'Checklist não aparece no processo', text: 'Confirme tipo de instrumento, etapa e se o checklist oficial está aprovado.' },
      { title: 'Drive desconectado', text: 'Use Reconectar e autentique novamente a conta Google autorizada.' },
      { title: 'Análise demorando', text: 'Processos grandes podem levar mais tempo. Evite fechar a tela durante o confronto dos requisitos.' },
    ],
  },
]

const USER_PENDING: Step[] = [
  { title: 'Abra Pendências ou Minhas Solicitações', text: 'Você verá apenas as ocorrências atribuídas diretamente a você.' },
  { title: 'Inicie a solicitação', text: 'Marque a demanda como em andamento quando começar o tratamento.' },
  { title: 'Registre o procedimento adotado', text: 'Informe objetivamente o que foi feito para resolver a ocorrência.' },
  { title: 'Envie para conferência', text: 'Depois do registro, a pendência volta ao gestor para validação.' },
]

const MANAGER_PENDING: Step[] = [
  { title: 'Abra Pendências', text: 'O administrador vê todas as áreas. O gestor vê somente a própria coordenação.' },
  { title: 'Abra a ocorrência', text: 'Confira o achado, as páginas e a providência necessária.' },
  { title: 'Atribua o responsável', text: 'Escolha um usuário da área e informe o prazo quando necessário.' },
  { title: 'Acompanhe a resolução', text: 'O responsável trata a demanda em Minhas Solicitações.' },
  { title: 'Valide o retorno', text: 'Confira o procedimento adotado antes de considerar a pendência resolvida.' },
]

export function ManualPage() {
  const { profile } = useAuth()
  const role = roleOf(profile)
  const manage = canManage(profile)
  const [query, setQuery] = useState('')
  const sections = useMemo(() => {
    return SECTIONS.filter((section) => {
      if (section.audience === 'admin') return role === 'admin'
      if (section.audience === 'manage') return manage
      return true
    }).map((section) => (section.id === 'pendencias' ? { ...section, steps: role === 'user' ? USER_PENDING : MANAGER_PENDING } : section))
  }, [manage, role])
  const visible = sections.filter((section) => {
    const blob = `${section.title} ${section.description} ${section.steps.map((step) => `${step.title} ${step.text}`).join(' ')}`.toLowerCase()
    return !query || blob.includes(query.toLowerCase().trim())
  })

  return (
    <div className="manual">
      <div className="heading">
        <div>
          <p className="eyebrow">Manual de uso</p>
          <h1>Como utilizar o Controle de Conformidade</h1>
          <p>Procedimentos do sistema, do Google Drive à análise e ao tratamento das pendências. O conteúdo abaixo segue o seu perfil.</p>
        </div>
        <label className="manualSearch">
          Buscar
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Drive, checklist, pendência..." />
        </label>
      </div>
      <section className="manualIntro">
        <article className="panel">
          <h2>Seu perfil neste acesso</h2>
          <p>
            <span className={`roleChip ${role}`}>{roleLabel(role)}</span> {profile?.area || 'SET'}
          </p>
          <p className="muted">
            {role === 'admin'
              ? 'Você possui visão global e administração do sistema.'
              : role === 'manager'
                ? 'Você administra os processos e pendências da sua coordenação e pode atribuir demandas.'
                : 'Você visualiza somente processos e pendências que foram atribuídos diretamente a você.'}
          </p>
        </article>
        <article className="panel">
          <h2>Versão do manual</h2>
          <p className="muted">Manual integrado da versão 3.13.27. Os prints são exemplos reais da interface.</p>
        </article>
      </section>
      <nav className="manualToc">
        {visible.map((section) => (
          <a key={section.id} href={`#manual-${section.id}`}>
            {section.title}
          </a>
        ))}
      </nav>
      {visible.length === 0 ? <p className="muted">Nenhum procedimento encontrado para essa busca.</p> : null}
      <div className="stack">
        {visible.map((section) => (
          <article className="panel manualSection" id={`manual-${section.id}`} key={section.id}>
            <div className="manualHead">
              <span>{section.number}</span>
              <div>
                <h2>{section.title}</h2>
                <p className="muted">{section.description}</p>
              </div>
              <b>{section.scope}</b>
            </div>
            <ol>
              {section.steps.map((step) => (
                <li key={step.title}>
                  <b>{step.title}</b>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
            {section.image ? <img src={section.image.src} alt={section.image.alt} /> : null}
            {section.note ? <p className="note">{section.note}</p> : null}
          </article>
        ))}
      </div>
    </div>
  )
}
