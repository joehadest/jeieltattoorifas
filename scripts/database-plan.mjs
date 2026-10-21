import { readFile } from 'node:fs/promises';

export const coreTables = ['admin_users', 'campaigns', 'orders', 'site_settings', 'tickets'];
export const tattooCampaignId = '00000000-0000-4000-a000-000000000004';

// Only remove the outer transaction statements, never PL/pgSQL function bodies.
export function transactionBody(source) {
  return source.replace(/^begin;[\t ]*\r?$/gmi, '').replace(/^commit;[\t ]*\r?$/gmi, '');
}

export async function databasePlan(tableNames) {
  const existing = coreTables.filter(name => tableNames.includes(name));
  if (existing.length && existing.length !== coreTables.length) {
    throw Object.assign(new Error('O banco contém uma estrutura parcial; nenhuma alteração foi feita.'), { code:'PARTIAL_SCHEMA' });
  }
  const files = existing.length ? [] : ['../supabase/migrations/202610200001_initial.sql'];
  files.push('../supabase/atualizar-jeiel-tattoo.sql');
  return {
    initialize: existing.length === 0,
    statements: await Promise.all(files.map(async file => transactionBody(await readFile(new URL(file,import.meta.url),'utf8')))),
  };
}
