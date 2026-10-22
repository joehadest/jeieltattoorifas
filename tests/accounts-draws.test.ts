import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {databasePlan} from '../scripts/database-plan.mjs';
import {secureDrawIndex} from '../src/lib/draw.ts';

const db=new PGlite();
const a='00000000-0000-4000-a000-000000000011',b='00000000-0000-4000-a000-000000000012',admin='00000000-0000-4000-a000-000000000013',campaign='00000000-0000-4000-a000-000000000014';
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  const plan=await databasePlan([]);for(const statement of plan.statements)await db.exec(statement);
  for(const id of [a,b,admin])await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query('insert into public.admin_users(user_id) values($1)',[admin]);
});
beforeEach(async()=>{
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);truncate public.campaign_draws,public.tickets,public.orders,public.campaigns,public.customer_profiles cascade;
    update public.site_settings set pix_key='pagamento@example.com',receiver_name='Organizador Teste',receiver_city='Natal',whatsapp='5584999991234';`);
  await db.query(`insert into public.campaigns(id,title,price,total_numbers,number_start,draw_date,status,rules) values($1,'Campanha Teste',30,100,1,'2000-01-01','active','Um prêmio, números pagos e sorteio no site.')`,[campaign]);
});
after(async()=>{await db.close();});
async function asUser(id:string|null,role='authenticated'){await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id||'']);await db.exec(`set role ${role}`);}
async function reserve(id:string,numbers:number[]){await asUser(id);const result=await db.query<{result:{id:string;access_token:string;customer_id:string}}>(`select public.reserve_order($1,$2,'Cliente Teste','84999991234') as result`,[campaign,numbers]);return result.rows[0].result;}
async function pay(id:string){await asUser(admin);await db.query(`select public.admin_order_status($1,'paid')`,[id]);}

test('reserva exige conta e atribui o proprietário a partir da sessão',async()=>{
  await asUser(null,'anon');await assert.rejects(db.query(`select public.reserve_order($1,'{1}','Visitante Teste','84999991234')`,[campaign]),/permission denied/);
  await asUser(null);await assert.rejects(db.query(`select public.reserve_order($1,'{1}','Visitante Teste','84999991234')`,[campaign]),/conta/);
  const order=await reserve(a,[1,100]);assert.equal(order.customer_id,a);
});
test('contas só consultam os próprios pedidos e não alteram pagamentos ou donos',async()=>{
  const first=await reserve(a,[1]);const second=await reserve(b,[2]);
  await asUser(a);
  const direct=await db.query<{id:string}>('select id from public.orders');assert.deepEqual(direct.rows.map(row=>row.id),[first.id]);
  const own=await db.query<{result:Array<{id:string;campaign:{title:string}}>}>('select public.get_account_orders() as result');assert.equal(own.rows[0].result.length,1);assert.equal(own.rows[0].result[0].campaign.title,'Campanha Teste');
  await assert.rejects(db.query(`update public.orders set status='paid',customer_id=$1 where id=$2`,[a,second.id]),/permission denied/);
  const other=await db.query<{result:unknown}>('select public.get_my_order($1,$2) as result',[second.id,second.access_token]);assert.equal(other.rows[0].result,null);
  await db.query(`insert into public.customer_profiles(user_id,full_name,phone) values($1,'Cliente Teste','5584999991234')`,[a]);
  await asUser(b);const profiles=await db.query('select * from public.customer_profiles');assert.equal(profiles.rows.length,0);
  await assert.rejects(db.query(`insert into public.customer_profiles(user_id,full_name) values($1,'Invasor Teste')`,[a]),/row-level security/);
});
test('reserva antiga exige token e vinculação única, invalidando o acesso antigo',async()=>{
  await db.exec('reset role');const legacy=await db.query<{id:string;access_token:string}>(`insert into public.orders(campaign_id,customer_name,phone,numbers,amount) values($1,'Cliente Antigo','5584999991234','{10}',30) returning id,access_token`,[campaign]);const order=legacy.rows[0];
  await asUser(a);await assert.rejects(db.query('select public.claim_legacy_order($1,$2)',[order.id,b]),/vincular/);
  await db.query('select public.claim_legacy_order($1,$2)',[order.id,order.access_token]);
  await asUser(b);await assert.rejects(db.query('select public.claim_legacy_order($1,$2)',[order.id,order.access_token]),/vincular/);
  await asUser(null,'anon');const old=await db.query<{result:unknown}>('select public.get_my_order($1,$2) as result',[order.id,order.access_token]);assert.equal(old.rows[0].result,null);
});
test('sorteio exige administrador, data, pagamentos e ausência de reservas pendentes',async()=>{
  await asUser(a);await assert.rejects(db.query('select public.admin_draw_campaign($1)',[campaign]),/administrativo/);
  await asUser(admin);await assert.rejects(db.query('select public.admin_draw_campaign($1)',[campaign]),/confirmado/);
  const order=await reserve(a,[3]);await asUser(admin);await assert.rejects(db.query('select public.admin_draw_campaign($1)',[campaign]),/pendentes/);await pay(order.id);
  await db.query(`update public.campaigns set draw_date='2099-01-01' where id=$1`,[campaign]);await assert.rejects(db.query('select public.admin_draw_campaign($1)',[campaign]),/data cadastrada/);
});
test('resultado considera só números pagos, é público sem contatos e não permite novo sorteio ou edição',async()=>{
  const paid=await reserve(a,[1,50,100]);await pay(paid.id);const pending=await reserve(b,[7]);
  await db.exec('reset role');await db.query(`update public.orders set expires_at=now()-interval '1 minute' where id=$1`,[pending.id]);
  await asUser(admin);const result=await db.query<{result:{winning_number:number;eligible_numbers:number[];pool_hash:string;random_sample:number;selected_index:number;winner_label:string}}> ('select public.admin_draw_campaign($1) as result',[campaign]);const draw=result.rows[0].result;
  assert.deepEqual(draw.eligible_numbers,[1,50,100]);assert.ok(draw.eligible_numbers.includes(draw.winning_number));assert.equal(draw.selected_index,Number(draw.random_sample)%3+1);assert.equal(draw.eligible_numbers[draw.selected_index-1],draw.winning_number);
  assert.equal(draw.pool_hash,createHash('sha256').update('1,50,100').digest('hex'));
  await assert.rejects(db.query('select public.admin_draw_campaign($1)',[campaign]),/já possui/);
  await assert.rejects(db.query(`update public.campaigns set status='active' where id=$1`,[campaign]),/já foi sorteada/);
  await db.exec('reset role');await assert.rejects(db.query(`update public.campaign_draws set winning_number=7`),/não pode/);await assert.rejects(db.query('delete from public.campaign_draws'),/não pode/);
  await asUser(null,'anon');const publicResult=await db.query<Record<string,unknown>>('select * from public.get_draw_results($1)',[campaign]);assert.equal(publicResult.rows.length,1);for(const field of ['phone','customer_id','winner_order_id','customer_name','drawn_by'])assert.ok(!(field in publicResult.rows[0]));
  await assert.rejects(db.query('select * from public.campaign_draws'),/permission denied/);
});
test('amostragem rejeita a sobra de 2^32 e valida os limites',()=>{
  const values=[4294967295,4294967294,7];const result=secureDrawIndex(3,()=>values.shift()!);assert.equal(result.sample,4294967294);assert.equal(result.index,2);
  assert.deepEqual(secureDrawIndex(1,()=>4294967295),{sample:4294967295,index:0});assert.throws(()=>secureDrawIndex(0));assert.throws(()=>secureDrawIndex(3,()=>-1));
});

test('dados Pix ficam congelados e confirmação registra data e responsável sem permitir reprocessamento',async()=>{
  const order=await reserve(a,[20]);
  await asUser(admin);
  await db.query(`update public.site_settings set pix_key='nova-chave@example.com',receiver_name='Outro Recebedor' where id=1`);
  await pay(order.id);
  const result=await db.query<{payment_snapshot:{pix_key:string;receiver_name:string};paid_at:string;status:string}>(`select payment_snapshot,paid_at,status from public.orders where id=$1`,[order.id]);
  assert.equal(result.rows[0].payment_snapshot.pix_key,'pagamento@example.com');
  assert.equal(result.rows[0].payment_snapshot.receiver_name,'Organizador Teste');
  assert.ok(result.rows[0].paid_at);assert.equal(result.rows[0].status,'paid');
  await assert.rejects(db.query(`select public.admin_order_status($1,'paid')`,[order.id]),/processada/);
  const events=await db.query<{event_type:string;source:string;actor_id:string|null;occurred_at:string}>(`select * from public.order_events where order_id=$1 order by occurred_at`,[order.id]);
  assert.deepEqual(events.rows.map(event=>event.event_type),['created','paid']);
  assert.equal(events.rows[0].actor_id,null);assert.equal(events.rows[1].actor_id,admin);assert.equal(events.rows[1].source,'manual');
  assert.equal(new Date(events.rows[1].occurred_at).getTime(),new Date(result.rows[0].paid_at).getTime());
  await asUser(a);assert.equal((await db.query('select * from public.order_events')).rows.length,0);
  await assert.rejects(db.query(`insert into public.order_events(order_id,event_type,source) values($1,'paid','manual')`,[order.id]),/permission denied/);
  await db.exec('reset role');
  await assert.rejects(db.query(`update public.order_events set event_type='cancelled' where order_id=$1`,[order.id]),/não pode/);
  await assert.rejects(db.query(`delete from public.order_events where order_id=$1`,[order.id]),/não pode/);
});

test('expiração libera números sem confirmar pagamento tardio e cancelamento fica no histórico',async()=>{
  const old=await reserve(a,[30]);
  await db.exec('reset role');await db.query(`update public.orders set expires_at=now()-interval '1 minute' where id=$1`,[old.id]);
  const replacement=await reserve(b,[30]);
  await asUser(admin);await assert.rejects(db.query(`select public.admin_order_status($1,'paid')`,[old.id]),/expirou/);
  await db.query(`select public.admin_order_status($1,'cancelled')`,[replacement.id]);
  const cancelled=await db.query<{cancelled_at:string;paid_at:null}>(`select cancelled_at,paid_at from public.orders where id=$1`,[replacement.id]);
  assert.ok(cancelled.rows[0].cancelled_at);assert.equal(cancelled.rows[0].paid_at,null);
  const events=await db.query<{event_type:string;source:string;actor_id:string|null}>(`select * from public.order_events where order_id=$1 order by occurred_at`,[old.id]);
  assert.deepEqual(events.rows.map(event=>event.event_type),['created','expired']);
  assert.equal(events.rows[1].source,'system');assert.equal(events.rows[1].actor_id,null);
  await db.exec('reset role');
  assert.equal((await db.query(`select * from public.tickets where order_id=$1`,[replacement.id])).rows.length,0);
});

test('reaplicar atualização preserva pagamentos, snapshots e eventos existentes',async()=>{
  const order=await reserve(a,[40]);await pay(order.id);
  const before=await db.query(`select payment_snapshot,paid_at,status from public.orders where id=$1`,[order.id]);
  const eventsBefore=await db.query(`select * from public.order_events where order_id=$1 order by occurred_at`,[order.id]);
  await db.exec('reset role');
  const plan=await databasePlan(['admin_users','campaigns','orders','site_settings','tickets']);
  for (const statement of plan.statements) await db.exec(statement);
  assert.deepEqual((await db.query(`select payment_snapshot,paid_at,status from public.orders where id=$1`,[order.id])).rows,before.rows);
  assert.deepEqual((await db.query(`select * from public.order_events where order_id=$1 order by occurred_at`,[order.id])).rows,eventsBefore.rows);
});

test('exclusão confirmada libera números, remove histórico e preserva conta, perfil e outras reservas',async()=>{
  const order=await reserve(a,[10,11]);await pay(order.id);const other=await reserve(a,[12]);
  await db.exec('reset role');await db.query(`insert into public.customer_profiles(user_id,full_name,phone) values($1,'Cliente Teste','5584999991234')`,[a]);
  await asUser(admin);await db.query('select public.admin_delete_order($1,$2)',[order.id,order.id.slice(0,8)]);
  await db.exec('reset role');
  for(const table of ['orders','tickets','order_events']){
    const key=table==='orders'?'id':'order_id';assert.equal((await db.query(`select * from public.${table} where ${key}=$1`,[order.id])).rows.length,0);
  }
  assert.equal((await db.query('select * from public.order_deletion_context')).rows.length,0);
  assert.equal((await db.query('select * from auth.users where id=$1',[a])).rows.length,1);
  assert.equal((await db.query('select * from public.customer_profiles where user_id=$1',[a])).rows.length,1);
  await asUser(a);const account=await db.query<{items:Array<{id:string}>}>('select public.get_account_orders() as items');assert.deepEqual(account.rows[0].items.map(x=>x.id),[other.id]);
  await reserve(b,[10,11]);
});

test('clientes e visitantes não excluem reservas nem forjam o contexto privado de exclusão',async()=>{
  const order=await reserve(a,[21]);await pay(order.id);
  for(const [user,role] of [[a,'authenticated'],[b,'authenticated'],[null,'anon']] as const){
    await asUser(user,role);await assert.rejects(db.query('select public.admin_delete_order($1,$2)',[order.id,order.id.slice(0,8)]),/permission denied|administrativo/);
    await assert.rejects(db.query('delete from public.orders where id=$1',[order.id]),/permission denied/);
    await assert.rejects(db.query('insert into public.order_deletion_context values($1,$2)',[order.id,admin]),/permission denied/);
  }
  await asUser(admin);await db.query(`select set_config('app.delete_order',$1,false)`,[order.id]);
  await assert.rejects(db.query('delete from public.order_events where order_id=$1',[order.id]),/permission denied/);
  await db.exec('reset role');await assert.rejects(db.query('delete from public.order_events where order_id=$1',[order.id]),/não pode/);
  assert.equal((await db.query('select * from public.orders where id=$1',[order.id])).rows.length,1);
});

test('código incorreto ou ausente não altera pagamento, números ou histórico',async()=>{
  const order=await reserve(a,[22]);await pay(order.id);await asUser(admin);
  for(const code of ['',null,'ERRADO'])await assert.rejects(db.query('select public.admin_delete_order($1,$2)',[order.id,code]),/código da reserva/);
  await db.exec('reset role');assert.equal((await db.query('select * from public.tickets where order_id=$1',[order.id])).rows.length,1);
  assert.equal((await db.query('select * from public.order_events where order_id=$1',[order.id])).rows.length,2);
  assert.equal((await db.query('select * from public.order_deletion_context')).rows.length,0);
});

test('após um sorteio nenhuma reserva da campanha pode ser excluída',async()=>{
  const first=await reserve(a,[23]);await pay(first.id);const second=await reserve(b,[24]);await pay(second.id);
  await asUser(admin);await db.query('select public.admin_draw_campaign($1)',[campaign]);
  for(const order of [first,second])await assert.rejects(db.query('select public.admin_delete_order($1,$2)',[order.id,order.id.slice(0,8)]),/já sorteada/);
  await db.exec('reset role');assert.equal((await db.query('select * from public.orders')).rows.length,2);
  assert.equal((await db.query('select * from public.order_deletion_context')).rows.length,0);
});

test('excluir reservas antigas não remove números já reservados por outra pessoa',async()=>{
  const expired=await reserve(a,[25]);await db.exec('reset role');await db.query(`update public.orders set expires_at=now()-interval '1 minute' where id=$1`,[expired.id]);
  const replacement=await reserve(b,[25]);await asUser(admin);await db.query('select public.admin_delete_order($1,$2)',[expired.id,expired.id.slice(0,8)]);
  assert.equal((await db.query('select * from public.orders where id=$1',[replacement.id])).rows.length,1);
  await db.exec('reset role');assert.equal((await db.query('select * from public.tickets where order_id=$1',[replacement.id])).rows.length,1);
});

test('exclusão funciona em cancelados e pendentes e recusa repetir a operação',async()=>{
  const cancelled=await reserve(a,[26]);await asUser(admin);await db.query(`select public.admin_order_status($1,'cancelled')`,[cancelled.id]);
  const pending=await reserve(b,[27]);await asUser(admin);
  for(const order of [cancelled,pending]){
    await db.query('select public.admin_delete_order($1,$2)',[order.id,order.id.slice(0,8)]);
    await assert.rejects(db.query('select public.admin_delete_order($1,$2)',[order.id,order.id.slice(0,8)]),/já excluída/);
  }
  await db.exec('reset role');assert.equal((await db.query('select * from public.orders')).rows.length,0);
  assert.equal((await db.query('select * from public.order_events')).rows.length,0);
});

test('números pagos excluídos deixam de participar do sorteio',async()=>{
  const deleted=await reserve(a,[28]);await pay(deleted.id);const remaining=await reserve(b,[29]);await pay(remaining.id);
  await asUser(admin);await db.query('select public.admin_delete_order($1,$2)',[deleted.id,deleted.id.slice(0,8)]);
  const draw=await db.query<{result:{eligible_numbers:number[];winning_number:number}}>('select public.admin_draw_campaign($1) as result',[campaign]);
  assert.deepEqual(draw.rows[0].result.eligible_numbers,[29]);assert.equal(draw.rows[0].result.winning_number,29);
});
