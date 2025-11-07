# SVDown

Ferramenta full-stack para baixar e limpar metadados de videos das principais plataformas sociais (Shopee, Pinterest, TikTok, YouTube e Meta). O projeto combina um front-end estatico servindo landing pages bilingiues com um backend Express/TypeScript que resolve links, prepara downloads sem marca d'agua e registra metricas de uso em SQLite.

## Visao geral
- **Resolucao de links**: cada plataforma possui um service dedicado em `src/services` responsavel por normalizar URLs, extrair metadados e apontar o arquivo bruto (video/audio). Fallbacks sao usados sempre que possivel para garantir a entrega.
- **Download seguro**: o endpoint `/api/download` baixa o arquivo com Axios, aplica limites de tamanho (150 MB), remove metadados via `ffmpeg` (ou converte para MP3) e devolve o stream direto ao navegador.
- **Sessao e telemetria**: um identificador `svdown_uid` em cookie + storage local alimenta `sessionStore.ts`, que persiste estatisticas em `data/sessions.db` via `better-sqlite3`. Os dados abastecem o componente "Seu impacto gratuito" no front.
- **Experiencia do usuario**: HTML/CSS/JS em `src/view` inclui helpers de acessibilidade, textos PT/EN, toasts de doacao (PIX), seletor de plataformas e uma futura janela dedicada para limpar metadados de arquivos enviados manualmente.
- **Documentacao de produto**: a pasta `docs/` concentra o bug report consolidado e o plano `SVDown Trends`, que descreve a proxima aba de tendencias com sugestao de conteudos virais, IA para hashtags e integracao com links de afiliados.

## Stack e requisitos
- Node.js >= 18 (o projeto usa `tsx` para executar TypeScript diretamente).
- `ffmpeg-static` embutido no runtime; apenas certifique-se de ter uma libc compativel no SO hospedeiro.
- SQLite via `better-sqlite3` (criado automaticamente em `data/sessions.db` ou em `SVDOWN_DATA_DIR`).
- Navegador moderno para o front-end (Chrome/Edge/Firefox).

## Instalar e executar
```bash
npm install
npm run dev        # hot reload (tsx watch src/app.ts)
# ou
npm start          # executa src/app.ts uma vez
```

Por padrao o servidor sobe em `http://localhost:3000`. As rotas estaticas principais sao `/` (PT), `/en` e `/como-usar`. A API fica em `/api/*`.

### Scripts npm disponiveis
| Script        | Descricao                                                                 |
|--------------|----------------------------------------------------------------------------|
| `npm run dev`| Observa `src/` com `tsx watch`, ideal para desenvolvimento local           |
| `npm start`  | Executa o servidor Express sem watcher                                    |
| `npm test`   | Roda Jest (configurado para ESM) – hoje cobre utilitarios de view          |

## Variaveis de ambiente
| Variavel             | Funcao                                                                                     | Padrao            |
|----------------------|---------------------------------------------------------------------------------------------|-------------------|
| `PORT`               | Porta HTTP do servidor                                                                     | `3000`            |
| `SVDOWN_API_KEY`     | Token usado pelo guard (`svdown_key`) para liberar as rotas `/api/*`                       | `dev-key`         |
| `SVDOWN_SHARED_KEY`  | Segredo usado pelo middleware de sessao (`svdown_sid`) quando for habilitado               | `local-dev-key`   |
| `SVDOWN_DATA_DIR`    | Pasta onde o SQLite de sessoes sera criado                                                  | `./data`          |
| `NODE_ENV`           | Define flags de cookies (`secure`)                                                          | `development`     |
| `PIPED_INSTANCES`    | Lista separada por virgulas de instancias Piped para o `youtubeService`                    | valores default   |
| `INVIDIOUS_INSTANCES`| Lista separada por virgulas de instancias Invidious usadas como fallback no YouTube        | valores default   |
| `YTDOWN_BASE_URL`    | Endpoint base usado pelo modo alternativo de download do YouTube                           | `https://ytdown.to` |
| `YTDOWN_TIMEOUT_MS`  | Timeout (ms) para chamadas ao provedor alternativo                                         | `15000`           |

## API principal
- `POST /api/resolve` – body `{ link: string }`. Identifica qual service atende o link, retorna titulo, thumbnail, URLs de video/audio e eventuais props extras (p. ex. `pageProps` da Shopee).
- `GET /api/download` – query `url`, `fallback`, `type=video|audio`, `service`, `durationSeconds`. Faz download, remove metadados e envia o arquivo final. Marca o cabecalho `X-Download-Count` com o total acumulado do usuario.
- `GET /api/session/stats` – retorna estatisticas do usuario atual e totais globais (downloads, duracao acumulada, plataforma mais usada).

