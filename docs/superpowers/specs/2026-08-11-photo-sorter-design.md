# Saara — App desktop de importação/organização de fotos por evento

## Context

Usuário transfere fotos da câmera (SD card) pro PC e perde a organização: só
sobra a data (às vezes nem isso), sem noção de evento/viagem. Quer um app
desktop pessoal que resolva isso automaticamente, e que sirva também como
projeto pra testar/exercitar conhecimento técnico.

Pesquisa de mercado (2026-08-11) confirmou o gap: a única ferramenta que já
faz "agrupar por evento via gap de tempo configurável" é o Rapid Photo
Downloader, exclusivo de Linux (recusa oficial de porte pra Windows/Mac). No
Windows o mercado se divide entre organizadores simples (PhotoMove, sdcopy —
só pasta-por-dia) e suítes profissionais pesadas (Photo Mechanic, Downloader
Pro, digiKam — sem esse gap exposto de forma simples). Nenhum projeto
open-source no GitHub junta GUI + clustering por gap + suporte a
RAW/JPEG/vídeo (CLIs como Elodie e SortPhotos não têm interface, e Elodie
está abandonado desde 2023). Construir do zero é o caminho certo — não há
base madura pra adaptar.

## Decisões (via brainstorming)

- **Escopo**: projeto pessoal solo, separado do app de date ideas (outro
  plano, não relacionado).
- **Origem das fotos**: cartão SD de câmera → PC (não celular).
- **Tipos de arquivo**: JPEG + RAW + vídeo, todos no mesmo fluxo.
- **Organização**: agrupamento automático por evento, usando gap de tempo
  entre timestamps consecutivos (sem GPS/localização — câmera não grava
  isso).
- **Cópia, nunca mover**: original do card fica intacto.
- **Fluxo**: preview dos grupos antes de confirmar, com nome editável por
  grupo.
- **Plataforma/stack**: app desktop Windows em Electron + TypeScript + React
  (usuário já conhece e gosta de Electron; lógica do app — leitura de EXIF,
  clustering por gap, cópia de arquivo — não é pesada o suficiente pra
  justificar a fricção de aprender Rust/Tauri nesse projeto específico).
- **Leitura de metadata**: `exiftool-vendored` (wrapper Node do ExifTool)
  cobre JPEG + RAW (diversos fabricantes) + data de criação de vídeo com uma
  lib só — evita combinar bibliotecas diferentes por tipo de arquivo.

## Fora de escopo do V1 (fica pra V1.1)

- **Sugestão de nome de grupo via IA**: V1.1 usa IA pra sugerir nome do
  evento a partir de uma foto representativa do grupo (ex: "Praia",
  "Trilha"). Requisito importante levantado pelo usuário: a IA **não pode
  chutar isoladamente por grupo** — precisa usar o contexto dos grupos
  vizinhos (dias/eventos antes e depois) como validador de certeza. Exemplo
  do usuário: se um grupo mostra a pessoa na Torre Eiffel e o grupo seguinte
  mostra a pessoa num campo, a IA não pode presumir que o campo ainda é na
  Europa — sem confirmação (seja por continuidade visual, seja o usuário
  validando manualmente), a sugestão deve vir marcada como incerta ou nem
  ser feita. Ou seja: a sugestão de nome deve considerar a sequência
  temporal completa dos grupos como sinal de contexto, não só a foto do
  grupo isolado.
- **Destino em nuvem (Google Drive ou outro provedor) + compartilhamento**:
  V1 só grava em pasta local. V1.1 adiciona a opção de destino ser Drive (ou
  outro storage) em vez de/além do disco local, com opção de compartilhar.
- **Versão mobile (PWA)**: versão futura (pós-V1) rodando no celular via PWA,
  como MVP mobile. V1 é desktop Windows only (Electron). Origem continua
  sendo cartão SD — mesmo adaptador usado no PC, agora ligado no celular
  (USB-C/OTG). Implica repensar acesso a filesystem/exiftool no mobile (PWA
  não tem processo main equivalente ao Electron; acesso a SD via celular
  depende de API do browser tipo File System Access, com suporte/limites
  ainda não pesquisados) — não detalhado ainda, só registrado como direção
  futura.

## Modelo funcional (V1)

