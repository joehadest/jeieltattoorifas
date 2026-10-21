import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCampaigns, defaultSettings, validateReservation, whatsappNumber, numberLabel } from '../src/lib/domain.ts';
import { crc16, pixPayload } from '../src/lib/pix.ts';

test('normaliza telefones brasileiros com DDD e rejeita telefones incompletos', () => {
  assert.equal(whatsappNumber('(11) 99999-1234'), '5511999991234');
  assert.equal(whatsappNumber('+55 (11) 99999-1234'), '5511999991234');
  assert.equal(whatsappNumber('99999-1234'), '');
  assert.equal(numberLabel(7,1000), '007');
});
test('recusa números duplicados, inválidos e reservas ativas de outro cliente', () => {
  const campaign = demoCampaigns[0];
  const validate = (numbers: number[]) => validateReservation(campaign,numbers,'Pessoa Teste','11999991234',[]);
  assert.throws(() => validate([1,1]), /diferentes/);
  assert.throws(() => validate([-1]), /limites/);
  assert.throws(() => validate([0]), /limites/);
  assert.throws(() => validate([101]), /limites/);
  assert.throws(() => validate([1000]), /limites/);
  assert.throws(() => validate([0.1]), /limites/);
  assert.throws(() => validateReservation(campaign,[2],'Pessoa Teste','11999991234',[{campaign_id:campaign.id,number:2,status:'pending',expires_at:new Date(Date.now()+60000).toISOString()}]), /reservado/);
  assert.doesNotThrow(() => validateReservation(campaign,[2],'Pessoa Teste','11999991234',[{campaign_id:campaign.id,number:2,status:'pending',expires_at:new Date(0).toISOString()}]));
  assert.throws(() => validateReservation({...campaign,status:'paused'},[2],'Pessoa Teste','11999991234',[]), /não está/);
});

test('a rifa Tattoo possui 100 números de 01 a 100 a R$ 30 cada', () => {
  const campaign=demoCampaigns[0];
  assert.equal(campaign.number_start,1); assert.equal(campaign.total_numbers,100); assert.equal(campaign.price,30);
  assert.equal(numberLabel(1,100),'01'); assert.equal(numberLabel(100,100),'100');
  assert.doesNotThrow(() => validateReservation(campaign,[1,100],'Pessoa Teste','11999991234',[]));
});
test('Pix só é emitido com dados completos e inclui valor e CRC16 válidos', () => {
  assert.equal(pixPayload(defaultSettings,9.9),'');
  assert.equal(crc16('123456789'),'29B1');
  const settings = {...defaultSettings,pix_key:'teste@example.com',receiver_name:'José de Teste',receiver_city:'São Paulo'};
  const payload = pixPayload(settings,19.8);
  assert.ok(payload.includes('540519.80'));
  assert.ok(payload.includes('5913JOSE DE TESTE'));
  assert.ok(payload.includes('6009SAO PAULO'));
  assert.equal(payload.slice(-4),crc16(payload.slice(0,-4)));
  assert.equal(pixPayload(settings,0),'');
  assert.equal(pixPayload({...settings,receiver_name:'***'},10),'');
});
