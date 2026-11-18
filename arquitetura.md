# Arquitetura · Ponte Global

## Organização e infraestrutura

Uma única aplicação Next.js com TypeScript atende ao produtor em português e ao comprador em chinês simplificado. O servidor coordena persistência, geração, revisão e leitura pública. A interface usa Tailwind e componentes próprios. Zod valida entradas e saídas estruturadas. A stack proposta na conversa inclui Supabase PostgreSQL e Storage, API Gemini Flash e deploy na Vercel. Validar modelo disponível e cota na fundação. O teste no Brasil atende à demonstração. A operação futura na China continental exige validar acesso, latência e dependências a partir daquele território.

| Módulo | Responsabilidade | Integrações |
|---|---|---|
| Stores | Criar loja e sessão anônima, aprovar apresentação geral e persistir ordem. | PostgreSQL, cookies, catálogo público. |
| Products | Rascunhos em português, fotos, validação por categoria, apresentações e publicação. | SDK do Supabase, Storage, módulo AI e geração de QR a partir da URL pública. |
| Messaging | Consultas, acesso do comprador, histórico, leitura e confirmação de respostas. | PostgreSQL, AI e atualização periódica dos dois lados. |
| AI | Três operações com esquemas e prompts versionados, verificação factual e registro de resultado. | Gemini Flash em chamadas de servidor. Adaptador local determinístico para testes. |

Adotar como base proposta migrações SQL e SDK Supabase. A chamada de IA pode ocorrer durante uma requisição com estado real de processamento. Um único adaptador concentra limites, erros e repetição explícita. **Implementado:** cada operação recebe um prazo único (50 s, dentro dos 60 s da rota). Respostas 5xx, 429, erro de rede e tempo esgotado passam ao próximo modelo de um rodízio (`GEMINI_MODEL` + `GEMINI_FALLBACK_MODEL`); chamada sem resposta após 14 s (identidade) ou 10 s (mensagens) recebe uma chamada paralela ao modelo seguinte, e vale a primeira resposta. 404 tira o modelo do rodízio; 400/401/403 encerram. `ai_calls.detail` registra a trilha, sem conteúdo. Tradução de atributo sem campo de origem (ex.: aroma citado só na descrição) é descartada em vez de reprovar a geração. Microsserviços, múltiplos agentes e filas distribuídas ficam fora da arquitetura do MVP.

## Modelo relacional

Chaves primárias UUID e datas com fuso no banco. Os nomes de campos abaixo detalham a implementação proposta. Os oito conjuntos de registros dão suporte aos quatro módulos.

| Tabela | Chaves e campos principais | Regras de consistência |
|---|---|---|
| `stores` | `id`, `slug` único, `name_pt`, cidade, estado, origem, `description_pt`, contato privado opcional, `description_zh`, cópia aprovada do perfil público, revisão e datas. | Uma loja para vários produtos. Criada internamente com a sessão, torna-se pública na primeira publicação. Descrição chinesa aprovada a partir da operação 1. |
| `products` | `id`, `store_id`, slug estável, `name_pt`, marca, descrição, `category`, `attributes`, `commercial`, origem/história, diferencial, `positioning`, `display_order`, `revision`, `published_presentation_id` opcional. | Fonte dos fatos; campos específicos validados por categoria. No máximo duas características de personalidade. O ponteiro público só aceita apresentação deste produto. |
| `product_images` | `id`, `product_id`, chave imutável do arquivo, ordem, texto alternativo. | Até três fotos reais. Primeira imagem é a capa. Preservar os arquivos referenciados em versões anteriores. |
| `presentations` | `id`, `product_id`, `version`, revisão-fonte, estado da geração, `source_snapshot`, `name_options`, recomendação, escolha, `content_zh`, datas de geração, aprovação e publicação. | Par produto/versão único. Snapshot inclui fatos, imagens ordenadas, contexto usado e condições monetárias. Congelar após aprovação. |
| `conversations` | `id`, `store_id`, `product_id`, `presentation_id`, idioma do comprador, hash do acesso privado, nome/empresa opcionais, última mensagem recebida visualizada, datas. | Fixar a versão que o comprador viu. Validar coerência entre as três referências. Uma consulta segue com seu contexto após republicação. |
| `messages` | `id`, `conversation_id`, remetente, texto e idioma originais, tradução e idioma-alvo, estado, análise opcional, identificador de envio, datas de criação e envio. | Guardar originais. Tornar uma resposta visível ao comprador apenas com tradução aprovada e envio confirmado. |
| `store_sessions` | `id`, `store_id`, hash do segredo, datas de criação, expiração e revogação. | Segredo imprevisível em cookie seguro. Verificar sessão e vínculo com a loja em toda operação privada. |
| `ai_calls` | `id`, operação, referência ao produto ou mensagem, revisão, versão do contrato/prompt, modelo, estado, duração, erro técnico e data. | Distinguir erro do provedor, formato inválido e conflito de revisão. Evitar registrar segredos, contatos e transcrições integrais. |

