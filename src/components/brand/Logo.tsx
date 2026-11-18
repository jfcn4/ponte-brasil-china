import Link from "next/link";

/** Marca: um arco ligando dois pontos, como a rota Brasil–China do globo. */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M6 21 C 10 7, 22 7, 26 13" fill="none" stroke="#ff8587" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="6" cy="21" r="2.6" fill="#b82d35" />
      <circle cx="26" cy="13" r="2.6" fill="#ff8587" />
    </svg>
  );
}

export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md font-semibold tracking-tight ${
        tone === "dark" ? "text-snow" : "text-ink"
      }`}
    >
      <LogoMark />
      <span className="text-base sm:text-[1.05rem]">Ponte Global</span>
    </Link>
  );
}
