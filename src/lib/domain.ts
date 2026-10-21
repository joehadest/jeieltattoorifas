import type { SiteAppearance } from './appearance.ts';

export interface Campaign {
  id: string; title: string; subtitle: string; category: string; image: string;
  price: number; total_numbers: number; draw_date: string | null;
  number_start?: number;
  status: 'active' | 'paused' | 'finished'; description: string; rules: string;
}
export interface Settings {
  id: number; site_name: string; pix_key: string; receiver_name: string;
  receiver_city: string; whatsapp: string;
  appearance?: SiteAppearance;
}
export interface Order {
  payment_snapshot?: Pick<Settings, 'pix_key' | 'receiver_name' | 'receiver_city' | 'whatsapp'> | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  customer_id?: string | null;
  id: string; access_token: string; campaign_id: string; customer_name: string;
  phone: string; numbers: number[]; amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  created_at: string; expires_at: string;
}
export interface OrderEvent {
  id: string; order_id: string; event_type: 'created' | 'paid' | 'cancelled' | 'expired';
  source: 'system' | 'manual'; occurred_at: string; actor_id: string | null;
}
export interface CustomerProfile { user_id: string; full_name: string; phone: string }
export interface AccountOrder extends Order { campaign: Campaign }
export interface DrawResult {
  id: string; campaign_id: string; winning_number: number; winner_label: string; drawn_at: string;
  eligible_count: number; eligible_numbers: number[]; pool_hash: string; random_sample: number; selected_index: number; method: string;
}
export interface Ticket { campaign_id: string; number: number; status: 'pending' | 'paid'; expires_at: string }
export const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const numberLabel = (n: number, total = 1000) => String(n).padStart(String(total - 1).length, '0');
export const phoneDigits = (phone: string) => phone.replace(/\D/g, '');
export function whatsappNumber(phone: string) {
  const digits = phoneDigits(phone);
  return /^(?:\d{10}|\d{11})$/.test(digits) ? `55${digits}` : /^55\d{10,11}$/.test(digits) ? digits : '';
}
export function validateCampaignActivation(campaign: Campaign) {
  if (campaign.status !== 'active') return;
  const date = campaign.draw_date;
  const validDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    && new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) === date;
  if (!validDate || !campaign.rules.trim()) throw new Error('Defina o regulamento e uma data válida para o sorteio antes de ativar a campanha.');
}
export function validateReservation(campaign: Campaign, numbers: number[], name: string, phone: string, occupied: Ticket[]) {
  if (campaign.status !== 'active') throw new Error('Esta campanha não está recebendo reservas.');
  if (name.trim().length < 3 || name.trim().length > 100) throw new Error('Informe seu nome, com pelo menos 3 caracteres.');
  if (!whatsappNumber(phone)) throw new Error('Informe um WhatsApp válido com DDD.');
  if (!numbers.length || numbers.length > 100 || new Set(numbers).size !== numbers.length) throw new Error('Escolha entre 1 e 100 números diferentes.');
  const start = campaign.number_start ?? 0;
  if (numbers.some(n => !Number.isInteger(n) || n < start || n >= start + campaign.total_numbers)) throw new Error('Número fora dos limites da campanha.');
  if (occupied.some(t => t.campaign_id === campaign.id && numbers.includes(t.number) && (t.status === 'paid' || Date.parse(t.expires_at) > Date.now()))) throw new Error('Um dos números foi reservado. Atualize sua seleção.');
}
export const defaultSettings: Settings = { id: 1, site_name: 'Jeiel Tattoo', pix_key: 'jeiellimeira36@gmail.com', receiver_name: '', receiver_city: 'Alto do Rodrigues', whatsapp: '558499540402' };
const rules = 'Prêmio informado na arte: uma tattoo no valor de R$ 1.000,00 ou R$ 500,00 no Pix. São 100 números, de 01 a 100, por R$ 30,00 cada. A arte informa sorteio em 29/12; o ano, a forma de apuração e as condições de realização da tattoo precisam ser confirmados pelo organizador antes da ativação. O pagamento é confirmado manualmente após a conferência do comprovante. Reservas sem confirmação expiram em 30 minutos.';
export const demoCampaigns: Campaign[] = [
  { id: '00000000-0000-4000-a000-000000000004', title: 'Rifa Tattoo', subtitle: 'Uma tattoo de R$ 1.000 ou R$ 500 no Pix.', category: 'Tattoo', image: '/images/rifa-tattoo-jeiel.jpeg', price: 30, total_numbers: 100, number_start: 1, draw_date: null, status: 'active', description: 'Seu próximo traço pode começar aqui. Concorra a uma tattoo no valor de R$ 1.000,00 ou escolha R$ 500,00 no Pix. Cada número custa R$ 30,00. Atendimento em Alto do Rodrigues/RN. A arte informa sorteio em 29/12; ano a confirmar.', rules },
];
