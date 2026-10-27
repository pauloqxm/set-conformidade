import JSZip from 'jszip'

export type ParsedItem = {
  section_code: string
  section_title: string
  item_code: string
  verification: string
  responsible: string
  basis: string
  ordinal: number
  interpretation: string
  expected_evidence: string[]
  conform_when: string
  nonconform_when: string
  review_when: string
  search_terms: string[]
  analysis_focus: string
}

export type ParsedModule = {
  code: string
  title: string
  items: ParsedItem[]
  sections: { code: string; title: string }[]
  folder_keys: string[]
  ordinal: number
}

export type ParsedChecklist = {
  hash: string
  name: string
  instrument_type: string
  instrument_key: string
  source_file_name: string
  context: Record<string, unknown>
  modules: ParsedModule[]
}

export function norm(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

export function cleanStageTitle(value: string | null | undefined) {
  return String(value || '')
    .replace(/^MÓDULO\s+[A-Z0-9]+\s*[—-]\s*/i, '')
    .trim()
}

export function folderKeysFor(title: string) {
  const clean = norm(title)
  if (clean.includes('CELEBR')) return ['CELEBRAÇÃO', 'FORMALIZAÇÃO']
  if (clean.includes('ADITIV')) return ['ADITIVO', 'ADITIVOS', 'TERMO ADITIVO']
  if (clean.includes('ACOMPANH') || clean.includes('FISCALIZ') || clean.includes('PRESTACAO')) {
    return ['ACOMPANHAMENTO', 'FISCALIZAÇÃO', 'PRESTAÇÃO DE CONTAS']
  }
  return [String(title || '').replace(/^.*?—\s*/, '').trim()].filter(Boolean)
}

function xmlText(node: Element) {
  return Array.from(node.getElementsByTagNameNS('*', 't'))
    .map((item) => item.textContent || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function childrenLocal(node: Element, name: string) {
  return Array.from(node.childNodes).filter((child): child is Element => child instanceof Element && child.localName === name)
}

async function sha256Hex(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const aliases = {
  item: ['ITEM', 'N', 'Nº', 'N°', 'NUMERO', 'NÚMERO', 'CODIGO', 'CÓDIGO', 'ORDEM', 'ID'],
  verification: ['VERIFICAC', 'CRITERIO', 'CRITÉRIO', 'REQUISITO', 'EXIGENCIA', 'EXIGÊNCIA', 'DOCUMENTO', 'DESCRICAO', 'DESCRIÇÃO', 'PERGUNTA', 'ANALISE', 'ANÁLISE', 'CONFERENCIA', 'CONFERÊNCIA'],
  responsible: ['RESPONS', 'AREA RESPONSAVEL', 'ÁREA RESPONSÁVEL', 'SETOR RESPONSAVEL', 'SETOR RESPONSÁVEL', 'UNIDADE RESPONSAVEL', 'UNIDADE RESPONSÁVEL'],
  basis: ['FUNDAMENTO', 'BASE LEGAL', 'REFERENCIA', 'REFERÊNCIA', 'LEGISLAC', 'LEGISLAÇ', 'DISPOSITIVO', 'NORMA', 'AMPARO LEGAL'],
}

function headerMatch(value: string, list: string[]) {
  const clean = norm(value)
  return list.some((alias) => clean === norm(alias) || clean.includes(norm(alias)))
}

function looksCode(value: string) {
  const text = String(value || '').trim()
  return /^([A-Z]{0,3}[.\- ]?)?\d+(?:[.\-]\d+){0,3}[A-Z]?$/i.test(text) || /^[A-Z]+\.\d+(?:\.\d+)*$/i.test(text)
}

function stageHeading(text: string) {
  const clean = norm(text)
  return /^(MODULO|ETAPA|FASE)\b/.test(clean) || ['CELEBRACAO', 'FORMALIZACAO', 'ADITIVO', 'ACOMPANHAMENTO', 'FISCALIZACAO', 'PRESTACAO DE CONTAS', 'EXECUCAO', 'CONVENIO', 'CONGENERES', 'SELECAO', 'CHAMAMENTO'].some((key) => clean.includes(key))
}

export async function parseChecklistDocx(file: File): Promise<ParsedChecklist> {
  const buffer = await file.arrayBuffer()
  const hash = await sha256Hex(buffer)
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('O arquivo não contém um documento Word válido.')
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const body = document.getElementsByTagNameNS('*', 'body')[0]
  if (!body) throw new Error('Não foi possível localizar o conteúdo principal do Word.')

  const paragraphs: string[] = []
  const allModules: ParsedModule[] = []
  const state: { current: ParsedModule | null } = { current: null }
  let lastHeading = ''

  const makeModule = (title: string, code = '') => {
    const clean = cleanStageTitle(String(title || '').replace(/^\d+[.)-]?\s*/, '').trim()) || `Etapa ${allModules.length + 1}`
    const same = allModules.find((item) => norm(item.title) === norm(clean))
    if (same) {
      state.current = same
      return same
    }
    const module: ParsedModule = {
      code: code || `E${allModules.length + 1}`,
      title: clean,
      items: [],
      sections: [],
      folder_keys: folderKeysFor(clean),
      ordinal: allModules.length,
    }
    allModules.push(module)
    state.current = module
    return module
  }

  const nearest = () => state.current || makeModule(lastHeading || 'Checklist principal')

  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType !== 1) continue
    const element = child as Element
    if (element.localName === 'p') {
      const text = xmlText(element)
      if (!text) continue
      paragraphs.push(text)
      const explicit = text.match(/(?:MÓDULO|MODULO|ETAPA|FASE)\s*([A-Z0-9.\-]*)\s*[—–:\-]?\s*(.*)$/i)
      if (explicit && String(explicit[2] || '').trim()) {
        lastHeading = String(explicit[2]).trim()
        makeModule(lastHeading, String(explicit[1] || '').trim())
      } else if (stageHeading(text) && text.length < 190) {
        lastHeading = text.trim()
        const active = state.current
        if (!active || norm(active.title) !== norm(cleanStageTitle(lastHeading))) makeModule(lastHeading)
      } else if (text.length < 170 && /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9\s\-–—:/().]+$/.test(text)) {
        lastHeading = text.trim()
      }
      continue
    }
    if (element.localName !== 'tbl') continue
    const rows = childrenLocal(element, 'tr')
      .map((row) => childrenLocal(row, 'tc').map((cell) => xmlText(cell)))
      .filter((row) => row.some((cell) => String(cell || '').trim()))
    if (!rows.length) continue

    let headerIndex = -1
    let columns = { item: -1, verification: -1, responsible: -1, basis: -1 }
    for (let index = 0; index < Math.min(rows.length, 6); index += 1) {
      const cells = rows[index] ?? []
      const detected = { item: -1, verification: -1, responsible: -1, basis: -1 }
      cells.forEach((value, column) => {
        if (detected.item < 0 && headerMatch(value, aliases.item)) detected.item = column
        if (detected.verification < 0 && headerMatch(value, aliases.verification)) detected.verification = column
        if (detected.responsible < 0 && headerMatch(value, aliases.responsible)) detected.responsible = column
        if (detected.basis < 0 && headerMatch(value, aliases.basis)) detected.basis = column
      })
      const score = (detected.item >= 0 ? 1 : 0) + (detected.verification >= 0 ? 2 : 0) + (detected.responsible >= 0 ? 0.5 : 0) + (detected.basis >= 0 ? 0.5 : 0)
      if (score >= 2) {
        headerIndex = index
        columns = detected
        break
      }
    }

    if (headerIndex < 0) {
      const maxColumns = Math.max(...rows.map((row) => row.length))
      if (maxColumns < 2) continue
      const sample = rows.slice(0, Math.min(rows.length, 12))
      const codeCounts = Array.from({ length: maxColumns }, (_, column) => sample.filter((row) => looksCode(row[column] ?? '')).length)
      const maxCode = Math.max(...codeCounts)
      if (maxCode < 1) continue
      const itemColumn = codeCounts.indexOf(maxCode)
      const statusOnly = sample
        .filter((row) => String(row[itemColumn] || '').trim())
        .every((row) => ['C', 'NC', 'NA', 'RTN', 'N/A'].includes(norm(row[itemColumn])))
      if (statusOnly) continue
      const textScores = Array.from({ length: maxColumns }, (_, column) => sample.reduce((sum, row) => sum + String(row[column] || '').length, 0))
      textScores[itemColumn] = -1
      const verificationColumn = textScores.indexOf(Math.max(...textScores))
      if (rows.filter((row) => String(row[verificationColumn] || '').trim().length >= 8).length < 1) continue
      columns = { item: itemColumn, verification: verificationColumn, responsible: -1, basis: -1 }
      headerIndex = -1
    }

    const module = nearest()
    let sectionCode = ''
    let sectionTitle = ''
    let ordinal = module.items.length
    for (const cells of rows.slice(headerIndex + 1)) {
      const rawItem = String(cells[columns.item] || '').trim()
      const verification = String(cells[columns.verification] || '').trim()
      const filled = cells.filter((cell) => String(cell || '').trim()).length
      if (filled === 1 && rawItem && !looksCode(rawItem)) {
        sectionTitle = rawItem
        sectionCode = ''
        module.sections.push({ code: '', title: sectionTitle })
        continue
      }
      const section = rawItem.match(/^([A-Z]{0,3}\.?\d+(?:\.\d+)?)\s+(.{4,})$/i)
      if (section && !verification) {
        sectionCode = section[1] ?? ''
        sectionTitle = section[2] ?? ''
        module.sections.push({ code: sectionCode, title: sectionTitle })
        continue
      }
      if (!verification) {
        const tail = cells.map((cell) => String(cell || '').trim()).filter(Boolean).join(' ')
        const previous = module.items[module.items.length - 1]
        if (tail && previous) previous.verification = `${previous.verification} ${tail}`.trim()
        continue
      }
      let itemCode = rawItem
      if (!itemCode || headerMatch(itemCode, aliases.item)) itemCode = `${module.code || 'I'}.${ordinal + 1}`
      if (headerMatch(itemCode, aliases.item) && headerMatch(verification, aliases.verification)) continue
      module.items.push({
        section_code: sectionCode,
        section_title: sectionTitle,
        item_code: itemCode,
        verification,
        responsible: columns.responsible >= 0 ? String(cells[columns.responsible] || '').trim() : '',
        basis: columns.basis >= 0 ? String(cells[columns.basis] || '').trim() : '',
        ordinal,
        interpretation: '',
        expected_evidence: [],
        conform_when: '',
        nonconform_when: '',
        review_when: '',
        search_terms: [],
        analysis_focus: '',
      })
      ordinal += 1
    }
  }

  const merged: ParsedModule[] = []
  for (const module of allModules) {
    if (!module.items.length) continue
    const existing = merged.find((item) => norm(item.title) === norm(module.title))
    if (existing) {
      for (const item of module.items) {
        item.ordinal = existing.items.length
        existing.items.push(item)
      }
      existing.sections.push(...module.sections)
    } else {
      merged.push({ ...module, ordinal: merged.length })
    }
  }
  if (!merged.length) {
    throw new Error('Não consegui identificar itens de verificação neste Word. O checklist pode ter colunas diferentes, mas precisa conter os itens e suas descrições em tabela.')
  }

  const titleCandidates = paragraphs.filter((item) => item.length > 4 && item.length < 180 && !/^\d+\./.test(item))
  const checklistTitle = titleCandidates.find((item) => norm(item).includes('CHECKLIST')) || file.name.replace(/\.docx$/i, '')
  const instrumentCandidate = paragraphs.find((item) => /CONV[ÊE]NIO|CONTRATO|TERMO|INSTRUMENTO|CONG[EÊ]NERE/i.test(item)) || checklistTitle
  const instrument = String(instrumentCandidate || checklistTitle).replace(/^CHECKLIST\s*[-–—:]?\s*/i, '').trim()
  return {
    hash,
    name: checklistTitle,
    instrument_type: instrument,
    instrument_key: norm(instrument),
    source_file_name: file.name,
    context: {
      title: checklistTitle,
      instrument_type: instrument,
      scope_line: '',
      objective: '',
      base_normative: '',
      attention_points: [],
      parser_version: 'adaptativo-v2',
    },
    modules: merged,
  }
}
