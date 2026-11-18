# Instruções permanentes · Ponte Global

## Antes de alterar o projeto

Leia [produto.md](produto.md) para identificar a prioridade da entrega, [arquitetura.md](arquitetura.md) para os contratos e [design.md](design.md) para a tela afetada. O [README](README.md) define como executar e demonstrar o projeto. O trabalho parte de repositório novo. Preserve o projeto anterior como referência e contingência.

O MVP atende à cachaça artesanal do cadastro até a primeira resposta comercial. Conclua esse ciclo com dados novos antes dos extras. O diretório fictício, o cartão bilíngue e o estúdio de fotos por IA são extras. Marketplace real e categorias adicionais pertencem ao roadmap. Preserve essa classificação ao propor mudanças.

## Regras de implementação

1. Organize uma aplicação web única nos módulos Stores, Products, Messaging e AI. Valide as fronteiras com Zod e use tipos derivados do esquema sempre que possível. Preserve unidades, idiomas, nulabilidade, revisão e contrato dos dados persistidos ao alterar uma migração.
2. Centralize a regra **BRL 1 = CNY 1,15**. Use centavos inteiros para BRL, aritmética exata e duas casas na exibição. Grave a taxa usada no snapshot. Preserve o caso de preço ausente. Converta em uma única função usada pela prévia e pela publicação.
3. Preserve o original em português, a adaptação da IA e a versão aprovada em estruturas distintas. Restrinja a exposição pública aos campos aprovados. A seleção de uma sugestão, isoladamente, jamais publica ou envia conteúdo.
4. Gere a adaptação automaticamente ao concluir o cadastro válido. Valide as três estratégias, os vínculos com os fatos e a presença dos campos essenciais. A IA pode explicar linguagem e intenção. Valores técnicos ou comerciais são resolvidos a partir dos dados do produtor.
5. Verifique sessão, vínculo com a loja e propriedade do objeto em toda leitura privada e mutação. Guarde segredos apenas no servidor ou no cookie apropriado. O link privado do comprador autoriza uma única conversa. Nos logs, prefira IDs, estado, versão e duração.
6. Faça publicação e envio confirmado de forma atômica e repetível sem duplicar efeitos. Trabalhe com comparação de revisão. Guarde originais antes de chamar IA e revalide tradução quando o original mudar. Preserve o vínculo da conversa com a versão consultada.
7. Respeite as duas direções visuais. Use os mesmos componentes públicos na prévia e na vitrine. Mostre estados reais de carregamento, ausência, erro e recuperação. Mantenha a UI operável por teclado e em celular.
8. Mantenha testes de IA reproduzíveis com respostas de teste que cubram saídas válidas e inválidas. Para o ensaio da banca, verifique separadamente o serviço real, a cota e a qualidade do idioma. Identifique exemplos fictícios na própria experiência.
9. Ao mudar uma regra aprovada, atualize seus consumidores, os documentos afetados, o escopo em PDF e o teste de aceite correspondente. Registre qualquer desvio de escopo antes de tratá-lo como requisito.

## Comandos previstos

O pacote inicial contém apenas documentação. Estabeleça os scripts abaixo na fundação e fixe dependências e versões no repositório. Execute os testes contra ambiente descartável, com duas lojas, duas sessões de produtor, sessões de comprador e mídia de teste.

| Comando | Resultado exigido quando a aplicação existir |
|---|---|
| `npm ci` | Instalação reproduzível a partir do lockfile. |
| `npm run db:migrate` | Aplicação das migrações no banco indicado para o ambiente. |
| `npm run dev` | Aplicação local com endereço informado no terminal. |
| `npm run lint` e `npm run typecheck` | Análise estática e verificação dos tipos. |
| `npm test` | Testes unitários de regras, valores monetários, contratos e estados. |
| `npm run test:integration` | Testes de persistência, isolamento, armazenamento, falhas e concorrência. |
| `npm run test:e2e` | Jornadas completas em navegadores distintos. |
| `npm run build` | Compilação reproduzível para a demonstração. |

Ferramentas sugeridas: Vitest para unidade e integração e Playwright para os fluxos no navegador. A equipe fixa as versões na fundação. Executar testes independentes de cota com o adaptador de IA de teste; o ensaio com Gemini Flash usa a configuração real de servidor.