**Atributos e unidades.** Para cachaça, prever tipo, volume em mL (inteiro positivo), teor alcoólico em % (decimal entre 0 e 100), madeira, envelhecimento em meses (inteiro a partir de zero), aroma, sabor e região. Em `commercial`, armazenar `price_brl_cents` como inteiro não negativo ou nulo, pedido mínimo opcional em unidades inteiras positivas, disponibilidade e observações declaradas. Campo vazio permanece ausente. Não deduzir estoque, certificação, logística ou tipo a partir de um adjetivo de marca. Café e mel terão seus próprios esquemas numa etapa futura.

**Projeções públicas.** Loja, produto e conversa têm consultas de leitura distintas. A loja lista somente os produtos publicados em ordem, com o primeiro em destaque. A vitrine lê a apresentação apontada e seu snapshot. O chat lê a apresentação fixada na consulta. O perfil público da loja inclui apenas campos aprovados. Contato privado exige autorização específica para divulgação.

## Rascunho, geração e publicação

| Estado percebido | Condição | Próxima ação |
|---|---|---|
| Rascunho | Cadastro salvo, inclusive incompleto. | Continuar edição. Nome, descrição e uma foto liberam a geração ao concluir. |
| Gerando | Requisição ativa vinculada à revisão salva. | Exibir progresso real. Se houver erro ou tempo esgotado, preservar dados e oferecer nova tentativa. |
| Pronto para revisão | Saída validada para a revisão atual. | Comparar opções, manter a marca original ou escolher um nome e revisar a prévia fiel. |
| Publicado | Ponteiro público aponta para versão aprovada. | Abrir vitrine, copiar link ou compartilhar QR. |
| Alterações pendentes | Existe versão pública e uma revisão privada mais recente. | Mostrar simultaneamente a versão pública e o estado do trabalho novo. |
| Retirado de publicação | O produtor removeu o ponteiro público. | Ocultar a ficha pública e manter histórico, conversas e slug para republicação. |

**Regra de gravação.** Salvar o rascunho e capturar revisão e contexto antes de chamar a IA. Ao retornar, conferir a revisão, validar o contrato e impedir que uma resposta atrasada substitua dados novos. Ao publicar, verificar autorização, identificação do produtor, foto, escolha válida, correspondência da revisão e aprovação explícita. Congelar o snapshot e trocar o ponteiro em uma transação. Se a revisão mudou, abrir novamente a revisão. Repetir a mesma confirmação deve manter uma única publicação.

**Edições.** Nome, descrição, história, origem, posicionamento ou atributos citados exigem atualizar a adaptação relevante. Mudanças apenas em preço e fotos reutilizam o editorial válido e exigem nova prévia aprovada. A reordenação do catálogo é uma ação explícita da loja, aplicada em conjunto e independente de republicar fichas. Reordenar fotos é uma edição do produto. Se o perfil da loja mudar, revisar separadamente seu conteúdo público e invalidar adaptações pendentes que dependam do contexto alterado.

**Consulta concorrente.** A vitrine inclui o identificador da apresentação vista. Antes de abrir nova conversa, o servidor compara essa versão com a publicada. Se houve troca, solicitar que o comprador reveja a vitrine atualizada. Conversas já abertas continuam com a versão anterior. Índices por loja/ordem, produto/versão e conversa/data dão suporte a essas leituras.

## Preço demonstrativo e estável

**BRL 1 = CNY 1,15.** Salvar o preço original em centavos BRL. No snapshot, gravar o valor original, taxa decimal exata `1.15`, tipo `fixed_demo` e moeda de apresentação `CNY`. Derivar os centavos de CNY multiplicando os centavos BRL por 115/100 e arredondando uma vez, ao centavo mais próximo, com empate para cima. O arredondamento é uma convenção técnica proposta. Uma única função alimenta a prévia e a vitrine.

| Entrada | Resultado público | Observação |
|---|---|---|
| R$ 79,00 | ¥90.85 | BRL secundário e aviso de taxa demonstrativa. |
| R$ 0,10 | ¥0.12 | Meio centavo de yuan arredondado para cima. |
| Ausente | 询价 | Omitir valores monetários. Manter a ação de contato. |