1. Usuário escolhe pasta origem (SD card) e pasta destino (local).
2. App varre recursivamente a origem, filtrando arquivos de imagem
   (JPEG, RAW) e vídeo.
3. Para cada arquivo, extrai timestamp de captura via `exiftool-vendored`
   (EXIF `DateTimeOriginal` pra foto/RAW; metadata de criação pra vídeo).
   Arquivo sem metadata de data cai num grupo "Sem data" separado — o app
   nunca inventa data a partir de file mtime sem avisar.
4. Ordena todos os arquivos por timestamp e percorre a sequência: um novo
   grupo (evento) começa sempre que o intervalo pro próximo arquivo excede
   um threshold configurável (default sugerido: 4h). RAW+JPEG do mesmo
   clique caem naturalmente no mesmo grupo (timestamps iguais/próximos).
5. Preview: lista de grupos expansíveis, com miniatura (thumbnail embutido
   do JPEG/RAW; ícone ou frame extraído pra vídeo), contagem de arquivos,
   intervalo de data, e campo de nome editável (nome sugerido
   automaticamente, ex: `2026-08-11` ou range `2026-08-09_a_2026-08-11`).
6. Usuário revisa, ajusta nomes se quiser, confirma.
7. App copia os arquivos pro destino, organizados em uma pasta por grupo,
   preservando timestamp original. Conflito de nome no destino é detectado
   e tratado (nunca sobrescreve silenciosamente).

## Arquitetura

- **Electron** (main + renderer), **TypeScript**, UI em **React**.
- **Main process**: acesso a filesystem (leitura de diretório, cópia de
  arquivo), chamadas ao `exiftool-vendored`, algoritmo de clustering.
