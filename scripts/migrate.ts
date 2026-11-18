/**
 * Aplica as migrações SQL de supabase/migrations em ordem, uma transação por
 * arquivo. Registra nome e checksum em ponte_meta.schema_migrations e recusa
 * continuar se uma migração já aplicada tiver sido alterada.
 *
 * Usa DATABASE_URL do ambiente ou de .env.local (o ambiente tem prioridade).
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL não definido. Configure a URI PostgreSQL em .env.local.");
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const host = new URL(url).hostname;
  try {
    await client.connect();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENETUNREACH" || code === "EHOSTUNREACH") {
      throw new Error(
        `Não foi possível alcançar ${host}. A conexão direta do Supabase usa IPv6; ` +
          "em redes só IPv4 use a URI do Session pooler (Supabase → Connect → Session pooler).",
      );
    }
    throw error;
  }

  try {
    await client.query(`
      create schema if not exists ponte_meta;
      create table if not exists ponte_meta.schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      );
    `);

    const applied = new Map<string, string>(
      (await client.query<{ name: string; checksum: string }>("select name, checksum from ponte_meta.schema_migrations"))
        .rows.map((row) => [row.name, row.checksum]),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    let count = 0;

    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.get(file);

      if (previous) {
        if (previous !== checksum) {
          throw new Error(`A migração ${file} já foi aplicada e mudou depois. Crie uma nova migração em vez de editá-la.`);
        }
        continue;
      }

      const started = Date.now();
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into ponte_meta.schema_migrations (name, checksum) values ($1, $2)", [file, checksum]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Falha em ${file}: ${(error as Error).message}`);
      }
      count += 1;
      console.log(`✓ ${file} (${Date.now() - started} ms)`);
    }

    console.log(count === 0 ? `Banco em ${host} já está atualizado.` : `${count} migração(ões) aplicada(s) em ${host}.`);
  } finally {
    await client.end();
  }
}

main().catch((error: Error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
