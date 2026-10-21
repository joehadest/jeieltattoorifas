import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const campaign = '00000000-0000-4000-a000-000000000001';
const admin = '00000000-0000-4000-a000-000000000010';
before(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610200001_initial.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202610200002_number_start.sql', import.meta.url), 'utf8'));
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202610200003_site_appearance.sql', import.meta.url), 'utf8'));
  await db.query(`insert into auth.users(id) values($1)`,[admin]);
  await db.query(`insert into public.admin_users(user_id) values($1)`,[admin]);
  await db.query(`insert into public.campaigns(id,title,price,total_numbers,draw_date,status,rules) values($1,'Prêmio de teste',9.90,100,'2026-12-31','active','Regulamento de teste')`,[campaign]);
  await db.exec(`update public.site_settings set pix_key='teste@example.com',receiver_name='Pessoa Teste',receiver_city='Sao Paulo',whatsapp='11999991234'`);
});
beforeEach(async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false); delete from public.tickets; delete from public.orders; update public.site_settings set appearance='{}';`); });
after(async () => { await db.close(); });
async function reserve(numbers: number[] = [1,2]) {
  const result = await db.query<{result: {id:string;access_token:string;amount:number;phone:string}}>(`select public.reserve_order($1,$2,'Cliente Teste','11999991234') as result`,[campaign,numbers]);
  return result.rows[0].result;
}
test('reserva anônima calcula o valor no banco e impede disputa pelo mesmo número', async () => {
  await db.exec('set role anon');
  const order = await reserve();
  assert.equal(Number(order.amount),19.8);
  assert.equal(order.phone,'5511999991234');
  await assert.rejects(reserve([2,3]),/reservado/);
  const {rows} = await db.query<{number:number}>(`select number from public.get_campaign_tickets($1)`,[campaign]);
  assert.deepEqual(rows.map(r=>r.number).sort(),[1,2]);
});
test('RLS e grants bloqueiam pedidos, bilhetes e promoção de administrador', async () => {
  await reserve();
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from public.orders'),/permission denied/);
  await assert.rejects(db.query('select * from public.tickets'),/permission denied/);
  await assert.rejects(db.query(`insert into public.admin_users(user_id) values($1)`,[admin]),/permission denied/);
  await assert.rejects(db.query(`update public.site_settings set pix_key='invasor'`),/permission denied/);
  await assert.rejects(db.query(`insert into public.campaigns(title,price,total_numbers) values('Campanha invasora',1,100)`),/permission denied/);
  await db.exec('set role authenticated');
  const {rows} = await db.query('select * from public.orders'); assert.equal(rows.length,0);
  const result = await db.query(`update public.site_settings set pix_key='invasor' returning id`); assert.equal(result.rows.length,0);
  await assert.rejects(db.query(`insert into public.campaigns(title,price,total_numbers) values('Campanha invasora',1,100)`),/row-level security/);
});
test('consulta de pedido exige o token aleatório e não expõe contatos na disponibilidade', async () => {
  const order=await reserve(); await db.exec('set role anon');
  const invalid=await db.query<{result:unknown}>(`select public.get_my_order($1,$2) as result`,[order.id,admin]); assert.equal(invalid.rows[0].result,null);
  const valid=await db.query<{result:{id:string}}>(`select public.get_my_order($1,$2) as result`,[order.id,order.access_token]); assert.equal(valid.rows[0].result.id,order.id);
  const tickets=await db.query(`select * from public.get_campaign_tickets($1)`,[campaign]);
  assert.deepEqual(Object.keys(tickets.rows[0]).sort(),['campaign_id','expires_at','number','status']);
});
test('números expirados ficam disponíveis e não podem ser confirmados tardiamente', async () => {
  const old=await reserve([5]);
  await db.query(`update public.orders set expires_at=now()-interval '1 minute' where id=$1`,[old.id]);
  const available=await db.query(`select * from public.get_campaign_tickets($1)`,[campaign]); assert.equal(available.rows.length,0);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin]); await db.exec('set role authenticated');
  await assert.rejects(db.query(`select public.admin_order_status($1,'paid')`,[old.id]),/expirou/);
  await db.exec('set role anon'); const replacement=await reserve([5]); assert.notEqual(replacement.id,old.id);
});
test('somente administrador confirma e confirmação mantém o número ocupado', async () => {
  const order=await reserve([7]); await db.exec('set role authenticated');
  await assert.rejects(db.query(`select public.admin_order_status($1,'paid')`,[order.id]),/administrativo/);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin]);
  await db.query(`select public.admin_order_status($1,'paid')`,[order.id]);
  const paid=await db.query<{status:string}>(`select status from public.orders where id=$1`,[order.id]); assert.equal(paid.rows[0].status,'paid');
  await assert.rejects(db.query(`update public.campaigns set price=1 where id=$1`,[campaign]),/não podem/);
  await db.exec('set role anon'); await assert.rejects(reserve([7]),/reservado/);
});
test('cancelamento libera o número e uma reserva inválida não cria pedidos', async () => {
  const order=await reserve([8]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin]); await db.exec('set role authenticated');
  await db.query(`select public.admin_order_status($1,'cancelled')`,[order.id]);
  await db.exec('set role anon'); await reserve([8]);
  await assert.rejects(reserve([1,1]),/diferentes/);
  await assert.rejects(reserve([100]),/limites/);
  await assert.rejects(reserve([-1]),/limites/);
  await db.exec('reset role'); const {rows}=await db.query('select * from public.orders'); assert.equal(rows.length,2);
});

test('campanha de 01 a 100 aceita o 100, rejeita o 00 e bloqueia mudar o início após reserva', async () => {
  await db.query(`update public.campaigns set number_start=1, category='Tattoo', price=30 where id=$1`,[campaign]);
  const order=await reserve([1,100]); assert.equal(Number(order.amount),60);
  await assert.rejects(reserve([0]),/limites/);
  await assert.rejects(reserve([101]),/limites/);
  await assert.rejects(db.query(`update public.campaigns set number_start=0 where id=$1`,[campaign]),/não podem/);
});

test('atualização Jeiel cria somente rascunho e preserva configurações já preenchidas', async () => {
  await db.exec(`update public.site_settings set site_name='Rifa Club',pix_key='',receiver_name='',receiver_city='',whatsapp=''`);
  const update=await readFile(new URL('../supabase/atualizar-jeiel-tattoo.sql', import.meta.url),'utf8');
  await db.exec(update);
  const counts=await db.query<{orders:number;tickets:number}>(`select (select count(*)::integer from public.orders) as orders,(select count(*)::integer from public.tickets) as tickets`);
  assert.deepEqual(counts.rows[0],{ orders:0,tickets:0 });
  const campaignResult=await db.query<{status:string;draw_date:string|null;price:number;number_start:number;total_numbers:number}>(`select status,draw_date,price,number_start,total_numbers from public.campaigns where id='00000000-0000-4000-a000-000000000004'`);
  const draft=campaignResult.rows[0]; assert.equal(draft.status,'paused'); assert.equal(draft.draw_date,null); assert.equal(Number(draft.price),30); assert.equal(draft.number_start,1); assert.equal(draft.total_numbers,100);
  const settings=await db.query<{site_name:string;pix_key:string;receiver_name:string;whatsapp:string}>(`select * from public.site_settings where id=1`);
  assert.equal(settings.rows[0].site_name,'Jeiel Tattoo'); assert.equal(settings.rows[0].pix_key,'jeiellimeira36@gmail.com'); assert.equal(settings.rows[0].whatsapp,'558499540402'); assert.equal(settings.rows[0].receiver_name,'');
  const savedAppearance=await db.query<{appearance:{theme:{accent:string};hero:{title:string}}}>(`select appearance from public.site_settings where id=1`);
  assert.equal(savedAppearance.rows[0].appearance.theme.accent,'#e7bd35');
  assert.equal(savedAppearance.rows[0].appearance.hero.title,'Uma tattoo.\nA sua história.');
  await db.exec(`update public.site_settings set pix_key='configurado@example.com',appearance='{"hero":{"title":"Personalizado no painel"}}'; update public.campaigns set title='Titulo editado pelo organizador' where id='00000000-0000-4000-a000-000000000004'`);
  await db.exec(update);
  const kept=await db.query<{pix_key:string}>(`select pix_key from public.site_settings where id=1`); assert.equal(kept.rows[0].pix_key,'configurado@example.com');
  const keptCampaign=await db.query<{title:string}>(`select title from public.campaigns where id='00000000-0000-4000-a000-000000000004'`); assert.equal(keptCampaign.rows[0].title,'Titulo editado pelo organizador');
  const keptAppearance=await db.query<{appearance:{hero:{title:string}}}>(`select appearance from public.site_settings where id=1`); assert.equal(keptAppearance.rows[0].appearance.hero.title,'Personalizado no painel');
});

test('personalização é pública para leitura, mas somente administrador pode alterar', async () => {
  await db.exec('set role anon');
  const read=await db.query<{appearance:unknown}>(`select appearance from public.site_settings where id=1`);
  assert.deepEqual(read.rows[0].appearance,{});
  await assert.rejects(db.query(`update public.site_settings set appearance='{"hero":{"title":"Invasor"}}'`),/permission denied/);
  await db.exec('set role authenticated');
  const denied=await db.query(`update public.site_settings set appearance='{"hero":{"title":"Invasor"}}' returning id`); assert.equal(denied.rows.length,0);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin]);
  await db.query(`update public.site_settings set appearance=$1 where id=1`,[{ hero:{ title:'Meu título' },theme:{ accent:'#ffffff' } }]);
  await assert.rejects(db.query(`update public.site_settings set appearance='[]' where id=1`),/site_appearance_object/);
  await db.exec('set role anon');
  const visible=await db.query<{appearance:{hero:{title:string}}}>(`select appearance from public.site_settings where id=1`); assert.equal(visible.rows[0].appearance.hero.title,'Meu título');
});

test('bucket de imagens aceita upload apenas do administrador e não permite sobrescrever arquivos', async () => {
  const bucket=await db.query<{public:boolean;file_size_limit:number;allowed_mime_types:string[]}>(`select * from storage.buckets where id='site-assets'`);
  assert.equal(bucket.rows[0].public,true); assert.equal(Number(bucket.rows[0].file_size_limit),5000000); assert.ok(!bucket.rows[0].allowed_mime_types.includes('image/svg+xml'));
  await db.exec('set role anon');
  await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values('site-assets','branding/invasor.png')`),/row-level security/);
  await db.exec('set role authenticated');
  await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values('site-assets','branding/invasor.png')`),/row-level security/);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[admin]);
  const inserted=await db.query(`insert into storage.objects(bucket_id,name) values('site-assets','branding/logo.png') returning id`); assert.equal(inserted.rows.length,1);
  const overwrite=await db.query(`update storage.objects set name='substituido.png' returning id`); assert.equal(overwrite.rows.length,0);
  const deletion=await db.query(`delete from storage.objects returning id`); assert.equal(deletion.rows.length,0);
});
