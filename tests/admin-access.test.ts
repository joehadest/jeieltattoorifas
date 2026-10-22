import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const owner='00000000-0000-4000-a000-000000000101',customer='00000000-0000-4000-a000-000000000102',newUser='00000000-0000-4000-a000-000000000103';
before(async()=>{
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;`);
  for(const file of ['202610200001_initial.sql','202610220007_admin_access.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
});
beforeEach(async()=>{
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','',false);truncate public.admin_access_invites,public.admin_users,auth.users cascade;`);
  await db.query(`insert into auth.users values($1,'owner@example.com',now()),($2,'customer@example.com',now()),($3,'new@example.com',null)`,[owner,customer,newUser]);
  await db.query('insert into public.admin_users(user_id) values($1)',[owner]);
});
after(async()=>{await db.close();});
async function asUser(id:string|null,role='authenticated'){
  await db.exec('reset role');await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[id||'']);await db.exec(`set role ${role}`);
}
async function activate(){return (await db.query<{result:boolean}>('select public.activate_admin_access() as result')).rows[0].result;}

test('visitantes e participantes não listam, concedem ou removem administradores',async()=>{
  for(const [id,role] of [[null,'anon'],[customer,'authenticated']] as const){
    await asUser(id,role);
    for(const sql of ["select public.admin_list_access()","select public.admin_add_access('attacker@example.com')","select public.admin_revoke_access('owner@example.com')"])
      await assert.rejects(db.query(sql),/permission denied|administrativo/);
    await assert.rejects(db.query('select * from public.admin_access_invites'),/permission denied/);
    await assert.rejects(db.query(`insert into public.admin_users values($1)`,[customer]),/permission denied/);
  }
  assert.equal(await activate(),false);
});
test('administrador autoriza conta confirmada e mantém dois acessos independentes',async()=>{
  await asUser(owner);const result=await db.query<{status:string}>(`select public.admin_add_access(' CUSTOMER@EXAMPLE.COM ') as status`);
  assert.equal(result.rows[0].status,'active');
  const list=await db.query<{items:Array<{email:string;status:string;is_current:boolean}>}>('select public.admin_list_access() as items');
  assert.equal(list.rows[0].items.length,2);assert.equal(list.rows[0].items.find(x=>x.is_current)?.email,'owner@example.com');
  await assert.rejects(db.query(`select public.admin_add_access('customer@example.com')`),/já é administrador/);
  await asUser(customer);assert.equal(await activate(),true);
  assert.equal((await db.query<{ok:boolean}>('select public.is_admin() as ok')).rows[0].ok,true);
});
test('autorização pendente só ativa para o dono do e-mail depois da confirmação',async()=>{
  await asUser(owner);assert.equal((await db.query<{status:string}>(`select public.admin_add_access('new@example.com') as status`)).rows[0].status,'pending');
  await asUser(newUser);assert.equal(await activate(),false);
  await asUser(customer);assert.equal(await activate(),false);
  await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[newUser]);
  await asUser(newUser);assert.equal(await activate(),true);assert.equal(await activate(),true);
  await db.exec('reset role');const accepted=await db.query<{accepted_by:string;accepted_at:string}>(`select accepted_by,accepted_at from public.admin_access_invites where email='new@example.com'`);
  assert.equal(accepted.rows[0].accepted_by,newUser);assert.ok(accepted.rows[0].accepted_at);
});
test('autorizações canceladas e expiradas não concedem acesso e podem ser renovadas',async()=>{
  await asUser(owner);await db.query(`select public.admin_add_access('new@example.com')`);
  await db.query(`select public.admin_revoke_access('new@example.com')`);
  await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=now() where id=$1',[newUser]);
  await asUser(newUser);assert.equal(await activate(),false);
  await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=$1',[newUser]);
  await asUser(owner);await db.query(`select public.admin_add_access('new@example.com')`);
  await db.exec('reset role');await db.exec(`update public.admin_access_invites set expires_at=now()-interval '1 second';update auth.users set email_confirmed_at=now() where email='new@example.com';`);
  await asUser(newUser);assert.equal(await activate(),false);
  await asUser(owner);assert.equal((await db.query<{status:string}>(`select public.admin_add_access('new@example.com') as status`)).rows[0].status,'active');
});
test('revogação vale para a sessão existente, preserva a conta e impede autoexclusão',async()=>{
  await asUser(owner);await assert.rejects(db.query(`select public.admin_revoke_access('owner@example.com')`),/próprio acesso/);
  await db.query(`select public.admin_add_access('customer@example.com')`);
  await db.query(`select public.admin_revoke_access('customer@example.com')`);
  await asUser(customer);assert.equal(await activate(),false);
  await assert.rejects(db.query('select public.admin_list_access()'),/administrativo/);
  await assert.rejects(db.query(`select public.admin_add_access('new@example.com')`),/administrativo/);
  await db.exec('reset role');assert.equal((await db.query('select * from auth.users where id=$1',[customer])).rows.length,1);
  assert.equal((await db.query('select * from public.admin_users')).rows.length,1);
});
test('gestão recusa e-mails inválidos e reaplicação preserva os acessos',async()=>{
  await asUser(owner);for(const email of ['sem-email','a@b','a b@example.com','a'.repeat(250)+'@example.com'])await assert.rejects(db.query('select public.admin_add_access($1)',[email]),/e-mail válido/);
  await db.query(`select public.admin_add_access('new@example.com')`);await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase/migrations/202610220007_admin_access.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select * from public.admin_users')).rows.length,1);
  assert.equal((await db.query('select * from public.admin_access_invites')).rows.length,1);
});
