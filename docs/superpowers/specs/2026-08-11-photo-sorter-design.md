# Photo Sorter — App desktop de importação/organização de fotos por evento

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
- **Renderer**: tela de seleção origem/destino, tela de preview/edição de
  grupos, tela de progresso de cópia.
- **Empacotamento**: `electron-builder` gerando instalador Windows.

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
