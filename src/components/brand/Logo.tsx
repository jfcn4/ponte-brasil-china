import Image from "next/image";
import Link from "next/link";

/** Marca BAQIAO: casa-pagode com globo e órbita (Brasil · 巴 + ponte · 桥). */
export function LogoMark({ tone = "dark", className = "h-8 w-auto" }: { tone?: "dark" | "light"; className?: string }) {
  const src = tone === "dark" ? "/brand/baqiao-marca.png" : "/brand/baqiao-marca-escura.png";
  return <Image src={src} alt="" width={306} height={267} aria-hidden="true" className={className} />;
}

/** Nome em caracteres latinos e chineses (BAQIAO 巴桥). */
export function LogoName({ tone = "dark", className = "h-8 w-auto" }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <Image
      src={tone === "dark" ? "/brand/baqiao-nome-clara.png" : "/brand/baqiao-nome-escura.png"}
      alt="BAQIAO 巴桥"
      width={315}
      height={126}
      className={className}
    />
  );
}

/** `tone="dark"`: fundo escuro (nome claro). `tone="light"`: fundo claro (nome escuro). */
export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md">
      <LogoMark tone={tone} className="h-11 w-auto" />
      <LogoName tone={tone} className="h-10 w-auto" />
    </Link>
  );
}
