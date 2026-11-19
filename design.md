# Design · Ponte Global

## Duas experiências, uma marca

A landing segue a direção **A**, com preto profundo, globo holográfico vermelho e uma linha de luz ligando Brasil e China. Cadastro, laboratório, painel e mensagens do produtor continuam escuros e discretos. A vitrine segue a direção **B**, editorial clara, com fundo branco suave, fotografia grande e detalhes em vermelho. A loja, a conversa do comprador e as páginas fictícias seguem essa direção clara. A prévia clara dentro da revisão escura permite ao produtor ver o que o comprador receberá.

O logotipo, a cor de ação e a hierarquia tipográfica ligam as duas experiências. Fotografias, história, posicionamento, nome escolhido e produto em destaque dão personalidade a cada loja. A edição do catálogo dispensa seletores de tema, fontes ou prompts.

## Referências de implementação propostas

| Elemento | Aplicação |
|---|---|
| Superfície | Preto profundo #151416 e painel #232124 na área do produtor. Marfim #FAF8F4 e texto #24201F na área pública. |
| Vermelho | #B82D35 no botão claro com texto branco. #FF8587 como acento legível no ambiente escuro. Reservar o brilho para o globo ou a rota. |
| Tipografia | Inter ou equivalente legível para navegação e formulários. Noto Sans SC como suporte aos hanzi e Noto Serif SC nos grandes títulos editoriais. Conferir fontes de sistema se os arquivos ainda não carregaram. |
| Fotografia | Uma imagem principal e até duas adicionais. Enquadrar a garrafa e preservar o rótulo. Miniaturas mantêm proporção e identificam a seleção. |
| Ritmo | Título, uma frase curta e ação principal por seção. Em tela larga, usar colunas para comparar ou acompanhar prévia. No celular, empilhar o conteúdo na ordem de leitura. |

As cores e famílias acima são escolhas para implementação. O contraste entre ambientes, o globo e o protagonismo das fotos foram definidos no planejamento.

## Mapa de telas e componentes

| Superfície | Conteúdo e ação principal | Comportamento |
|---|---|---|
| Início | Título “Seu produto brasileiro. Seu próximo comprador, chinês.” Subtítulo “Crie sua vitrine em chinês e converse com compradores no seu idioma.” CTA “Criar minha vitrine”. | Logotipo, “Como funciona” na mesma página e “Meu espaço” no cabeçalho. Texto à esquerda, globo à direita. No celular, texto e ação vêm primeiro. |
| Cadastro | Editor de produto em página única. Quatro seções e “Gerar apresentação chinesa” ao concluir. | Salvar progresso. Prévia ao lado no desktop, acionável no celular. Ausência de foto permite rascunho. Identificar dados públicos e privados. |
| Laboratório e revisão | Foto, nome brasileiro e três propostas explicáveis. Escolher, manter original, editar em português, visualizar e publicar. | Ao selecionar, atualizar título e eventual selo na prévia. A revisão mostra a própria vitrine com explicações em português. Publicar exige confirmação. |
| Meu espaço · Produtos | Miniatura de cada produto, nome, estado, “Editar”, “Visualizar”, link e QR quando publicado. “Novo produto” em destaque. | Arrastar para reordenar ou usar “Mover para cima/baixo”. Primeiro publicado em destaque no catálogo. |
| Meu espaço · Minha loja | Nome, região, história, apresentação chinesa aprovada, ordem do catálogo, link e QR da loja. Ação “Criar cartão para feira” (extra). | Deixar explícito o destino do QR. O QR do produto aparece junto ao produto. |
| Meu espaço · Mensagens | Lista de conversas com produto, última mensagem e estado. Badge com número de conversas com novidades. | No desktop, conversas abertas numa coluna estreita à esquerda, a conversa no centro e o copiloto compacto à direita; no celular, uma coisa por vez. Abrir marca como lidas as mensagens vistas. Mostrar “Aguardando resposta” à parte. Manter acesso pela navegação principal. |
| Loja chinesa | Nome do produtor, origem, introdução curta, foto maior do destaque e demais produtos. | Cada item traz foto, nome chinês ou marca original escolhida, característica breve e acesso à vitrine individual. |
| Vitrine do produto | Foto principal, galeria, nome escolhido, nome brasileiro, categoria e frase curta. Em seguida atributos rápidos, história breve, preço e cotação. | Omitir campos opcionais vazios. Mostrar até três destaques fundamentados. CTA vermelho “询价”. Enquanto o bloco de preço e cotação está abaixo da tela, um atalho fixo no rodapé leva a ele com o formulário aberto; some ao alcançar o bloco. A foto principal ocupa no máximo 60% da altura da tela, para o nome aparecer na primeira tela. Fotos mostram espera ao carregar e, se falharem, “图片加载失败 · 重新加载”. Disponibilizar retorno à loja. |
| Conversa do comprador | Produto consultado, histórico, identificação dos participantes, caixa de texto e enviar. | Só a mensagem é obrigatória. Nome e empresa são opcionais. Exibir link privado de retorno e atualizar o histórico periodicamente. |
| Cartão para feira · extra | Cartão claro (direção B) com nome do produtor, região, foto e nome do produto em destaque, chamada “扫码浏览我们的产品目录 · Aponte a câmera e conheça nosso catálogo”, QR da loja e endereço legível abaixo dele. “Imprimir ou salvar em PDF”. | Só dados publicados. Na impressão, uma folha A4, papel branco, sem cabeçalho, navegação nem botões do painel. Antes de imprimir, confirmar que a foto carregou e oferecer recarregar se falhar. Sem produto publicado, explicar o que falta em vez de gerar o cartão. |
| Explorar marcas · extra | Link discreto “探索更多巴西品牌” nas páginas chinesas, levando a lojas e fichas pré-configuradas. | Manter aviso visível “虚构品牌 · 演示” (marca fictícia · demonstração) em cada destino e explicar que a consulta comercial está indisponível. |

