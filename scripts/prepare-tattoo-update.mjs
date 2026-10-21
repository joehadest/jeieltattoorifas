import { readFile, writeFile } from 'node:fs/promises';
import { defaultAppearance } from '../src/lib/appearance.ts';

// This file can be pasted into the Supabase SQL Editor once. All work is
// enclosed in one transaction; previously edited settings and campaigns stay intact.
const migration = await readFile(new URL('../supabase/migrations/202610200002_number_start.sql', import.meta.url), 'utf8');
const appearance = await readFile(new URL('../supabase/migrations/202610200003_site_appearance.sql', import.meta.url), 'utf8');
const draft = await readFile(new URL('../supabase/jeiel-tattoo-draft.sql', import.meta.url), 'utf8');
const accounts = await readFile(new URL('../supabase/migrations/202610200004_customer_accounts.sql', import.meta.url),'utf8');
const draws = await readFile(new URL('../supabase/migrations/202610200005_draws.sql', import.meta.url),'utf8');
const payments = await readFile(new URL('../supabase/migrations/202610210006_payment_tracking.sql', import.meta.url),'utf8');
const body = source => source.replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'');
const appearanceSeed = `-- Persiste a identidade da arte somente se o visual ainda não foi configurado.\nupdate public.site_settings set appearance = '${JSON.stringify(defaultAppearance).replaceAll("'", "''")}'::jsonb where id=1 and appearance='{}'::jsonb;`;
await writeFile(new URL('../supabase/atualizar-jeiel-tattoo.sql', import.meta.url), `-- Atualiza personalização, imagens, numeração, contas, sorteios e histórico de pagamentos.\n-- Preserva configurações já preenchidas. Não ativa vendas nem executa sorteios.\nbegin;\n${body(migration)}\n${body(appearance)}\n${body(draft)}\n${appearanceSeed}\n${body(accounts)}\n${body(draws)}\n${body(payments)}\ncommit;\n`);