Todos os endpoints exigem o cookie/header `svdown_key` com o valor configurado em `SVDOWN_API_KEY`. O front faz o bootstrap desse cookie via `ensureApiCookie`.

## Fluxo de download e limpeza
1. O usuario envia a URL via landing page (`script.js` chama `/api/resolve`).
2. O backend identifica a plataforma (`services/index.ts`), aplica scraping/API dedicada (Shopee universal links, Pinterest embed, TikTok, YouTube via Piped/Invidious, Meta via `metadownloader`).
3. Ao confirmar o download, o front aciona `/api/download`.
4. O servidor baixa o arquivo para um diretorio temporario, registra o hash de metadados (para log) e executa `ffmpeg` com `-map_metadata -1 -c copy`. Para audio, roda uma conversao `libmp3lame`.
5. O arquivo limpo e transmitido com cabecalhos anti-cache. Se o processamento falhar, o arquivo original e enviado e o header indica que os metadados nao foram limpos.
6. O evento e gravado no SQLite com `recordDownloadEvent`, abastecendo os cards de estatisticas.

A nova janela de limpeza de metadados (upload manual) pode reaproveitar o mesmo pipeline (`cleanupMetadata`) e e vista como evolucao natural para quem deseja limpar arquivos proprios antes de postar. Planejar UI e fila dedicada esta na lista de proximos passos.

## Persistencia e arquivos importantes
- `data/sessions.db` (ou `SVDOWN_DATA_DIR`): banco SQLite usado por `sessionStore.ts`.
- `src/view/`: landing page (HTML, CSS, JS) + assets como `social-preview.png` e `favicon.svg`.
- `docs/bug-report.md`: relato consolidado de problemas recorrentes enviados pelos usuarios.
- `docs/svdown-trends-plan.md`: plano completo da futura aba SVDown Trends (ingestao Shopee, IA para hashtags, modelo freemium + afiliado).

## Estrutura resumida
```
src/
  app.ts               # bootstrap do Express
  controller/          # handlers de download, resolver, stats
  middleware/          # api key, cookies, session helpers
  routes/              # montagens / e /api
  services/            # resolvers por plataforma + store de sessoes
  view/                # front estatico (HTML/CSS/JS + testes de utilitarios)
docs/                  # planos de produto e bug report
bin/                   # utilitarios (por ex. yt-dlp para experimentos locais)
```

## Testes e qualidade
```bash
npm test       # executa Jest (usa ts-jest para o front utilitario duration.mjs)
```
- O linting ainda nao esta configurado; recomenda-se adicionar ESLint/Prettier nas proximas iteracoes.
- Para validar o fluxo manualmente, rode `npm run dev` e teste downloads reais (Shopee/Pinterest/TikTok/YouTube/Instagram) garantindo que o header `X-Download-Count` avance e que o arquivo baixe sem metadados (verifique com `ffprobe -show_format`).

## Roadmap imediato
1. **SVDown Trends (docs/svdown-trends-plan.md)** – finalizar acesso a API da Shopee, definir storage (Postgres + Redis), desenhar wireframes e dividir as tasks backend/frontend/IA/billing.
2. **Janela dedicada de limpeza de metadados** – permitir upload manual de arquivos para rodar o pipeline `cleanupMetadata` mesmo sem baixar via SVDown, adicionando fila/worker isolado e promessa clara de descarte rapido dos arquivos temporarios.
3. **Camada de billing** – transformar `svdown_key` em tokens reais por usuario/plano e destravar limites diferenciados (ex.: downloads simultaneos, acesso ao Trends, IA de copy).
4. **Observabilidade** – enviar logs estruturados para um collector e adicionar metricas de fila/download (tempo de ffmpeg, taxa de falha, volume por servico).

## Como contribuir
1. Discuta ideias abrindo uma issue (referencie o plano em `docs/` quando fizer sentido).
2. Crie uma branch, adicione testes quando tocar em logica e descreva claramente como validar.
3. Abra um PR mencionando cenarios cobertos e riscos conhecidos (ex.: limites de tamanho, dependencia do ffmpeg).

---
SVDown e mantido pela comunidade para manter downloads sem marca d'agua acessiveis. Se voce usa o projeto em producao, considere apoiar com PIX atraves da propria landing page.