- **Renderer**: 2 telas (`SetupScreen`, `ReviewScreen` — ver seção "Design de
  UI" abaixo), cada uma com sub-estados internos via componentes, em vez de
  navegação entre múltiplas telas cheias.
- **Empacotamento**: `electron-builder` gerando instalador Windows.

## Design de UI (Saara)

Decidido via brainstorming (2026-08-11), reação explícita contra estética
genérica de "AI slop" (gradiente indigo, glassmorphism, card com sombra em
tudo, ícone emoji, dashboard corporativo).

**Identidade**
- Nome do app: **Saara**.
- Idioma da UI (labels, botões, nome do grupo "Sem data", etc.): **Português**
  — isso substitui a decisão anterior de "inglês" tomada durante o plan
  mode; a UI inteira é em português.

**Tema visual — contact-sheet / darkroom**
- Dark theme, fundo quase preto (não preto puro).
- Cor de destaque: **vermelho escuro** (tom "luz de câmara escura"), usada
  com moderação — botão de ação primária, estado selecionado/editando,
  barra de progresso, nunca como fundo grande.
- Layout: **coluna única centralizada**, sem sidebar/rail lateral, largura
  máxima (~900–1000px), margens generosas em janelas largas.
- Tipografia: sans do sistema pra labels/texto; **monospace com números
  tabulares** pra tudo numérico/temporal (contagem de arquivos, datas,
  timestamps, progresso "12/340") — remete a carimbo de metadata de
  câmera/filme.
- Bordas: **levemente arredondadas** (raio pequeno, tipo 4–6px) — itens
  continuam com cara "quadrada", não pill/rounded-full em nada.
- Sem sombra de elevação, sem gradiente — divisores hairline (1px, cor
  quase igual ao fundo) separam grupos em vez de cards flutuando.
- **Ícones**: [Phosphor Icons](https://phosphoricons.com) via
  `@phosphor-icons/react` — zero emoji em qualquer lugar da UI.
- **Animações**: simples e modernas, não devem chamar mais atenção que o
  conteúdo. Transições CSS puras (opacity/transform) pra micro-interação
  (hover de botão, preenchimento de barra de progresso); para as trocas de
  sub-estado dentro de cada tela (setup → analisando → concluído; revisão →
  copiando → resumo), usar `framer-motion` (`motion/react`) — orquestra
  enter/exit de forma muito mais simples que CSS puro pra esse caso
  específico, e é a escolha pragmática mesmo mantendo o resto do app
  deliberadamente livre de dependências extras.
- **Validação de input**: `zod` — valida threshold (número positivo),
  caminhos de pasta antes de disparar `import:analyze`/`copy:start` via IPC,
  em vez de checagem manual ad-hoc espalhada pelos componentes.
- **Design tokens centralizados**: cores, espaçamento, raio de borda,
  tipografia definidos num lugar só (CSS custom properties em
  `src/renderer/src/theme.css`, ou objeto TS equivalente) — telas e
  componentes consomem os tokens, não valores soltos.

**Telas (substituem as 3 do plano original por 2, com sub-estados internos)**

1. **`SetupScreen`** — `FolderPicker` (origem), `FolderPicker` (destino),
   `ThresholdInput` (horas, default 24, validado via zod), botão "Analisar".
   Ao clicar, o botão dá lugar a `AnalyzeProgress` inline (fase atual +
   contagem) na mesma tela — sem navegar. Ao terminar, transição automática
   (via `framer-motion`) pra `ReviewScreen`.
2. **`ReviewScreen`** — header com contagem total, `ThresholdInput` (reajusta
   e reclusteriza ao vivo sem re-scan), lista de `GroupCard` (thumbnail
   grid, nome editável, contagem, intervalo de data — ícones Phosphor pra
   tipo de mídia/estado), botão "Confirmar e copiar" no rodapé. Ao
   confirmar, a área do botão vira `CopyProgress` inline; ao terminar, vira
   `CopySummary` (copiados/conflitos/erros + botão "Abrir pasta destino").

Componentes menores mantidos do design original: `GroupCard`, `Thumbnail`
(ícone Phosphor genérico pra vídeo, sem emoji), `ProgressBar`.

### Preparo pro PWA mobile futuro (convenção, não implementação)

Decisão de arquitetura sênior via brainstorming (2026-08-11): não construir
abstrações agora pra um segundo runtime (PWA) que ainda não existe —
interface desenhada sem um segundo caso real pra validar contra tende a
sair errada. Em vez disso, travar convenções baratas que já são verdade no
plano V1 e evitam retrabalho sem custo de complexidade hoje:

- **`src/shared/` fica sem dependência de Node/Electron, sempre.** O
  algoritmo de clustering (`clusterByGap`) e sugestão de nome
  (`suggestGroupName`) já são funções puras TypeScript — regra passa a ser
  intencional, não coincidência: nenhum import de `fs`, `path`, `electron`
  etc. entra nesses arquivos. Isso é o que permite reuso direto (via cópia
  do módulo ou publicação como pacote) numa futura PWA sem reescrever a
  lógica de agrupamento.
- **Os tipos de dados (`FileMeta`, `PhotoGroup`, `CopySummary`, etc.) são
  formas de dado neutras**, não amarradas a IPC do Electron — um futuro
  cliente PWA pode mirar no mesmo contrato de tipos mesmo sem compartilhar
  runtime.
- **Gaps conhecidos, propositalmente não resolvidos agora** (ficam pra
  quando a PWA for de fato especificada):
  - Leitura de metadata no browser precisa de lib diferente do
    `exiftool-vendored` (binário nativo, não roda em browser) — algo tipo
    `exifr` (JS/WASM), com cobertura de RAW provavelmente pior que
    ExifTool. Não pesquisado ainda.
  - Acesso a pasta/SD card via celular depende de suporte de File System
    Access API (ou equivalente) em browser mobile — suporte hoje é
    incerto/limitado. Não pesquisado ainda.
  - Extração de thumbnail embutido no browser é outro mecanismo, não
    reaproveita o código de `extractThumbnail.ts` (que usa exiftool).

## Testes

- Unit test do algoritmo de clustering com timestamps sintéticos (casos:
  gap exato no limiar, arquivos fora de ordem, grupo de 1 arquivo só).
- Teste de extração de metadata com arquivos de amostra (JPEG, pelo menos
  um formato RAW, um vídeo curto) — confirma que `exiftool-vendored` extrai
  a data certa de cada tipo.
- Teste manual end-to-end com SD card real: importar, revisar preview,
  confirmar, checar que arquivos batem 1:1 entre origem e destino
  (nenhuma foto perdida) e que a origem não foi alterada (cópia, não
  mover).
