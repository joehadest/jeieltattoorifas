import postgres from 'postgres';
import { databasePlan, tattooCampaignId } from './database-plan.mjs';

const checkOnly = process.argv.includes('--check');
let sql;
const messages = {
  DATABASE_URL_MISSING:'Defina DATABASE_URL no .env ou no .env.local.',
  DATABASE_URL_INVALID:'Confira DATABASE_URL: use a URL PostgreSQL real e codifique caracteres especiais da senha.',
  WRONG_PROJECT:'A conexão PostgreSQL e a URL pública apontam para projetos diferentes.',
  PARTIAL_SCHEMA:'O banco tem somente parte das tabelas esperadas. A sincronização foi interrompida sem alterar dados.',
  STORAGE_MISSING:'O banco precisa do esquema Storage do Supabase para armazenar as imagens.',
  EACCES:'O ambiente bloqueou a conexão de rede. Execute este comando no seu terminal local.',
  ENETUNREACH:'A conexão direta está sem rota de rede. Confira a conectividade IPv6 ou use o Session Pooler do Supabase.',
  ENOTFOUND:'O endereço do banco não foi encontrado. Confira o projeto e o host da conexão.',
  CONNECT_TIMEOUT:'O banco não respondeu. Confira a rede e se o projeto Supabase está ativo.',
  '28P01':'O banco recusou a autenticação. Confira a senha e a codificação da URL no .env.',
};

function fail(code) { throw Object.assign(new Error(code),{code}); }
try {
  const connection = process.env.DATABASE_URL;
  if (!connection) fail('DATABASE_URL_MISSING');
  let target;
  try { target = new URL(connection); } catch { fail('DATABASE_URL_INVALID'); }
  if (!['postgres:','postgresql:'].includes(target.protocol) || !target.hostname || !target.password || /YOUR-PASSWORD|SUA[-_ ]?SENHA/i.test(connection)) fail('DATABASE_URL_INVALID');
  if (process.env.VITE_SUPABASE_URL && target.hostname.startsWith('db.')) {
    const publicHost = new URL(process.env.VITE_SUPABASE_URL).hostname;
    if (target.hostname !== `db.${publicHost}`) fail('WRONG_PROJECT');
  }
  sql = postgres(connection,{ ssl:{rejectUnauthorized:true},connect_timeout:10,max:1,onnotice:()=>{} });
  await sql.begin(async transaction => {
    if (!checkOnly) await transaction`select pg_advisory_xact_lock(hashtext('jeiel-tattoo-schema-sync'))`;
    const tables = await transaction`select table_name from information_schema.tables where table_schema='public' and table_name in ('admin_users','campaigns','orders','site_settings','tickets') order by table_name`;
    const names = tables.map(row => row.table_name);
    if (checkOnly) {
      const columns = await transaction`select table_name,column_name from information_schema.columns where table_schema='public' and ((table_name='campaigns' and column_name='number_start') or (table_name='site_settings' and column_name='appearance'))`;
      console.log(JSON.stringify({ conectado:true,tabelas:names,numeracao:columns.some(row => row.column_name==='number_start'),personalizacao:columns.some(row => row.column_name==='appearance') },null,2));
      return;
    }
    const [{ buckets,objects }] = await transaction`select to_regclass('storage.buckets') as buckets,to_regclass('storage.objects') as objects`;
    if (!buckets || !objects) fail('STORAGE_MISSING');
    const plan = await databasePlan(names);
    for (const statement of plan.statements) await transaction.unsafe(statement);
    const [campaign] = await transaction`select title,price,total_numbers,number_start,status,draw_date from public.campaigns where id=${tattooCampaignId}`;
    const [settings] = await transaction`select site_name,receiver_name <> '' as recebedor_definido,pix_key <> '' as pix_definido,whatsapp <> '' as whatsapp_definido,appearance <> '{}'::jsonb as visual_configurado from public.site_settings where id=1`;
    const [{ count }] = await transaction`select count(*)::integer as count from public.admin_users`;
    return { estrutura_criada:plan.initialize,campanha:campaign,configuracao:settings,administradores:count };
  }).then(summary => { if (summary) { console.log('Sincronização concluída. Dados existentes preservados.'); console.log(JSON.stringify(summary,null,2)); } });
} catch (error) {
  const code = String(error.code || 'CONNECTION_ERROR').replace(/[^A-Z0-9_]/g,'');
  // Never print driver messages, connection URLs, passwords or participant data.
  console.error(`${messages[code] || 'Não foi possível concluir. Nenhuma alteração parcial foi confirmada.'} Código: ${code}.`);
  process.exitCode = 1;
} finally { if (sql) await sql.end({timeout:2}); }
