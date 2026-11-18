# Ponte Global

A Ponte Global ajuda o produtor brasileiro a apresentar sua cachaça em chinês e conduzir a primeira conversa com um comprador. O produtor cadastra o que sabe sobre o produto, compara três identidades chinesas, aprova uma vitrine e compartilha um QR. O comprador pode conhecer toda a loja ou consultar um produto específico. A decisão sobre o que publicar e o que responder continua com o produtor.

**Estado do repositório:** primeira entrega da aplicação. Funcionam a página inicial, a sessão anônima do produtor, o cadastro em quatro seções com prévia, o rascunho com até três fotos no Supabase e “Meu espaço → Produtos”. Laboratório de nomes, publicação, QR e chat ficam para a próxima entrega.

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

O diretório de lojas fictícias é **extra**, após a validação desse fluxo. O marketplace real é **roadmap**. O cadastro e a geração de identidade do MVP atendem à cachaça.

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
| `npm test` | Unidade: câmbio e arredondamento, leitura do preço, formulário, contratos Zod, token de sessão, assinatura de imagem. |
| `npm run test:integration` | Contra o Supabase do `.env.local`: isolamento entre lojas, revisão obsoleta, limite de três fotos, ordem e bucket privado. Cria e remove as próprias lojas. |
| `npm run build` e `npm run test:e2e` | Playwright na compilação de produção: cadastro com foto, fechar e reabrir, edição, janela anônima isolada, quarta foto recusada e celular. Na primeira vez: `npx playwright install chromium`. |

### Deploy na Vercel

Importe o repositório como projeto Next.js e configure, em *Settings → Environment Variables*: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET` e `APP_URL` (endereço público do deploy). `DATABASE_URL` e as chaves Gemini não são necessárias nesta entrega; as migrações rodam a partir da máquina local. A Vercel usa Node 22 pelo campo `engines` do `package.json`.

### Configuração prevista para o ambiente

| Valor a documentar no futuro exemplo de ambiente | Uso |
|---|---|
| Origem pública da aplicação | Montar links permanentes e QRs que abram no celular da banca. |
| URL do projeto Supabase e acesso ao PostgreSQL de desenvolvimento | Conectar dados e aplicar migrações no ambiente correto. |
| Credenciais do servidor e nome do bucket de fotos | Autorizar a operação privada e salvar imagens. Manter a chave privilegiada fora do cliente. |
| Chave Gemini, identificador do modelo Flash e modo de IA | Alternar entre respostas determinísticas de teste e chamada real. Verificar cota e uma geração completa antes da apresentação. |

## Origem das decisões

O recorte começa na mensagem “vou reiniciar o projeto do zero. vamos definir todo o escopo e planejar o projeto”, logo após o mega prompt. Decisões posteriores sobre quatro seções, sessão anônima, loja, estratégias de nome e câmbio orientam a versão 2.0. O checkout antigo serve de referência e contingência. Os nomes de scripts, limites técnicos adicionais e detalhes de implementação neste pacote são propostas para o novo repositório. [Conversa de planejamento](https://chatgpt.com/share/6afd2184-3ad0-83e9-bd62-7661f05cdda0)