O cálculo é determinístico. Dispensa cotação externa, chamada de IA e edição independente de um preço em CNY.

## Contratos de IA

Convenção técnica: strings são texto simples, listas são arrays JSON e campos opcionais admitem ausência conforme o esquema. A aplicação associa operação, revisão, sessão e versão. O modelo recebe somente o contexto autorizado. O servidor valida estrutura, referências e números antes de persistir o resultado. A camada visual é responsável pelo HTML. Em qualquer falha, o servidor classifica o erro, mantém a entrada e oferece repetição sobre a revisão válida.

### 1. Criar identidade e apresentação

**Entrada:** nome e descrição em português, categoria, atributos presentes, origem, história, diferencial, até duas características de posicionamento e contexto da loja. A preferência padrão é equilibrar reconhecimento da marca e construção de significado. O preço é renderizado pelo sistema.

| Campo de saída | Tipo e validação |
|---|---|
| `name_options` | Lista com exatamente três IDs únicos, um por estratégia `phonetic`, `semantic` e `balanced`. |
| Cada opção | `hanzi`, `pinyin`, `meaning_pt`, `rationale_pt`, `aesthetic_note_pt` e `tradeoff_pt` são textos. `cultural_cautions` é lista de possíveis ambiguidades. Explicar relação com a marca, legibilidade, pronúncia e memória. |
| `recommended_name_id`, `recommendation_reason_pt` | ID válido e justificativa concreta, ou ambos nulos se a preferência equilibrada não puder ser sustentada. A escolha pertence ao produtor. |
| `content_zh` | Frase curta, descrição, história opcional e até três destaques. Cada destaque contém texto e referências a campos de origem presentes. Manter o editorial compatível com qualquer nome selecionado; o título vem da escolha na prévia. |
| `store_description_zh` | Texto opcional produzido junto com a primeira apresentação, ou na atualização do perfil. Requer fonte em português e aprovação para exposição na loja. Implementado como `store_intro` (`zh` + `pt`) na saída `identity-output-v2`; saídas v1 sem o campo continuam válidas. O produtor aprova o texto na confirmação da publicação (`approve_store_intro`), separado do ponteiro do produto. |

Categoria e especificações numéricas usam rótulos localizados do sistema e valores do snapshot. A saída não concede garantias culturais ou jurídicas. O produtor seleciona uma opção ou marca a decisão de manter o original; persistir essa decisão separadamente da recomendação.

### 2. Interpretar consulta do comprador

**Entrada:** mensagem original já salva, últimas mensagens relevantes daquela conversa e snapshot da versão vinculada. Limitar histórico ao necessário e distinguir texto do comprador das instruções da operação.

| Campo de saída | Tipo e validação |
|---|---|
| `language`, `translation_pt` | Código de idioma identificado e tradução completa em português. Preservar números, unidades, localidades e condições da pergunta. |
| `intents`, `summary_pt` | Lista de intenções (quantidade, entrega, preço, disponibilidade, atributos ou outra) e síntese curta em português. |
| `available_fields`, `missing_information` | Referências válidas a dados presentes e lista de pendências em português. O aplicativo recupera os valores do snapshot. |
| `suggested_reply_pt`, `cultural_note_pt` | Rascunho editável em português e nota opcional, nula quando não houver observação específica. |

Exemplo: “500 garrafas para Xangai” identifica quantidade e entrega. Um volume cadastrado de 700 mL esclarece a unidade de produto. Ainda cabe ao produtor confirmar capacidade, prazo e frete. A sugestão fica privada.

### 3. Traduzir resposta do produtor

**Entrada:** texto final em português, idioma-alvo fixo em chinês simplificado (decisão de 18/11/2026: toda resposta sai em chinês, mesmo para perguntas em inglês ou pinyin) e histórico recente da mesma consulta. A prévia da tradução é vinculada à revisão exata do texto.

| Campo de saída | Tipo e validação |
|---|---|
| `target_language` | Código igual ao solicitado pelo sistema, por exemplo `zh` ou `en`. |
| `translated_text` | Texto que preserva quantidades, unidades, condições, negações e ressalvas do produtor. |
| `translation_warnings` | Lista de dúvidas de tradução para a revisão humana, vazia se inaplicável. |

Confirmar o envio grava o original e a tradução aprovada como uma única mensagem enviada. Editar a resposta invalida a prévia. Usar identificador de envio único para que repetição de clique ou requisição não duplique mensagens. Uma falha mantém o rascunho no painel.

