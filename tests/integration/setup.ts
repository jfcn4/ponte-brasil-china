import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_STORAGE_BUCKET"]) {
  if (!process.env[name]) throw new Error(`Integração requer ${name} em .env.local`);
}
