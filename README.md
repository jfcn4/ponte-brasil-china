# Ponte Global

A Ponte Global ajuda o produtor brasileiro a apresentar sua cachaça em chinês e conduzir a primeira conversa com um comprador. O produtor cadastra o que sabe sobre o produto, compara três identidades chinesas, aprova uma vitrine e compartilha um QR. O comprador pode conhecer toda a loja ou consultar um produto específico. A decisão sobre o que publicar e o que responder continua com o produtor.

**Estado do repositório:** quarta entrega. Funcionam a página inicial, a sessão anônima do produtor, o cadastro em quatro seções com prévia, o rascunho com até três fotos, “Meu espaço → Produtos”, a geração das três identidades chinesas pelo Gemini (servidor), a revisão com prévia da vitrine, a publicação confirmada com link público estável (`/p/<código>`) e QR individual, a republicação após edição e **a conversa comercial de um produto**: “询价 · Solicitar cotação” na vitrine, sem conta, com link privado de retorno (`/conversa#t=<segredo>`); “Meu espaço → Mensagens” com contador de conversas novas, tradução em português, original, copiloto com pendências e resposta sugerida; resposta em português com revisão da tradução e confirmação de envio única. **Loja com vários produtos:** catálogo público em chinês (`/l/<código>`) com um único QR, só com os produtos publicados, na ordem salva no painel e com o primeiro publicado em destaque; “Meu espaço → Minha loja” com produtor, região, apresentação chinesa aprovada, prévia do catálogo, link copiável e QR da loja; “Mover para cima/baixo” em Produtos (teclado e celular). O endereço da loja e os QRs individuais não mudam ao reordenar, editar ou republicar. A retirada pelo painel fica para a próxima rodada. **Extras:** diretório de marcas fictícias (`/zh/explorar`) e **Modo Feira**: em “Minha loja”, **Criar cartão para feira** gera um cartão bilíngue imprimível com o QR da loja.

## Por onde começar

| Se você precisa de… | Abra |
|---|---|
| Escopo para apresentar à equipe ou à banca | [Escopo consolidado em PDF](Escopo_Ponte_Global_2.0.pdf) |
| Público, jornadas, prioridades, entregas e critérios de aceite | [produto.md](produto.md) |
| Arquitetura, entidades, publicação e contratos de IA | [arquitetura.md](arquitetura.md) |
| Telas, linguagem, componentes e estados de interface | [design.md](design.md) |
| Regras de desenvolvimento, comandos e verificação de entrega | [CLAUDE.md](CLAUDE.md) |

Extraia o pacote na raiz do repositório, mantendo os seis arquivos juntos para preservar os links. Para consultar o material, abra o PDF ou qualquer Markdown em um leitor local.

## O que demonstrar

1. Cadastre duas cachaças com nome, descrição e ao menos uma foto real de cada, na mesma loja. Um pode ter preço de R$ 79,00 e o outro, preço sob consulta.
2. Gere as opções fonética, semântica e equilibrada. Escolha um nome, confira a prévia e publique cada produto.
3. Mude a ordem no painel e abra o QR da loja em outro navegador. O primeiro produto publicado na ordem escolhida ocupa o destaque. O QR individual abre a vitrine correspondente.
4. Confira o preço de referência de **CNY 90,85** para R$ 79,00. A regra demonstrativa é **BRL 1 = CNY 1,15**. No produto sem preço, use “Solicitar cotação”.
5. Envie uma pergunta como comprador. No painel, abra a conversa, ajuste a sugestão do copiloto em português, revise a tradução e confirme o envio. Confira a resposta no acesso privado do comprador.
6. Edite o primeiro preço para R$ 89,00. A vitrine mantém CNY 90,85 até a nova publicação e passa então a CNY 102,35. A conversa anterior continua associada à versão que originou a pergunta.

O diretório de lojas fictícias e o cartão do Modo Feira são **extras**, após a validação desse fluxo. O marketplace real é **roadmap**. O cadastro e a geração de identidade do MVP atendem à cachaça.

## Como executar

Requisitos: Node.js 22 (`.nvmrc`) e npm 9 ou mais recente. O `.env.local` segue o `.env.example`.

```bash
npm ci
npm run db:migrate   # aplica supabase/migrations no banco de DATABASE_URL
npm run dev          # http://localhost:3000
```

