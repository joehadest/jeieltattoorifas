import { createClient } from '@supabase/supabase-js';
import { defaultSettings, demoCampaigns, validateReservation, type Campaign, type Order, type Settings, type Ticket } from './domain';
import { normalizeAppearance, validateAppearance, type SiteAppearance } from './appearance';
import type { AccountOrder, CustomerProfile, DrawResult } from './domain';
import { secureDrawIndex } from './draw';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const demoMode=import.meta.env.MODE==='demo'||import.meta.env.MODE==='qa';
export const supabase = !demoMode && url && key ? createClient(url, key) : null;
export const isDemo = !supabase;
const STORAGE = 'jeiel-tattoo-demo-v2';
export function resetDemo() {
  if (supabase) throw new Error('Disponível somente em demonstração.');
  localStorage.removeItem(STORAGE);
  localStorage.removeItem('rifaclub-receipts');
}
interface DemoData { campaigns: Campaign[]; settings: Settings; orders: Order[]; profiles?: CustomerProfile[]; draws?: DrawResult[] }
export const DEMO_CUSTOMER_SESSION = 'jeiel-demo-customer';
function read(): DemoData {
  try { const saved = localStorage.getItem(STORAGE); if (saved) return JSON.parse(saved); } catch { /* Use defaults when storage is unavailable. */ }
  return { campaigns: demoCampaigns, settings: defaultSettings, orders: [] };
}
function write(data: DemoData) { localStorage.setItem(STORAGE, JSON.stringify(data)); }
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
export async function loadPublic() {
  if (!supabase) { const data = read(); return { campaigns: data.campaigns, settings: data.settings }; }
  const [campaigns, settings] = await Promise.all([supabase.from('campaigns').select('*').order('created_at'), supabase.from('site_settings').select('*').eq('id', 1).single()]);
  check(campaigns.error); check(settings.error);
  return { campaigns: campaigns.data as Campaign[], settings: settings.data as Settings };
}
export async function loadTickets(campaignId: string): Promise<Ticket[]> {
  if (!supabase) return read().orders.filter(o => o.campaign_id === campaignId && (o.status === 'paid' || (o.status === 'pending' && Date.parse(o.expires_at) > Date.now()))).flatMap(o => o.numbers.map(number => ({ campaign_id: o.campaign_id, number, status: o.status as 'pending' | 'paid', expires_at: o.expires_at })));
  const { data, error } = await supabase.rpc('get_campaign_tickets', { p_campaign_id: campaignId }); check(error); return data || [];
}
export async function reserve(campaign: Campaign, numbers: number[], name: string, phone: string): Promise<Order> {
  const customer = await requireCustomer();
  if (supabase) {
    const { data, error } = await supabase.rpc('reserve_order', { p_campaign_id: campaign.id, p_numbers: numbers, p_name: name.trim(), p_phone: phone }); check(error);
    return data as Order;
  }
  const execute = async () => {
    const occupied = await loadTickets(campaign.id);
    const data = read();
    const current = data.campaigns.find(c => c.id === campaign.id);
    if (!current) throw new Error('Campanha não encontrada.');
    validateReservation(current, numbers, name, phone, occupied);
    const order: Order = { id: crypto.randomUUID(), access_token: crypto.randomUUID(), customer_id:customer.id, campaign_id: current.id, customer_name: name.trim(), phone: phone.replace(/\D/g, ''), numbers: [...numbers].sort((a,b) => a-b), amount: Math.round(current.price * numbers.length * 100) / 100, status: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 60_000).toISOString() };
    data.orders.push(order); write(data); return order;
  };
  return navigator.locks ? navigator.locks.request('rifaclub-reserve', execute) : execute();
}
interface Receipt { id: string; access_token: string }
export async function myOrders(): Promise<Order[]> {
  return getAccountOrders();
}
export async function adminOrders(): Promise<Order[]> {
  if (!supabase) return read().orders.map(expireOrder).reverse();
  const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }); check(error);
  return (data as Order[]).map(o => ({ ...o, status: o.status === 'pending' && Date.parse(o.expires_at) <= Date.now() ? 'expired' : o.status }));
}
export async function setOrderStatus(id: string, status: 'paid' | 'cancelled') {
  if (supabase) { const { error } = await supabase.rpc('admin_order_status', { p_order_id: id, p_status: status }); check(error); return; }
  await navigator.locks.request('rifaclub-reserve', async () => {
    const data = read(); const order = data.orders.find(o => o.id === id);
    if (order && data.draws?.some(draw => draw.campaign_id===order.campaign_id)) throw new Error('Esta campanha já foi sorteada.');
    if (!order || order.status !== 'pending' || Date.parse(order.expires_at) <= Date.now()) throw new Error('Esta reserva expirou ou já foi processada.');
    order.status = status; write(data);
  });
}
export async function saveSettings(settings: Settings) {
  const { id, site_name, pix_key, receiver_name, receiver_city, whatsapp } = settings;
  const paymentSettings = { id, site_name, pix_key, receiver_name, receiver_city, whatsapp };
  if (!supabase) { const data = read(); data.settings = { ...data.settings, ...paymentSettings }; write(data); return; }
  const { error } = await supabase.from('site_settings').update(paymentSettings).eq('id', 1).select('id').single(); check(error);
}
export async function saveAppearance(siteName: string, appearance: SiteAppearance) {
  if (siteName.trim().length < 2 || siteName.trim().length > 50) throw new Error('O nome do site deve ter entre 2 e 50 caracteres.');
  validateAppearance(appearance);
  const changes = { site_name: siteName.trim(), appearance: normalizeAppearance(appearance) };
  if (!supabase) {
    const data = read(); data.settings = { ...data.settings, ...changes };
    try { write(data); } catch { throw new Error('O navegador ficou sem espaço para as imagens. Use arquivos menores ou URLs.'); }
  } else {
    const { error } = await supabase.from('site_settings').update(changes).eq('id', 1).select('id').single();
    if (error?.code === 'PGRST204' || error?.code === '42703') throw new Error('A personalização ainda precisa ser habilitada no Supabase com o arquivo SQL de atualização do projeto.');
    check(error);
  }
  window.dispatchEvent(new Event('site-settings-updated'));
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('site-settings') : null;
  channel?.postMessage('updated'); channel?.close();
}
export async function uploadSiteImage(file: File): Promise<string> {
  const extensions: Record<string,string> = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/avif':'avif' };
  if (!extensions[file.type]) throw new Error('Escolha uma imagem PNG, JPG, WebP ou AVIF.');
  if (!file.size || file.size > (isDemo ? 1_000_000 : 5_000_000)) throw new Error(isDemo ? 'Na demonstração, escolha uma imagem de até 1 MB.' : 'Escolha uma imagem de até 5 MB.');
  try { const image = await createImageBitmap(file); image.close(); } catch { throw new Error('Não foi possível abrir essa imagem. Confira o arquivo e tente novamente.'); }
  if (!supabase) return new Promise((resolve,reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(file);
  });
  const path = `branding/${crypto.randomUUID()}.${extensions[file.type]}`;
  const { error } = await supabase.storage.from('site-assets').upload(path,file,{ cacheControl:'3600', upsert:false, contentType:file.type });
  if (error) throw new Error('Não foi possível enviar a imagem. Confira sua sessão e se o armazenamento de imagens foi habilitado no Supabase.');
  return supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
}
export async function saveCampaign(campaign: Campaign) {
  if (!supabase) {
    await navigator.locks.request('rifaclub-reserve', async () => {
      const data = read(); const existing = data.campaigns.find(c => c.id === campaign.id);
      if (data.draws?.some(draw => draw.campaign_id===campaign.id)) throw new Error('Esta campanha já foi sorteada e não pode ser alterada.');
      if (existing && data.orders.some(o => o.campaign_id === campaign.id) && (existing.price !== campaign.price || existing.total_numbers !== campaign.total_numbers || (existing.number_start ?? 0) !== (campaign.number_start ?? 0))) throw new Error('Preço, quantidade e início da numeração não podem ser alterados após receber pedidos.');
      const index = data.campaigns.findIndex(c => c.id === campaign.id);
      if (index >= 0) data.campaigns[index] = campaign; else data.campaigns.push(campaign); write(data);
    }); return;
  }
  const { error } = await supabase.from('campaigns').upsert(campaign); check(error);
}
export async function isAdmin() {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('is_admin'); check(error); return data === true;
}