### Identificadores e formatos de entrada propostos

| Operação | Entrada do serviço | Conteúdo fornecido ao modelo |
|---|---|---|
| Criar identidade | `product_id: UUID`, `source_revision: inteiro`, `source_snapshot: objeto`. | `name_pt`, `description_pt`, `category`, `attributes`, `origin`, `story_pt`, `differential_pt`, `positioning: lista`, `store_context: objeto` e `naming_preference: balanced` por padrão. |
| Interpretar consulta | `message_id: UUID`, `conversation_id: UUID`. O servidor resolve a versão e o histórico. | `original_text: texto`, `recent_messages: lista`, `published_snapshot: objeto`. |
| Traduzir resposta | `conversation_id: UUID`, `reply_revision: inteiro`, `approved_text_pt: texto`. | `approved_text_pt`, `target_language` determinado no servidor e `recent_messages: lista`. |

Para `content_zh`, usar `tagline`, `description`, `story` opcional e `highlights` com zero a três itens do tipo texto + lista de caminhos-fonte. Uma resposta inválida encerra a tentativa com erro de validação. Um conflito de revisão devolve a edição ao produtor. Indisponibilidade ou cota esgotada preservam o original e permitem tentar novamente. O substituto de testes fica identificado no ambiente de teste.

## Acessos, imagens e demonstração

- Cookie de gestão com atributos HttpOnly, Secure no ambiente HTTPS e SameSite. Armazenar somente o hash do segredo. Restringir leitura e escrita por loja no servidor e nas políticas do Supabase. Limpar o navegador pode impedir o retorno à gestão. Recuperação de conta fica para evolução posterior.
- O comprador usa um link privado de retorno restrito à sua conversa. Nome e empresa são opcionais. Validar origem das mutações, restringir tamanho e frequência das entradas e manter chaves de serviço e da IA no servidor.
- Validar os arquivos por conteúdo, tipo e tamanho configurados. Um erro no upload preserva os campos. Usar chaves de imagens imutáveis e autorizar a leitura de mídia conforme publicação ou sessão de gestão. Conservar fotos das versões históricas necessárias.
- Rotas propostas: `/meu-espaco` para o painel, `/zh/lojas/{loja}` e `/zh/lojas/{loja}/produtos/{produto}` para os dois QRs, acesso privado separado para o chat. A URL pública não contém segredo. Se todos os produtos forem retirados, a loja já compartilhada exibe catálogo vazio. **Implementado:** `/l/{código da loja}` (catálogo) e `/p/{código do produto}` (vitrine), códigos aleatórios de 10 caracteres atribuídos na primeira publicação e nunca trocados; a vitrine traz o retorno à loja. A loja ganha endereço e perfil público (cópia do produtor e da origem do snapshot publicado mais recente) na mesma transação da publicação. A ordem é gravada por `reorder_products`, com a lista completa dos produtos e a revisão do catálogo (`stores.catalog_revision`); repetir a mesma ordem não grava de novo, e reordenar não altera revisão, versão nem endereço dos produtos.
- Para contar conversas novas, registrar até qual mensagem recebida foi vista e contar conversas com entradas posteriores. Abrir uma conversa marca como lidas somente as entradas já exibidas. “Aguardando resposta” compara a última consulta com a última resposta enviada.
- Exemplo pré-cadastrado da banca com identificação própria. Para o extra, servir um catálogo estático separado sob `/zh/explorar`, com páginas de marcas fictícias, inclusive café e mel se desejado. A demonstração de descoberta dispensa tabela de marketplace e envio de consultas fictícias. **Implementado:** `/zh/explorar` (diretório), `/zh/explorar/{loja}` e `/zh/explorar/{loja}/{produto}`, pré-renderizados a partir de dados estáticos validados por Zod (`src/modules/explore`), com os mesmos `StoreCatalog` e `ProductShowcase` das vitrines reais. Três lojas fictícias (cachaça; café e mel como exemplos visuais), selo “虚构品牌 · 演示” em cada destino e botão de consulta desativado com o motivo. O link “探索更多巴西品牌” aparece no fim de `/l/{código}` e `/p/{código}` e leva a vitrine de origem em `?de=`, aceita só se for `/l/` ou `/p/` com código válido, para o diretório oferecer o retorno. Sem banco, sessão, conversa nem migração.

A sequência de entrega está em [produto.md](produto.md) e os testes de aceitação em [CLAUDE.md](CLAUDE.md).