O `DATABASE_URL` só é usado pelas migrações. A conexão direta do Supabase (`db.<projeto>.supabase.co`) usa apenas IPv6; em redes só IPv4, use a URI do **Session pooler** (Supabase → Connect → Session pooler). A aplicação em si usa só a URL do projeto e a chave secreta, pelo servidor.

| Comando | O que verifica |
|---|---|
| `npm run lint` e `npm run typecheck` | Análise estática e tipos (inclui os tipos de rota gerados pelo Next). |
| `npm test` | Unidade: câmbio e arredondamento, leitura do preço, formulário, contrato da IA (estratégia repetida, pinyin ausente, destaque sem fonte, idioma e números inventados), snapshot publicado, token de sessão, assinatura de imagem. Mensagens: idioma pela escrita, números preservados (algarismos, numerais chineses, meses), fatos citados só se existem na versão, pendências de quantidade e frete, alertas de negativa e condição. |
| `npm run test:integration` | Contra o Supabase do `.env.local`, com o adaptador de IA de teste: isolamento entre lojas, revisão obsoleta, limite de três fotos, geração com falha e repetição, geração simultânea, publicação dupla sem duplicar versão, preço ¥90.85 → ¥102.35 só após republicar, foto preservada na versão publicada. Mensagens (T01, T07–T10): original salvo antes da IA, falha e repetição da interpretação, edição invalida a tradução, retorno obsoleto descartado, envio confirmado duas vezes em paralelo sem duplicar, resposta sempre em chinês (pergunta em inglês ou pinyin, e conversa antiga gravada em inglês), badge e leitura só do que foi exibido, conversa presa à versão 1 após republicar, vitrine retirada recusa nova consulta, isolamento entre lojas e entre links privados. Loja (T06): catálogo só com publicados, rascunho fora, destaque = primeiro publicado, reordenação com comparação de revisão (repetição idempotente, lista incompleta ou de outra loja recusada), endereços estáveis após reordenar e republicar, apresentação da loja só com aprovação, consulta aberta pelo catálogo vinculada ao produto certo. Cria e remove as próprias lojas. |
| `npm run build` e `npm run test:e2e` | Playwright na compilação de produção (com `AI_MODE=test`): cadastro com foto, isolamento, quarta foto recusada, celular, o aceite da publicação (gerar, escolher, publicar, abrir o link em contexto de celular, editar preço e republicar no mesmo link) e o aceite da conversa em dois navegadores (comprador em contexto Pixel 7 pergunta sobre 500 garrafas e Xangai; produtor lê tradução e pendências, usa a sugestão, edita, revisa a tradução e confirma; o link privado mostra uma única resposta em chinês), o diretório fictício e o cartão do Modo Feira (PDF de uma página, QR da loja, vitrine e cotação no celular). Na primeira vez: `npx playwright install chromium`. |

### Deploy na Vercel

Importe o repositório como projeto Next.js e configure, em *Settings → Environment Variables* (Production e Preview):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` | Os mesmos do `.env.local`. |
| `GEMINI_API_KEY` | Chave do Google AI Studio. Fica só no servidor. |
| `GEMINI_MODEL` | Identificador do modelo Flash (o `.env.local` usa `gemini-3.5-flash-lite`, que também é o padrão). |
| `GEMINI_FALLBACK_MODEL` | Opcional. Modelos reserva separados por vírgula; vazio usa `gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3-flash-preview`. Quando o principal responde 503 (sobrecarga, frequente em horário de pico), 429 ou demora mais de 10–14 s, o servidor chama o próximo modelo e fica com a primeira resposta válida, sempre dentro dos 60 s da função. `off` desliga. |
| `APP_URL` | Opcional. Endereço público do deploy, sem barra final (neste projeto, `https://ponte-brasil-china.vercel.app`). É o endereço gravado nos links e QRs. **Não copie o valor do `.env.local`** (`localhost` não abre no celular; na Vercel ele é ignorado). Sem `APP_URL`, a aplicação usa o domínio de produção da Vercel, o que basta aqui. |
| `AI_MODE` | Não defina em produção (o padrão é `gemini`). `test` usa respostas fixas, identificadas na tela como teste. |
| `DEMO_STORE_SLUGS` | Opcional. Códigos das lojas de demonstração da banca (o trecho depois de `/l/`), separados por vírgula. O catálogo, as vitrines e a prévia de **Minha loja** dessas lojas mostram o selo **演示店铺 · Loja de demonstração**; consultas e respostas funcionam normalmente. Exige novo deploy para valer. |

