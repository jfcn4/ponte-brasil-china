import Link from "next/link";
import { Globe } from "@/components/brand/Globe";
import { Logo } from "@/components/brand/Logo";

const STEPS = [
  {
    title: "Conte sobre sua cachaça",
    text: "Preencha uma única página em português, com fotos reais, características, origem e informações comerciais.",
  },
  {
    title: "Escolha seu nome em chinês",
    text: "Compare três propostas — fonética, semântica e equilibrada — com pinyin, significado e explicação em português.",
  },
  {
    title: "Publique e compartilhe",
    text: "Revise a vitrine em chinês antes de publicar. Compartilhe o QR da loja ou de cada produto.",
  },
  {
    title: "Responda no seu idioma",
    text: "Leia cada consulta traduzida, escreva em português e confirme a tradução antes de enviar.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-5 sm:px-6">
        <Logo />
        <nav aria-label="Principal" className="flex items-center gap-0.5 text-sm sm:gap-3">
          <a href="#como-funciona" className="whitespace-nowrap rounded-md px-2 py-2 text-mist hover:text-snow sm:px-3">
            Como funciona
          </a>
          <Link
            href="/meu-espaco/produtos"
            className="whitespace-nowrap rounded-md border border-line px-2.5 py-2 font-medium text-snow hover:border-coral sm:px-3"
          >
            Meu espaço
          </Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="hero">
          <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:pb-28 lg:pt-16">
            <div className="max-w-xl">
              <p className="mb-4 text-sm font-medium tracking-wide text-coral">Cachaça artesanal · Brasil → China</p>
              <h1 className="text-[2.15rem] font-semibold leading-[1.1] tracking-tight text-snow sm:text-5xl lg:text-[3.4rem]">
                Seu produto brasileiro. Seu próximo comprador, chinês.
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-mist">
                Crie sua vitrine em chinês e converse com compradores no seu idioma.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/meu-espaco/produtos/novo"
                  className="inline-flex min-h-12 items-center rounded-lg bg-brand px-6 text-base font-semibold text-white shadow-[0_0_30px_rgba(184,45,53,0.45)] transition-colors hover:bg-brand-strong"
                >
                  Criar minha vitrine
                </Link>
                <span className="text-sm text-mist">Sem cadastro de conta. Seu navegador guarda o acesso.</span>
              </div>
            </div>
          </div>

          <div className="hero-globe" aria-hidden="true">
            <div className="hero-globe-canvas">
              <Globe />
            </div>
          </div>
        </section>

        <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="border-t border-line/70 bg-panel/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-20">
            <h2 id="como-funciona-titulo" className="text-2xl font-semibold tracking-tight text-snow sm:text-3xl">
              Como funciona
            </h2>
            <p className="mt-2 max-w-2xl text-mist">
              Você informa os dados uma vez, em português. A decisão sobre o que publicar e o que responder continua com
              você.
            </p>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-xl border border-line bg-panel p-5">
                  <span className="text-sm font-semibold text-coral">{String(index + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 font-semibold text-snow">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist">{step.text}</p>
                </li>
              ))}
            </ol>
            <Link
              href="/meu-espaco/produtos/novo"
              className="mt-10 inline-flex min-h-12 items-center rounded-lg bg-brand px-6 font-semibold text-white hover:bg-brand-strong"
            >
              Criar minha vitrine
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-mist sm:px-6">
          <span>Ponte Global · demonstração para o desafio CITi</span>
          <span>Câmbio demonstrativo: BRL 1 = CNY 1,15</span>
        </div>
      </footer>
    </div>
  );
}