O exemplo pré-cadastrado para a banca também recebe identificação de demonstração: as lojas listadas em `DEMO_STORE_SLUGS` mostram o selo “演示店铺 · Loja de demonstração” no catálogo, na vitrine e na prévia de Minha loja. Quando o link público usa `localhost`, Link e QR e o cartão avisam que o QR só abre naquele computador. As vitrines criadas pelo produtor usam os dados e as fotos que ele fornecer.

## Cadastro em quatro seções

1. **Identidade.** Nome, marca, descrição curta, até três fotos reais e até duas características de personalidade. Tornar clara a foto principal. A categoria cachaça está definida no MVP.
2. **Características.** Tipo, volume (mL), teor alcoólico (%), madeira, envelhecimento (meses), aroma e sabor. Colocar a unidade junto ao campo editável.
3. **Origem e história.** Nome do produtor ou engenho, cidade, estado, região e história. “O que torna sua cachaça especial?” é opcional. Sinalizar a finalidade de qualquer contato privado.
4. **Informações comerciais.** Preço de referência em reais, pedido mínimo, disponibilidade e observações opcionais. Ao preencher o preço, mostrar o equivalente demonstrativo em CNY na prévia.

Oferecer geração quando houver nome, descrição e pelo menos uma foto. Ao concluir, a ficha é gerada automaticamente para revisão. Mostrar “Salvando”, “Rascunho salvo” ou erro com ação de recuperação conforme a persistência real.

## Laboratório de identidade

As três opções têm o mesmo peso visual para que o produtor possa compará-las. Em cada uma, mostrar a estratégia, hanzi em destaque, pinyin e uma linha de significado. Abrir os detalhes para ler a justificativa, a relação com a personalidade, o que a opção preserva ou perde, estética, pronúncia, memorabilidade e ambiguidades identificadas. A recomendação equilibrada explica seu motivo em português. Evitar notas percentuais de adequação ou garantia de registro de marca.

O nome brasileiro permanece reconhecível. Se o produtor o mantiver como título, a descrição chinesa da categoria permite ao comprador entender o produto. O selo inspirado no 印章 é um detalhe opcional ao lado da escrita legível. A seleção não publica a vitrine. Para corrigir a origem ou a descrição, editar a fonte em português e retornar à prévia atualizada.

## Composição da vitrine e preço

