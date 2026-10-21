export const sectionKeys = ['hero', 'trust', 'campaigns', 'how', 'faq'] as const;
export type SectionKey = typeof sectionKeys[number];
export const sectionLabels: Record<SectionKey, string> = {
  hero: 'Destaque principal', trust: 'Faixa de benefícios', campaigns: 'Campanhas', how: 'Como participar', faq: 'Perguntas frequentes',
};
export const fontOptions = ['DM Sans', 'Space Grotesk', 'Georgia'] as const;
export interface SiteAppearance {
  identity: { logo: string; logo_width: number; favicon: string; logo_alt: string };
  theme: { accent: string; background: string; surface: string; text: string; muted: string; border: string; font: string; heading_font: string; radius: number };
  header: { announcement_enabled: boolean; announcement: string; side_text: string; campaigns_label: string; how_label: string; faq_label: string; results_label: string; orders_label: string };
  hero: { eyebrow: string; title: string; highlight: string; description: string; button: string; caption: string; caption_emphasis: string; image: string; image_alt: string; image_fit: 'contain' | 'cover'; badge: string; side_text: string; credit: string; featured_id: string; empty_title: string; empty_text: string };
  campaigns: { eyebrow: string; title: string; search: string; button: string; footnote: string };
  how: { eyebrow: string; title: string; description: string; steps: Array<{ title: string; text: string }> };
  faq: { eyebrow: string; title: string; description: string; items: Array<{ question: string; answer: string }> };
  trust: string[];
  footer: { tagline: string; location: string; copyright: string; privacy_label: string; terms_label: string; privacy_text: string; terms_text: string; notice: string };
  checkout: { title: string; name_label: string; phone_label: string; reserve_button: string; pix_title: string; whatsapp_button: string; instructions: string };
  details: { back: string; eyebrow: string; title: string; rules_title: string; art_caption: string; continue_button: string };
  meta: { title: string; description: string };
  sections: { order: SectionKey[]; visible: Record<SectionKey, boolean> };
}
export const defaultAppearance: SiteAppearance = {
  identity: { logo: '', logo_width: 160, favicon: '/favicon.svg', logo_alt: 'Logo do organizador' },
  theme: { accent: '#e7bd35', background: '#101010', surface: '#191919', text: '#f1f0eb', muted: '#a5a196', border: '#34322c', font: 'DM Sans', heading_font: 'Space Grotesk', radius: 8 },
  header: { announcement_enabled: true, announcement: 'JEIEL TATTOO · ALTO DO RODRIGUES / RN', side_text: 'Arte que fica na pele', campaigns_label: 'Campanhas', how_label: 'Como participar', faq_label: 'Dúvidas', results_label: 'Resultados', orders_label: 'Meus números' },
  hero: { eyebrow: 'SEU PRÓXIMO TRAÇO COMEÇA AQUI', title: 'Uma tattoo.\nA sua história.', highlight: 'O seu número.', description: 'Concorra a uma tattoo de R$ 1.000\nou escolha R$ 500 no Pix. Cada número, R$ 30.', button: 'Escolher meu número', caption: '100 números, de 01 a 100.', caption_emphasis: 'Uma nova história na pele.', image: '', image_alt: 'Arte da campanha em destaque', image_fit: 'contain', badge: 'RIFA TATTOO', side_text: 'JEIEL TATTOO · ARTE AUTORAL', credit: 'Arte enviada pelo organizador', featured_id: '', empty_title: 'Novas possibilidades vêm aí.', empty_text: 'Em breve, novas campanhas por aqui.' },
  campaigns: { eyebrow: 'RIFA JEIEL TATTOO', title: 'Um número. Um novo traço.', search: 'Buscar campanha', button: 'Participar', footnote: 'Confira o regulamento de cada campanha antes de participar.' },
  how: { eyebrow: 'SEM COMPLICAÇÃO', title: 'Da escolha ao Pix.\nÉ simples assim.', description: 'Você está a poucos passos\nda sua próxima possibilidade.', steps: [
    { title: 'Encontre seu prêmio', text: 'Escolha uma campanha e selecione os números que combinam com você.' },
    { title: 'Reserve e faça o Pix', text: 'Preencha seus dados e pague usando a chave Pix do organizador.' },
    { title: 'Envie o comprovante', text: 'Abra o WhatsApp, anexe o comprovante e aguarde a confirmação.' },
  ] },
  faq: { eyebrow: 'TUDO ÀS CLARAS', title: 'Ficou com alguma dúvida?', description: 'A gente te ajuda a dar o próximo passo.', items: [
    { question: 'Como meus números são confirmados?', answer: 'Depois de reservar, faça o Pix e envie o comprovante pelo WhatsApp indicado na campanha. O organizador confere o pagamento e confirma seus números no painel. Abrir o WhatsApp não confirma o pagamento automaticamente.' },
    { question: 'Por quanto tempo meus números ficam reservados?', answer: 'A reserva dura 30 minutos. Sem confirmação, os números voltam a ficar disponíveis. Se você já pagou e a reserva expirou, fale com o organizador antes de pagar novamente.' },
    { question: 'Onde acompanho a minha participação?', answer: 'Entre na sua conta em “Meus números” para consultar suas reservas, os números confirmados e os resultados em qualquer dispositivo. Reservas antigas deste navegador podem ser vinculadas à conta pelo comprovante de acesso.' },
    { question: 'Quando e como acontece o sorteio?', answer: 'Na data cadastrada, o organizador realiza o sorteio no próprio site entre os números com pagamento confirmado. Cada número confirmado tem a mesma chance. O resultado e o registro do conjunto participante ficam disponíveis na campanha e em Resultados.' },
  ] },
  trust: ['Pix direto ao organizador', 'Você escolhe seus números', 'Atendimento pelo WhatsApp', 'Simples do início ao fim'],
  footer: { tagline: 'Sua pele. Sua história. Seu próximo traço.', location: 'Alto do Rodrigues / RN', copyright: 'Todos os direitos reservados.', privacy_label: 'Privacidade', terms_label: 'Termos de participação', privacy_text: 'Nome, e-mail e WhatsApp identificam sua conta e suas reservas e permitem o atendimento. Com Supabase configurado, os dados ficam no projeto do organizador e cada participante consulta somente suas próprias reservas. A autenticação e as senhas são gerenciadas pelo Supabase Auth. Nos resultados públicos aparecem o número sorteado e o nome abreviado do ganhador. Em demonstração, os dados ficam apenas neste navegador.', terms_text: 'As condições de participação, o prêmio, a data, a forma de apuração e a entrega são definidos pelo organizador no regulamento de cada campanha. O pagamento é conferido manualmente. Consulte o regulamento antes de reservar.', notice: 'Os dados do responsável e os textos finais serão definidos pelo organizador antes da publicação comercial.' },
  checkout: { title: 'Falta pouco para participar.', name_label: 'Nome completo', phone_label: 'WhatsApp com DDD', reserve_button: 'Reservar meus números', pix_title: 'Faça o Pix e envie o comprovante', whatsapp_button: 'Enviar comprovante no WhatsApp', instructions: 'O WhatsApp abrirá com os dados da reserva. Anexe o comprovante na conversa; o organizador fará a confirmação no painel.' },
  details: { back: 'Todas as campanhas', eyebrow: 'FAÇA A SUA ESCOLHA', title: 'Qual é o seu número da sorte?', rules_title: 'Informações e regulamento', art_caption: 'Arte de divulgação · reserve na grade abaixo', continue_button: 'Continuar com Pix' },
  meta: { title: '{site_name} — Sua próxima tattoo começa aqui', description: 'Rifa Jeiel Tattoo: concorra a uma tattoo de R$ 1.000 ou R$ 500 no Pix. São 100 números por R$ 30 cada.' },
  sections: { order: [...sectionKeys], visible: { hero: true, trust: true, campaigns: true, how: true, faq: true } },
};

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function isSafeImageUrl(value: string) {
  if (!value) return true;
  if (value.startsWith('/') && !value.startsWith('//') && !/[\\\u0000-\u001f]/.test(value)) return true;
  if (/^data:image\/(png|jpeg|webp|avif);base64,[a-zA-Z0-9+/=]+$/.test(value)) return value.length <= 1_500_000;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
/** A strict allowlist keeps arbitrary HTML, CSS and unknown JSON keys out of the page. */
export function normalizeAppearance(value: unknown): SiteAppearance {
  const imagePaths = new Set(['identity.logo', 'identity.favicon', 'hero.image']);
  function merge(base: unknown, incoming: unknown, path = ''): unknown {
    if (typeof base === 'string') {
      if (typeof incoming !== 'string') return base;
      if (imagePaths.has(path)) return incoming.length <= 1_500_000 ? incoming : base;
      return incoming.slice(0, 10000);
    }
    if (typeof base === 'number') return typeof incoming === 'number' && Number.isFinite(incoming) ? incoming : base;
    if (typeof base === 'boolean') return typeof incoming === 'boolean' ? incoming : base;
    if (Array.isArray(base)) {
      if (!Array.isArray(incoming)) return structuredClone(base);
      return incoming.slice(0, 30).map(item => merge(base[0], item, path));
    }
    if (record(base)) return Object.fromEntries(Object.entries(base).map(([key, fallback]) => [key, merge(fallback, record(incoming) ? incoming[key] : undefined, path ? `${path}.${key}` : key)]));
    return base;
  }
  const result = merge(defaultAppearance, value) as SiteAppearance;
  for (const key of ['accent','background','surface','text','muted','border'] as const) if (!/^#[0-9a-f]{6}$/i.test(result.theme[key])) result.theme[key] = defaultAppearance.theme[key];
  for (const key of ['font','heading_font'] as const) if (!(fontOptions as readonly string[]).includes(result.theme[key])) result.theme[key] = defaultAppearance.theme[key];
  for (const key of ['logo','favicon'] as const) if (!isSafeImageUrl(result.identity[key])) result.identity[key] = defaultAppearance.identity[key];
  if (!isSafeImageUrl(result.hero.image)) result.hero.image = '';
  result.identity.logo_width = Math.round(Math.min(280,Math.max(60,result.identity.logo_width)));
  result.theme.radius = Math.round(Math.min(24,Math.max(0,result.theme.radius)));
  result.hero.image_fit = result.hero.image_fit === 'cover' ? 'cover' : 'contain';
  result.sections.order = [...new Set([...result.sections.order.filter(key => sectionKeys.includes(key)), ...sectionKeys])];
  result.how.steps = result.how.steps.slice(0,6);
  result.faq.items = result.faq.items.slice(0,20);
  result.trust = result.trust.slice(0,6);
  return result;
}
export function validateAppearance(value: SiteAppearance) {
  if (!value.meta.title.trim() || !value.hero.title.trim()) throw new Error('Preencha o título da página e o título do destaque.');
  for (const image of [value.identity.logo,value.identity.favicon,value.hero.image]) if (!isSafeImageUrl(image)) throw new Error('Use uma imagem enviada pelo painel, um endereço HTTPS ou um caminho local.');
  for (const color of [value.theme.accent,value.theme.background,value.theme.surface,value.theme.text,value.theme.muted,value.theme.border]) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Use cores no formato #RRGGBB.');
  if (value.sections.visible.faq && value.faq.items.some(item => !item.question.trim() || !item.answer.trim())) throw new Error('Preencha a pergunta e a resposta de cada item de dúvidas.');
  if (value.sections.visible.how && value.how.steps.some(item => !item.title.trim() || !item.text.trim())) throw new Error('Preencha o título e a descrição de cada passo.');
  if (JSON.stringify(value).length > 1_500_000) throw new Error('As imagens da demonstração estão muito grandes. Use arquivos menores ou URLs.');
}
export function accentContrast(color: string) {
  const rgb = [1,3,5].map(i => parseInt(color.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722 > .179 ? '#111111' : '#ffffff';
}
export function appearanceStyle(appearance: SiteAppearance): Record<string,string> {
  const theme = appearance.theme;
  return { '--lime':theme.accent, '--site-accent':theme.accent, '--site-on-accent':accentContrast(theme.accent), '--site-bg':theme.background, '--site-surface':theme.surface, '--site-text':theme.text, '--site-muted':theme.muted, '--site-border':theme.border, '--site-font':`"${theme.font}", sans-serif`, '--site-heading':`"${theme.heading_font}", serif`, '--site-radius':`${theme.radius}px` };
}