`DATABASE_URL` não é necessária na Vercel: a migração roda a partir da máquina local. Aplique-a no banco usado pela Vercel **antes de publicar o código novo** (push na `main`); as migrações só acrescentam estruturas, então a versão que está no ar continua funcionando. Esta entrega traz `0005_store_catalog.sql`: endereço estável e perfil aprovado da loja, apresentação chinesa da loja, revisão da ordem do catálogo (`reorder_products`) e a abertura da loja dentro de `publish_presentation` (mesma assinatura). Lojas que já tinham produto publicado recebem o endereço na própria migração. Se o banco já estiver atualizado, `npm run db:migrate` apenas informa isso. As rotas de geração, consulta, interpretação e tradução declaram até 60 s de execução; a interpretação da pergunta roda depois da resposta ao comprador (`after()`), e o painel atualiza sozinho a cada 8 s. A Vercel usa Node 22 pelo campo `engines` do `package.json`.

### Como conferir a publicação na Vercel

1. No celular ou no computador, abra o deploy → **Meu espaço → Produtos** e abra um rascunho com nome, descrição, foto, nome do produtor e preço **79,00**.
2. Clique em **Gerar apresentação chinesa**. Em 5 a 30 s aparecem as opções fonética, semântica e equilibrada, com a recomendação justificada. Se aparecer erro, o rascunho continua intacto e **Tentar novamente** repete a geração.
3. Escolha um nome. A prévia à direita (abaixo, no celular) mostra a foto real, o nome e **参考价格 ¥90.85 / BRL 79.00**. Clique em **Publicar vitrine** e depois em **Confirmar publicação**.
4. Em **Link e QR do produto**, escaneie o QR com outro aparelho. A vitrine abre sem login, com a mesma foto, o nome aprovado e ¥90.85.
5. Volte ao cadastro, mude o preço para **89,00** e espere “Rascunho salvo”. Recarregue a vitrine no outro aparelho: continua **¥90.85**. O painel mostra “Alterações pendentes”.
6. Clique em **Revisar apresentação e republicar** → **Republicar vitrine** → **Confirmar publicação**. Recarregue o mesmo link: agora **¥102.35 / BRL 89.00**.

### Como conferir a conversa na Vercel (dois aparelhos)

Use um produto publicado com volume **700 mL** e preço **79,00** (passos acima). O comprador não precisa de conta; o produtor usa o navegador onde publicou.

1. **Celular (comprador):** escaneie o QR do produto em *Link e QR do produto*. Na vitrine, toque em **询价 · Solicitar cotação** (fica fixo no rodapé enquanto a ficha é lida e leva ao formulário já aberto), escreva uma pergunta nova, por exemplo `你好，我是上海一家酒类进口公司的采购。我们想先订500瓶，请问能在明年一月前送到上海吗？如果可以，请报一下价格。`, e toque em **发送询价**. Abre a página **询价对话** com o **私密链接**: copie-o ou salve-o (o segredo fica depois de `#t=`).
2. **Computador (produtor):** abra **Meu espaço**. A aba **Mensagens** mostra o número de conversas com novidades. A conversa aparece como **Nova** e **Aguardando resposta**. Em 5 a 30 s surge a tradução em português; **Ver original** mostra o chinês.
3. Confira o **Copiloto** (à direita no desktop): resumo, etiquetas **Capacidade de produção** e **Frete e prazo**, e **Ver análise** com os dados da ficha da versão consultada. No quadro **Sugestão do copiloto** acima do editor, **Usar resposta sugerida** só copia o texto para o editor (o quadro diz isso); recarregue o celular e confirme que nada chegou.
4. **① Sua resposta em português:** ajuste o texto (ex.: “Obrigado! Cada garrafa tem 700 mL. Vou confirmar a produção de 500 garrafas até janeiro e o frete até Xangai. O preço não inclui impostos de importação.”). **② Revisar tradução:** ao parar de digitar, a prévia em chinês aparece sozinha (o botão **Revisar tradução** gera na hora). Confira números, unidades e a negativa. Editar de novo desativa o envio até a nova prévia chegar.
5. **③ Confirmar envio:** só fica ativo com a prévia do texto atual e envia exatamente essa tradução, uma vez. Se a IA falhar em qualquer etapa, o texto continua no editor e **Tentar novamente** repete sem duplicar.
6. **Celular:** abra o link privado salvo (ou volte à vitrine e toque em **继续之前的对话**). Deve aparecer **uma única** resposta, em chinês, sem nenhuma análise do produtor. A resposta sai em chinês mesmo quando o comprador escreve em inglês ou pinyin.

