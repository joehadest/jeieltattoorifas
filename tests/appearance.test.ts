import test from 'node:test';
import assert from 'node:assert/strict';
import { accentContrast, appearanceStyle, defaultAppearance, isSafeImageUrl, normalizeAppearance, sectionKeys, validateAppearance } from '../src/lib/appearance.ts';

test('configuração parcial e configurações antigas recebem os textos e temas padrão sem mudar o original', () => {
  const partial=normalizeAppearance({ hero:{ title:'Meu site' },theme:{ accent:'#ffffff' },unknown:'ignored' });
  assert.equal(partial.hero.title,'Meu site'); assert.equal(partial.hero.button,defaultAppearance.hero.button); assert.equal(partial.theme.accent,'#ffffff');
  assert.equal(defaultAppearance.hero.title,'Uma tattoo.\nA sua história.'); assert.ok(!('unknown' in partial));
  assert.deepEqual(normalizeAppearance(null),defaultAppearance);
  partial.how.steps[0].title='Alterado'; assert.notEqual(defaultAppearance.how.steps[0].title,'Alterado');
});
test('cores, fontes e URLs inválidas não entram no CSS ou nos atributos de imagem', () => {
  const parsed=normalizeAppearance({ theme:{ accent:'red;display:none',font:'javascript:alert(1)',radius:100 },identity:{ logo:'javascript:alert(1)',logo_width:999 },hero:{ image:'//evil.example/image.png' } });
  assert.equal(parsed.theme.accent,defaultAppearance.theme.accent); assert.equal(parsed.theme.font,defaultAppearance.theme.font); assert.equal(parsed.theme.radius,24);
  assert.equal(parsed.identity.logo,''); assert.equal(parsed.identity.logo_width,280); assert.equal(parsed.hero.image,'');
  for (const bad of ['javascript:alert(1)','//evil.example/a.png','/\\evil.example/a.png','data:image/svg+xml;base64,PHN2Zz4=','https://user:password@example.com/logo.png']) assert.equal(isSafeImageUrl(bad),false);
  for (const good of ['/images/logo.png','https://example.com/logo.webp','data:image/png;base64,aGVsbG8=']) assert.equal(isSafeImageUrl(good),true);
});
test('ordem de seções elimina entradas desconhecidas e duplicadas sem perder seções ocultas', () => {
  const parsed=normalizeAppearance({ sections:{ order:['faq','faq','invalida','hero'],visible:{ how:false } } });
  assert.deepEqual(parsed.sections.order,['faq','hero','trust','campaigns','how']); assert.equal(parsed.sections.visible.how,false); assert.equal(parsed.sections.visible.hero,true);
  assert.deepEqual([...parsed.sections.order].sort(),[...sectionKeys].sort());
});

test('imagens locais da demonstração sobrevivem à normalização sem truncar o arquivo', () => {
  const image = `data:image/png;base64,${'aGVsbG8='.repeat(3000)}`;
  const parsed = normalizeAppearance({ identity: { logo: image, favicon: image }, hero: { image, title: 'a'.repeat(12000) } });
  assert.equal(parsed.identity.logo, image);
  assert.equal(parsed.identity.favicon, image);
  assert.equal(parsed.hero.image, image);
  assert.equal(parsed.hero.title.length, 10000);
  assert.equal(normalizeAppearance({ hero: { image: `data:image/png;base64,${'A'.repeat(1_500_000)}` } }).hero.image, '');
});
test('listas de dúvidas preservam a exclusão e o salvamento impede itens incompletos', () => {
  const parsed=normalizeAppearance({ faq:{ items:[] } }); assert.deepEqual(parsed.faq.items,[]);
  parsed.faq.items=[{ question:'Como funciona?',answer:'' }]; assert.throws(() => validateAppearance(parsed),/pergunta e a resposta/);
  parsed.sections.visible.faq=false; assert.doesNotThrow(() => validateAppearance(parsed));
  parsed.theme.accent=''; assert.throws(() => validateAppearance(parsed),/#RRGGBB/);
});
test('botões têm contraste automático e o tema é exportado por variáveis permitidas', () => {
  assert.equal(accentContrast('#ffffff'),'#111111'); assert.equal(accentContrast('#000000'),'#ffffff');
  const config=normalizeAppearance({ theme:{ accent:'#000000',background:'#eeeeee' } });
  const css=appearanceStyle(config); assert.equal(css['--site-on-accent'],'#ffffff'); assert.equal(css['--site-bg'],'#eeeeee'); assert.equal(css['--site-accent'],'#000000');
});
