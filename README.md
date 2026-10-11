# Controle de Conformidade

Nova versão do sistema da Secretaria do Trabalho. O `index.html` da pasta anterior continua intacto e serve só de referência.

Esta versão usa React, TypeScript e Vite. O login, os dados e as permissões continuam no Supabase já existente. A tela não decide quem é administrador: isso fica nas regras do banco.

## Como abrir

A pasta `web` fica no Google Drive, e essa pasta não consegue guardar o `node_modules`. Por isso a execução usa uma cópia local. Na pasta `web`:

```powershell
powershell -ExecutionPolicy Bypass -File .\iniciar.ps1
```

O endereço local aparece no terminal, em geral `http://localhost:5173`. O Node.js precisa estar instalado. Nesta máquina ele foi instalado pelo winget.

## O que já funciona

- Entrada e solicitação de acesso com e-mail `@trabalho.ce.gov.br`.
- Painel por projeto, processos, pendências, revisão das análises já gravadas, consulta dos checklists e solicitações.
- Aprovação de acesso pelo administrador.
- Gravação de pendência com conferência de versão, para duas pessoas não se sobrescreverem.

## Banco

Rode o arquivo `supabase/migrations/20261010_secure_item_update.sql` no SQL Editor do Supabase. Ele cria a função que preenche quem validou e impede que o responsável pela solicitação valide o próprio item. Até essa função existir, o sistema grava pela tabela, como a versão atual, e avisa se outra pessoa alterou o item no meio do caminho.

A leitura automática das pastas do Drive e a análise dos PDFs com OCR ficam para o serviço de servidor. Os resultados que já estão no banco aparecem em Análises e Pendências.