### Como conferir a loja com vários produtos na Vercel

1. **Computador (produtor):** publique duas cachaças (passos de *Como conferir a publicação*) e deixe uma terceira como rascunho (nome e descrição, sem publicar). Na confirmação da primeira publicação, mantenha marcado **Aprovar como apresentação da loja** para ver o texto chinês no topo do catálogo.
2. Abra **Meu espaço → Minha loja**: produtor, região e apresentação chinesa aprovada (com o sentido em português), **Destaque da loja**, a prévia do catálogo e **Link e QR da loja**. Anote o link (`…/l/<código>`).
3. **Celular (comprador):** escaneie o QR da loja. Devem aparecer só as duas publicadas; o rascunho não aparece. A primeira na ordem fica em **精选推荐**.
4. **Computador:** em **Produtos**, use **Mover para cima** na segunda cachaça publicada (ou Tab até o botão e Enter). A mensagem “Ordem salva… Destaque da loja: …” confirma a gravação, e o selo **Destaque da loja** muda de produto. Recarregue Produtos: a ordem continua.
5. **Celular:** atualize a página da loja (mesmo endereço). O novo primeiro publicado ocupa o destaque. Os QRs individuais já impressos continuam abrindo as mesmas vitrines.
6. **Celular:** toque na outra cachaça (em **更多产品**). A vitrine mostra **← 返回店铺** e o produto certo. Toque em **询价 · Solicitar cotação**, envie uma pergunta nova e salve o link privado.
7. **Computador:** em **Mensagens**, a conversa nova aparece com o nome chinês **e o nome brasileiro do produto consultado** (o segundo, não o destaque). Responda como no roteiro da conversa.

Nos logs da função (Vercel → *Logs*), `store.reordered` registra loja, quantidade e revisão de cada reordenação; `store.intro_approved` registra a aprovação da apresentação.

Nos logs da função (Vercel → *Logs*), procure `ai.call` (`op` = `identity`, `interpret` ou `translate`) para ver modelo, tentativa, estado e duração de cada geração, sem conteúdo do produtor. A tabela `ai_calls` guarda em `detail` a trilha do rodízio (ex.: `gemini-3.5-flash-lite:http_503 > gemini-3.1-flash-lite:ok`). Se a análise de uma consulta falhar por instabilidade, o painel repete sozinho uma vez ao abrir a conversa; depois disso, **Tentar novamente** fica com o produtor.

### Como conferir o diretório de marcas fictícias na Vercel (extra)

Não há migração nem variável nova: as páginas são estáticas. Use uma loja real já publicada (roteiro acima).

1. **Celular:** escaneie o QR da loja real. No fim da página, depois dos produtos, toque em **探索更多巴西品牌**. A loja real não mostra nenhum selo de demonstração.
2. O diretório (`…/zh/explorar`) lista três lojas, cada uma com o selo **虚构品牌 · 演示**: um alambique de cachaça, um café e um apiário.
3. Toque em **Alambique Vale Sereno**. O catálogo mostra o selo no topo e em cada produto; o convite é **查看详情**, sem “询价”.
4. Abra **静谷·琥珀**. A ficha mostra o selo acima do nome, **参考价格 ¥148.35 / BRL 129.00** (mesma regra de câmbio) e o botão **询价 · Solicitar cotação** desativado, com o aviso de que não é possível consultar.
5. Toque em **返回品牌目录** e, no diretório, em **← 返回之前浏览的真实店铺**. Volta à loja real do passo 1.
6. Abra um produto real, toque em **询价 · Solicitar cotação** e envie uma pergunta. Abre o **询价对话** como antes, e a conversa aparece em **Mensagens** no computador.

### Como conferir o cartão para feira (Modo Feira, extra)

Não há migração nem variável nova. Use a loja com duas cachaças publicadas (e, se quiser, um rascunho) do roteiro *loja com vários produtos*.