## Matriz de testes e resultados esperados

| ID | Nível e cenário | Resultado observável |
|---|---|---|
| T01 | Integração · dois produtores em navegadores distintos, acesso por QR público e link privado de outro comprador. | Cada produtor só lê/edita sua loja. Cada comprador retorna somente à própria conversa. QR público não concede gestão. |
| T02 | Fluxo · salvar cadastro incompleto, recarregar, concluir com uma foto e tentar incluir uma quarta. | Rascunho preservado e privado. Nome, descrição e uma foto permitem geração. Aceitar até três imagens. Identificar o produtor antes de publicar. |
| T03 | Contrato · três estratégias válidas, depois repetir estratégia, omitir pinyin ou retornar destaque sem campo de origem. | Só a resposta válida libera revisão. Recomendar equilíbrio com justificativa; permitir escolher qualquer opção ou manter o original. |
| T04 | Integração · editar durante a geração, simular falha de IA, repetir a tentativa e confirmar publicação duas vezes. | Preservar rascunho, descartar retorno obsoleto e manter uma só versão pública. Fotos e dados anteriores continuam íntegros. |
| T05 | Unidade e fluxo · preço ausente, zero, R$ 0,10, R$ 79,00 e edição para R$ 89,00. | Ausente mostra só cotação. Zero resulta em ¥0.00, R$ 0,10 em ¥0.12 e R$ 79 em ¥90.85. ¥102.35 só aparece após republicar. Taxa demonstrativa visível. |
| T06 | Fluxo · publicar duas cachaças, incluir rascunho, reordenar por teclado/celular e retirar o destaque. | Só publicadas entram na loja, na ordem persistida. Outro produto assume o destaque. Testar ambos os QRs em segundo aparelho e conferir destino após republicar. |
| T07 | Integração · consulta sobre 500 unidades em Xangai, com ficha de 700 mL e sem dados de entrega. Forçar falha de interpretação. | Guardar original primeiro. Tradução preserva números e unidades. Análise identifica quantidade e entrega, recupera só campos presentes e deixa frete/capacidade pendentes. |
| T08 | Fluxo · usar sugestão, editar em português, traduzir, alterar o texto outra vez e confirmar duas vezes. | Sugestão só preenche editor. Edição invalida tradução. Após nova revisão e confirmação, aparece uma única resposta em chinês. Repetir com mensagem em inglês e em pinyin: a resposta continua em chinês. |
| T09 | Integração · duas entradas numa conversa e uma em outra. Abrir a primeira enquanto chega nova entrada. | Badge conta conversas com novidades. Só as entradas exibidas são lidas. “Aguardando resposta” permanece distinto de “Nova”. |
| T10 | Integração · iniciar conversa na versão 1, publicar versão 2, retirar produto e retornar pelo link privado. | Conversa anterior recupera contexto da versão 1. Vitrine retirada não inicia nova consulta. Se a versão mudou entre visualização e primeira consulta, pedir nova revisão ao comprador. |
| T11 | Revisão manual · celular, desktop, teclado, ampliação, redução de movimento e falha de rede no upload. | Ações, campos, CTAs e nomes chineses legíveis, foco visível, alternativa ao arrastar e ao QR, conteúdo salvo e recuperação clara. |
| T12 | Extra · abrir “Explorar mais marcas brasileiras”, entrar em loja fictícia e em produto de exemplo. | Rotas navegáveis e identificadas em chinês. Nenhuma conversa, conta ou transação comercial é criada para as marcas fictícias. |

## Aceite da entrega

Para liberar o MVP, executar T01–T11 e o roteiro do README com dados inéditos, foto real, duas sessões e leitura de QR em celular. Revisar se a mensagem preserva quantidades, unidades, negativas e condicionais; a redação chinesa requer leitura humana. Registrar ambiente, versão da aplicação e evidência de cada falha ou aprovação. T12 pertence ao aceite do extra.

O exemplo pré-cadastrado ajuda a banca a explorar. A prova de funcionamento continua sendo cadastrar uma cachaça nova, receber uma consulta inédita e responder nos dois idiomas. Se o ciclo falhar ao final de 18/11/2026, aplicar o ponto de corte do [plano de entrega](produto.md) e concentrar o trabalho na correção.
