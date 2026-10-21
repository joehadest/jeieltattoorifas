import test from 'node:test';
import assert from 'node:assert/strict';
import {currentOrder,filterPayments,paymentDate,paymentsCsv,paymentTotals} from '../src/lib/payments.ts';
import {demoCampaigns,type Order} from '../src/lib/domain.ts';

const campaign=demoCampaigns[0];
const base:Order={id:'pedido-1',access_token:'token',campaign_id:campaign.id,customer_name:'Cliente Teste',phone:'5584999991234',numbers:[1],amount:0.10,status:'pending',created_at:'2026-10-21T02:59:00Z',expires_at:'2026-10-21T03:29:00Z'};
const filters={query:'',status:'all',campaign:'all',from:'',to:''};
test('filtros usam data de Brasília e expiração não muda pagamentos confirmados',()=>{
  const now=Date.parse('2026-10-21T03:30:00Z');
  assert.equal(paymentDate(base.created_at),'2026-10-20');
  assert.equal(currentOrder(base,now).status,'expired');
  assert.equal(currentOrder({...base,status:'paid'},now).status,'paid');
  const result=filterPayments([base],{...filters,status:'expired',from:'2026-10-20',to:'2026-10-20',query:'Rifa Tattoo'},[campaign],now);
  assert.equal(result.length,1);assert.equal(base.status,'pending');
  assert.equal(filterPayments([base],{...filters,from:'2026-10-21'},[campaign],now).length,0);
  assert.equal(filterPayments([base],{...filters,campaign:'outra'},[campaign],now).length,0);
});
test('totais usam centavos e separam recebimento de reservas expiradas',()=>{
  assert.deepEqual(paymentTotals([{...base,status:'paid'},{...base,amount:0.20,status:'paid'},{...base,amount:30,status:'expired'},base]),{paid:0.30,pending:0.10,expired:30,cancelled:0});
});
test('exportação impede fórmulas e preserva aspas, quebras de linha e valor em BRL',()=>{
  const csv=paymentsCsv([{...base,customer_name:'  =HYPERLINK("https://example.com")\nNome',amount:30}], [{...campaign,title:'+Fórmula'}]);
  assert.ok(csv.startsWith('\uFEFF"Reserva";'));
  assert.ok(csv.includes('"\'  =HYPERLINK(""https://example.com"")\nNome"'));
  assert.ok(csv.includes('"\'+Fórmula"'));
  assert.ok(csv.includes('"30,00"'));
  assert.ok(!csv.includes('access_token'));assert.ok(!csv.includes('"token"'));
});