1. **Computador (produtor):** em **Meu espaço → Minha loja**, na seção **Modo Feira**, clique em **Criar cartão para feira**. A prévia mostra o nome do produtor, a região, a foto e o nome do produto em destaque (o primeiro publicado), a chamada **扫码浏览我们的产品目录 · Aponte a câmera e conheça nosso catálogo**, o QR e, abaixo dele, o endereço sem `https://` (ex.: `ponte-brasil-china.vercel.app/l/<código>`). Confira que é o mesmo endereço de **Link e QR da loja** e que nada do rascunho aparece.
2. Clique em **Imprimir ou salvar em PDF**. Na janela do navegador, escolha **Salvar como PDF** (ou a impressora), papel A4. A visualização deve ter **uma página**, com o cartão em fundo branco e sem cabeçalho, abas ou botões do painel.
3. **Celular (comprador):** abra o PDF na tela do computador (ou a folha impressa) e escaneie o QR com a câmera. Deve abrir `…/l/<código>` na Vercel: o catálogo com as duas cachaças, sem o rascunho. Se preferir, digite o endereço impresso abaixo do QR.
4. **Celular:** toque numa cachaça, confira a vitrine e toque em **询价 · Solicitar cotação**; envie uma pergunta (ex.: `你好，我们在展会上看到你们的名片。请问300瓶的价格是多少？`). Abre o **询价对话**, e a conversa aparece em **Mensagens** no computador com o produto certo.
5. Reordene em **Produtos** e recarregue o cartão: o destaque muda, o QR e o endereço continuam iguais (um cartão já impresso segue válido).

Automático (T13, com `AI_MODE=test` na compilação de produção): `npx playwright test tests/e2e/cartao-feira.spec.ts`. O teste publica duas cachaças e um rascunho, confere o cartão, verifica que o QR é o mesmo de Minha loja e codifica exatamente o endereço da loja, gera o PDF com a mídia de impressão (uma página A4, sem painel), salvo em `test-results/cartao-feira/cartao-feira.pdf`, e no contexto Pixel 7 abre o endereço, entra na vitrine do segundo produto e envia uma cotação.

### Ensaio automático com a IA real

`tests/ensaio/jornada.spec.ts` percorre a jornada da banca com o Gemini real, em três navegadores isolados (produtor A no desktop, comprador num Pixel 7, produtor B): duas cachaças com foto geradas e publicadas e um rascunho; catálogo e QRs no outro navegador; reordenação e destaque; ¥90.85 → ¥102.35 só após republicar no mesmo link; consulta em chinês sobre 500 garrafas e Xangai, tradução, copiloto, sugestão, resposta revisada e confirmação em clique duplo, com uma única resposta em chinês no link privado; tentativas da sessão B de editar, gerar, publicar e ler conversa da loja A; isolamento entre links privados. Gasta cerca de 8 chamadas de IA e remove as lojas criadas ao final.

```bash
ENSAIO_URL=http://localhost:3000 npx playwright test -c playwright.ensaio.config.ts
```

`ENSAIO_URL` pode apontar para a Vercel; a limpeza usa o Supabase do `.env.local`. Para ensaiar também a falha da IA (etapa 5b), suba uma segunda instância com modelos inexistentes e informe `ENSAIO_FALHA_URL`:

```bash
npm run build && GEMINI_MODEL=modelo-inexistente GEMINI_FALLBACK_MODEL=reserva-inexistente APP_URL=http://localhost:3101 npx next start -p 3101
```

### Configuração prevista para o ambiente