function expireOrder<T extends Order>(order:T):T {
  return { ...order,status:order.status==='pending' && Date.parse(order.expires_at)<=Date.now() ? 'expired' : order.status };
}
async function requireCustomer() {
  if (!supabase) {
    if (!sessionStorage.getItem(DEMO_CUSTOMER_SESSION)) throw new Error('Entre na sua conta para continuar.');
    return { id:'00000000-0000-4000-a000-000000000099',user_metadata:{ full_name:'Participante de demonstração',phone:'' } };
  }
  const { data,error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Entre na sua conta para continuar.');
  return data.user;
}
export async function getCustomerProfile():Promise<CustomerProfile> {
  const user = await requireCustomer();
  if (!supabase) return read().profiles?.find(profile => profile.user_id===user.id) || { user_id:user.id,full_name:'Participante de demonstração',phone:'' };
  const { data,error } = await supabase.from('customer_profiles').select('*').eq('user_id',user.id).maybeSingle(); check(error);
  return data || { user_id:user.id,full_name:String(user.user_metadata.full_name||'').slice(0,100),phone:String(user.user_metadata.phone||'').slice(0,25) };
}
export async function saveCustomerProfile(fullName:string,phone:string) {
  const user=await requireCustomer();
  if (fullName.trim().length<3 || fullName.trim().length>100) throw new Error('Informe seu nome completo.');
  const digits=phone.replace(/\D/g,''); const normalized=digits.length===10 || digits.length===11 ? `55${digits}` : digits;
  if (!/^55\d{10,11}$/.test(normalized)) throw new Error('Informe um WhatsApp com DDD.');
  const profile={ user_id:user.id,full_name:fullName.trim(),phone:normalized,updated_at:new Date().toISOString() };
  if (!supabase) { const data=read(); data.profiles=[...(data.profiles||[]).filter(item => item.user_id!==user.id),profile]; write(data); return; }
  const { error } = await supabase.from('customer_profiles').upsert(profile); check(error);
}
export async function getAccountOrders():Promise<AccountOrder[]> {
  const user=await requireCustomer();
  if (!supabase) {
    const data=read(); return data.orders.filter(order => order.customer_id===user.id).map(order => ({ ...expireOrder(order),campaign:data.campaigns.find(c => c.id===order.campaign_id)! })).filter(order => !!order.campaign).reverse();
  }
  const { data,error } = await supabase.rpc('get_account_orders'); check(error); return data || [];
}
function legacyReceipts():Receipt[] {
  try { const data=JSON.parse(localStorage.getItem('rifaclub-receipts')||'[]'); return Array.isArray(data) ? data.filter(item => typeof item?.id==='string' && typeof item?.access_token==='string') : []; } catch { return []; }
}
export function legacyReceiptCount(knownIds:string[]) { return legacyReceipts().filter(receipt => !knownIds.includes(receipt.id)).length; }
export async function claimLegacyOrders(knownIds:string[]) {
  const user=await requireCustomer(); let count=0;
  const receipts=legacyReceipts().filter(receipt => !knownIds.includes(receipt.id));
  for (const receipt of receipts) {
    if (supabase) {
      const { error }=await supabase.rpc('claim_legacy_order',{ p_order_id:receipt.id,p_access_token:receipt.access_token });
      if (error) continue;
    } else {
      const data=read(); const order=data.orders.find(item => item.id===receipt.id && item.access_token===receipt.access_token && (!item.customer_id || item.customer_id===user.id));
      if (!order) continue; order.customer_id=user.id; order.access_token=crypto.randomUUID(); write(data);
    }
    count++;
    localStorage.setItem('rifaclub-receipts',JSON.stringify(legacyReceipts().filter(item => item.id!==receipt.id)));
  }
  return { count,failed:receipts.length-count };
}
export async function loadDraws(campaignId?:string):Promise<DrawResult[]> {
  if (!supabase) return (read().draws||[]).filter(draw => !campaignId || draw.campaign_id===campaignId);
  const { data,error }=await supabase.rpc('get_draw_results',{ p_campaign_id:campaignId||null }); check(error); return data||[];
}
export async function drawCampaign(campaignId:string):Promise<DrawResult> {
  if (supabase) { const { data,error }=await supabase.rpc('admin_draw_campaign',{ p_campaign_id:campaignId }); check(error); return data; }
  return navigator.locks.request('rifaclub-reserve',async () => {
    const data=read(); const campaign=data.campaigns.find(c => c.id===campaignId);
    if (!campaign || campaign.status==='finished' || data.draws?.some(draw => draw.campaign_id===campaignId)) throw new Error('Esta campanha não pode ser sorteada novamente.');
    if (!campaign.draw_date || campaign.draw_date>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})) throw new Error('Aguarde a data cadastrada para o sorteio.');
    if (!campaign.rules.trim()) throw new Error('Cadastre o regulamento antes de sortear.');
    if (data.orders.some(order => order.campaign_id===campaignId && expireOrder(order).status==='pending')) throw new Error('Confira as reservas pendentes antes de sortear.');
    const paid=data.orders.filter(order => order.campaign_id===campaignId && order.status==='paid');
    const pool=paid.flatMap(order => order.numbers).sort((a,b)=>a-b);
    if (!pool.length) throw new Error('Não há números com pagamento confirmado para sortear.');
    const { index,sample }=secureDrawIndex(pool.length); const number=pool[index];
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pool.join(',')));
    const draw:DrawResult={ id:crypto.randomUUID(),campaign_id:campaignId,winning_number:number,winner_label:`${paid.find(order => order.numbers.includes(number))!.customer_name.slice(0,1)}***`,drawn_at:new Date().toISOString(),eligible_count:pool.length,eligible_numbers:pool,pool_hash:Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join(''),random_sample:sample,selected_index:index+1,method:'demo-webcrypto-rejection-v1' };
    campaign.status='finished'; data.draws=[...(data.draws||[]),draw]; write(data); return draw;
  });
}
