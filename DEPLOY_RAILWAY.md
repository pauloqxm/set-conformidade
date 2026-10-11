# Referência de deploy no Railway (GitHub)

O Railway reconhece o projeto pelo `Dockerfile` na raiz do repositório. Não é preciso Nixpacks nem comando de start no painel, se o `CMD` da imagem já escuta em `0.0.0.0` e na porta `$PORT`.

## O que o Railway precisa ver no GitHub

Na raiz do repositório:

```text
Dockerfile
requirements.txt
```

Mais o código da aplicação (por exemplo `backend/`, `frontend/` ou o que o `Dockerfile` copiar).

## Dockerfile de referência

```dockerfile
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8020

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8020

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8020}"]
```

Ajuste o `COPY` e o `CMD` ao layout do outro projeto. O ponto fixo é este:

- escutar em `0.0.0.0`
- usar `${PORT}` (o Railway injeta essa variável)

## requirements.txt de referência

```text
fastapi>=0.110
uvicorn[standard]>=0.27
```

Inclua as demais dependências do projeto.

## Conectar o GitHub

1. https://railway.app → entrar com GitHub.
2. **New Project** → **Deploy from GitHub repo**.
3. Escolher o repositório e a branch (`main`).
4. O Railway detecta o `Dockerfile` e inicia o build.

## Variáveis

Em **Variables**:

| Variável | Quem define | Uso |
|----------|-------------|-----|
| `PORT` | Railway | Porta pública. Não fixe um número em produção. |
| demais chaves do app | você | APIs, banco, segredos. Nunca no Git. |

O `.env` local não vai para o Railway. Recrie as variáveis no painel.

## Domínio

**Settings** → **Networking** → **Generate Domain**.

O serviço precisa responder HTTP em `0.0.0.0:$PORT`. Sem isso, o deploy sobe e o domínio fica fora do ar.

## Atualizar

`git push` na branch conectada dispara um novo deploy. Espere **Success** e recarregue o site.

## Se o Railway não reconhecer o build

- Confirme `Dockerfile` na raiz (mesmo nome, D maiúsculo).
- Confirme que o `CMD` usa `$PORT`.
- Veja os logs em **Deployments**.
- Se o projeto não for Python/Uvicorn, troque só o `CMD` (Node, etc.), mantendo host `0.0.0.0` e `$PORT`.
