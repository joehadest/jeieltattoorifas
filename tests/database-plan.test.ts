import test from 'node:test';
import assert from 'node:assert/strict';
import { coreTables, databasePlan, transactionBody } from '../scripts/database-plan.mjs';

test('sincronização escolhe criação ou atualização e rejeita uma estrutura parcial', async () => {
  const fresh = await databasePlan([]);
  assert.equal(fresh.initialize,true);
  assert.equal(fresh.statements.length,2);
  assert.match(fresh.statements[0],/create table public\.orders/);
  const existing = await databasePlan(coreTables);
  assert.equal(existing.initialize,false);
  assert.equal(existing.statements.length,1);
  assert.doesNotMatch(existing.statements[0],/create table public\.orders/);
  await assert.rejects(databasePlan(['campaigns','orders']),{ code:'PARTIAL_SCHEMA' });
});

test('transação externa preserva funções e inclui a configuração real da arte', async () => {
  const source = 'begin;\r\ncreate function a() returns void as $$ begin\nreturn;\nend; $$ language plpgsql;\r\ncommit;';
  const body = transactionBody(source);
  assert.match(body,/\$\$ begin\nreturn;\nend;/);
  assert.doesNotMatch(body,/^begin;|^commit;/m);
  const plan = await databasePlan(coreTables);
  assert.match(plan.statements[0],/where id=1 and appearance='\{\}'::jsonb/);
  assert.match(plan.statements[0],/30,100,1,null,'paused'/);
});
