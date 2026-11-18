/** Log estruturado: IDs, estado, revisão e duração. Nunca conteúdo do produtor nem segredos. */
export function logEvent(event: string, data: Record<string, string | number | boolean | null | undefined> = {}) {
  console.info(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
}