Usar a sequência foto → identidade → atributos → história → contato. A categoria pode aparecer como “卡沙萨 · 巴西甘蔗蒸馏酒”, distinta do nome comercial. Quando houver informação de origem e história, usar um parágrafo curto. O botão de consulta fica acessível sem cobrir texto ou fotos. A superfície de compartilhamento de QR é o painel do produtor.

| Situação | Texto visível proposto |
|---|---|
| R$ 79,00 aprovado | **参考价格 ¥90.85** em destaque, “BRL 79.00” em corpo secundário. |
| Aviso junto ao preço | “演示汇率：1 巴西雷亚尔 = 1.15 元人民币。最终价格以报价为准。” Explica a taxa de demonstração e que o preço final depende de cotação. |
| Preço ausente | Mostrar apenas a ação comercial “询价” na área de preço e contato. |
| Produto retirado | Informar indisponibilidade e oferecer retorno à loja. Preservar o endereço para eventual republicação. |

## Conversa e copiloto

No painel, abrir com a tradução em português. “Ver original” revela o texto do comprador. O copiloto é discreto: síntese de uma ou duas frases, pendências em etiquetas e a análise recolhida, que responde a quatro perguntas: o que foi pedido, quais dados existem, o que falta e qual próximo passo faz sentido. Mostrar nota cultural somente quando específica à mensagem. A sugestão de resposta fica junto do editor, no quadro “Sugestão do copiloto”, com a ação “Usar resposta sugerida” e a nota de que ela só copia o texto para o editor e nada é enviado. Quem preferir pode escrever do zero. A resposta segue três passos numerados: ① “Sua resposta em português”, ② “Revisar tradução” (prévia do texto exato, com botão para gerar na hora) e ③ “Confirmar envio”, que explica por que está desativado enquanto não há prévia. Ao abrir uma conversa longa, a tela começa pela última entrada do comprador, com o editor logo abaixo; depois da resposta, as pendências do copiloto passam a “Pontos da última consulta (já respondida)”. Fora de Mensagens, uma faixa no topo do painel avisa que há mensagem nova e leva à aba.

A prévia da tradução aparece sozinha logo abaixo do editor quando o produtor para de digitar; “Confirmar envio” só fica ativo com a prévia do texto exato e é o ato final (também por Ctrl + Enter). Editar o original desativa o envio na hora e gera nova prévia. Em falha da IA, o texto fica salvo e “Tentar novamente” repete a tradução. No lado do comprador, manter a conversa clara, com mensagens já enviadas no idioma correspondente, sem as análises privadas do produtor.

## Estados e acessibilidade

- **Vazio:** Produtos oferece “Criar primeiro produto”; Mensagens explica que consultas chegarão após o compartilhamento. Loja publicada sem itens exibe indicação de catálogo vazio.
- **Processamento:** descrever a operação real em andamento. Em geração ou tradução, permitir preservar o trabalho e impedir envio repetido. Em falha de upload, manter campos preenchidos. Em falha da IA, manter texto original ou rascunho e oferecer “Tentar novamente”.
- **Revisão:** distinguir “Publicado” de “Alterações pendentes” com texto. Mostrar a versão em edição na prévia e fornecer acesso à versão em circulação.
- **Celular:** priorizar leitura após escanear QR, alvo de toque confortável e navegação de volta. O botão de cotação e o teclado do chat devem coexistir sem ocultar a mensagem. Desktop pode mostrar lista e conversa lado a lado.
- **Acesso por teclado e leitor de tela:** rotular campos, galeria, controles de ordem e QRs; fornecer link copiável equivalente. Associar erros ao campo, anunciar estado da geração, expor seleção e mensagens novas e restaurar foco após prévia ou confirmação.
- **Legibilidade:** testar contraste, foco, ampliação, acentos, caracteres chineses e pinyin com marcas tonais. Identificar trechos em pt-BR e zh-Hans. Respeitar redução de movimento e oferecer globo estático em aparelhos mais fracos. O carregamento do globo não bloqueia o CTA.

O roteiro de validação está em [CLAUDE.md](CLAUDE.md). As fontes dos números e da versão exibida estão em [arquitetura.md](arquitetura.md).