| Valor a documentar no futuro exemplo de ambiente | Uso |
|---|---|
| Origem pública da aplicação | Montar links permanentes e QRs que abram no celular da banca. |
| URL do projeto Supabase e acesso ao PostgreSQL de desenvolvimento | Conectar dados e aplicar migrações no ambiente correto. |
| Credenciais do servidor e nome do bucket de fotos | Autorizar a operação privada e salvar imagens. Manter a chave privilegiada fora do cliente. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` e `AI_MODE` | Alternar entre respostas determinísticas de teste e chamada real. Verificar cota e uma geração completa antes da apresentação. |

## Roteiro de cinco minutos para a banca

Antes: deploy na Vercel com a migração aplicada, `GEMINI_API_KEY` válida, uma loja de demonstração criada **no próprio deploy e no navegador que será usado na apresentação** (a gestão fica no cookie daquele navegador), com o produtor identificado como demonstração (ex.: “Alambique Ipê · Demonstração Ponte Global”) e o código listado em `DEMO_STORE_SLUGS`, o cartão do Modo Feira impresso ou aberto em PDF, e uma foto real de garrafa no computador. Use dois aparelhos: o computador (produtor) e um celular (comprador).

| Tempo | Tela | O que mostrar |
|---|---|---|
| 0:00–0:30 | Início (`/`) | A proposta em uma frase e **Criar minha vitrine**. |
| 0:30–1:30 | Cadastro → Apresentação em chinês | Cachaça **inédita**: nome, descrição curta, uma foto real, produtor, 700 mL e R$ 79,00. **Gerar apresentação chinesa**: as três estratégias, a recomendação equilibrada com justificativa e os textos com o sentido em português. Destacar que preço, volume e teor vêm do cadastro, não da IA. |
| 1:30–2:00 | Publicar → Link e QR do produto | **Publicar vitrine** → **Confirmar publicação**. A prévia mostra **¥90.85 / BRL 79.00** e a taxa demonstrativa. |
| 2:00–2:40 | Minha loja → Cartão para feira → celular | Mostrar o cartão bilíngue (ou o PDF já impresso), escanear o QR com o celular: catálogo em chinês com o selo de demonstração (loja da banca) ou a loja recém-criada. Tocar no produto: foto, nome, ficha e o botão **询价 · Solicitar cotação** fixo no rodapé. |
| 2:40–3:20 | Vitrine → 询价对话 (celular) | Enviar uma pergunta nova, por exemplo `你好，我们是上海的进口商。如果订500瓶，明年三月前能送到上海吗？请报价。`. Mostrar o **私密链接** e o aviso de que a resposta aparece após a confirmação do produtor. |
| 3:20–4:30 | Meu espaço → Mensagens (computador) | O aviso “Um comprador mandou mensagem nova” e o contador em **Mensagens**. Abrir a conversa: tradução em português, **Ver original**, copiloto com **Capacidade de produção** e **Frete e prazo**. **Usar resposta sugerida** (só preenche o editor), ajustar em português com quantidade, unidade e uma negativa (“o frete não está incluído”). **② Revisar tradução**: conferir os números no chinês. **③ Confirmar envio**. |
| 4:30–5:00 | 询价对话 (celular) | Recarregar o link privado: uma única resposta, em chinês, com o original em português recolhido. Fechar com o que é extra (cartão, diretório **探索更多巴西品牌**) e o que é roadmap. |

Se a IA demorar ou falhar ao vivo, mostrar que o texto continua salvo e usar **Tentar novamente**; a conversa já respondida na loja de demonstração serve de apoio.

### O que ainda conferir manualmente na Vercel

1. **Configuração:** `GEMINI_API_KEY`, `GEMINI_MODEL` e as chaves do Supabase em *Production*; `AI_MODE` ausente; `APP_URL` vazio ou com o domínio público (nunca `localhost`). Em **Link e QR**, nenhum aviso amarelo de `localhost`.
2. **Selo de demonstração:** definir `DEMO_STORE_SLUGS` com o código da loja da banca, fazer novo deploy e conferir **演示店铺 · Loja de demonstração** no catálogo e na vitrine, e a nota em **Minha loja**. Lojas novas não recebem o selo.
3. **Cota e latência do Gemini** no horário da apresentação: uma geração completa e uma tradução, conferindo `ai.call` nos logs (modelo, tentativa, duração).
4. **QR em celular real** (câmera nativa, 4G e Wi‑Fi): catálogo, vitrine, fotos carregando e botão de cotação visível na primeira tela.
5. **Leitura humana do chinês** da vitrine e da resposta: nomes de lugar (Minas Gerais → 米纳斯吉拉斯州, nunca 矿山), madeira, números e negativas. O Gemini Flash‑Lite varia entre gerações; se algo sair errado, **Gerar novas opções** antes de publicar.
6. **Impressão do cartão** em A4 numa página e leitura do QR impresso.
7. **Dois navegadores**: o produtor não vê a loja de outra sessão, e o link privado do comprador abre só a própria conversa.

## Origem das decisões

O recorte começa na mensagem “vou reiniciar o projeto do zero. vamos definir todo o escopo e planejar o projeto”, logo após o mega prompt. Decisões posteriores sobre quatro seções, sessão anônima, loja, estratégias de nome e câmbio orientam a versão 2.0. O checkout antigo serve de referência e contingência. Os nomes de scripts, limites técnicos adicionais e detalhes de implementação neste pacote são propostas para o novo repositório. [Conversa de planejamento](https://chatgpt.com/share/6afd2184-3ad0-83e9-bd62-7661f05cdda0)
