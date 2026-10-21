import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Clock3, MessageCircle, ArrowRight, QrCode, Ticket, AlertCircle, RefreshCw } from 'lucide-react';
import Modal from './Modal';
import { money, numberLabel, whatsappNumber, type Campaign, type Order, type Settings } from '../lib/domain';
import { getCustomerProfile, getOwnOrder, isDemo, reserve } from '../lib/api';
import { useAuth } from '../lib/auth';
import AccountAccess from './AccountAccess';
import type { SiteAppearance } from '../lib/appearance';
import { pixPayload } from '../lib/pix';

function PixQR({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (ref.current) QRCode.toCanvas(ref.current, value, { width: 132, margin: 1, errorCorrectionLevel: 'M' }).catch(() => setFailed(true)); }, [value]);
  return failed ? <span className="small muted">Use a chave Pix</span> : <canvas ref={ref} aria-label="QR Code Pix da reserva" role="img" />;
}

export default function Payment({ campaign, numbers, settings, order: initialOrder, onClose, onReserved, onConfigure, copy, preview = false }: { copy: SiteAppearance['checkout']; preview?: boolean; campaign: Campaign; numbers: number[]; settings: Settings; order?: Order; onClose: () => void; onReserved: () => void; onConfigure: () => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const {user,loading:authLoading}=useAuth();
  useEffect(()=>{if(!user||preview)return;let active=true;void getCustomerProfile().then(profile=>{if(active){setName(current=>current||profile.full_name);setPhone(current=>current||profile.phone);}}).catch(()=>{});return()=>{active=false;};},[user,preview]);
  const [order, setOrder] = useState<Order | undefined>(initialOrder);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState('');
  const reservedRef = useRef(onReserved);
  reservedRef.current = onReserved;
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!order?.id || !user || preview) return;
    const id = order.id;
    let active = true;
    let running = false;
    let terminal = false;
    let lastStatus = order.status;
    async function refresh() {
      if (!active || running) return;
      running = true;
      setChecking(true);
      try {
        const result = await getOwnOrder(id);
        if (!active) return;
        setOrder(result);
        if (lastStatus !== result.status) reservedRef.current();
        lastStatus = result.status;
        terminal = result.status !== 'pending';
        setLastChecked(new Date().toLocaleTimeString('pt-BR'));
        setSyncError('');
      } catch {
        if (active) setSyncError('Não foi possível consultar o pagamento. Verifique sua conexão e sua conta e tente novamente.');
      } finally { running = false; if (active) setChecking(false); }
    }
    refreshRef.current = refresh;
    void refresh();
    const interval = setInterval(() => { if (!terminal && document.visibilityState === 'visible') void refresh(); }, 8000);
    const onFocus = () => { if (!terminal && document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { active = false; refreshRef.current = null; clearInterval(interval); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [order?.id, user?.id, preview]);
  const [copied, setCopied] = useState(''); const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const amount = order?.amount ?? Math.round(campaign.price * numbers.length * 100) / 100;
  const recipient = { ...settings, ...order?.payment_snapshot };
  const payload = pixPayload(recipient, amount);
  const destination = whatsappNumber(recipient.whatsapp);
  const ready = !!payload && !!destination && !preview && !!user;
  const remaining = order ? Math.max(0, Math.ceil((Date.parse(order.expires_at) - now) / 1000)) : 1800;
  const expired = !!order && (order.status === 'expired' || (order.status === 'pending' && remaining === 0));
  const paid = order?.status === 'paid';
  const cancelled = order?.status === 'cancelled';
  const canPay = order && !expired && !paid && !cancelled && !!user && (!order.customer_id || order.customer_id === user.id) && !preview;
  async function copyValue(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); } catch { setError('Não foi possível copiar. Selecione a chave Pix abaixo e copie manualmente.'); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (preview) return; setBusy(true); setError('');
    try { const result = await reserve(campaign, numbers, name, phone); setOrder(result); onReserved(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível reservar. Tente novamente.'); } finally { setBusy(false); }
  }
  const message = order ? `Olá! Quero enviar o comprovante da reserva #${order.id.slice(0, 8).toUpperCase()}.\nNome: ${order.customer_name}\nCampanha: ${campaign.title}\nNúmeros: ${order.numbers.map(n => numberLabel(n, campaign.total_numbers)).join(', ')}\nTotal: ${money(order.amount)}\nVou anexar o comprovante nesta conversa.` : '';
  return <Modal title={paid ? 'Seus números estão confirmados!' : expired ? 'Esta reserva expirou' : cancelled ? 'Reserva cancelada' : copy.title} brand={settings.site_name} onClose={onClose}>
    <div className="payment-summary"><div className="round-icon"><Ticket size={21} /></div><div><strong>{campaign.title}</strong><span>{numbers.length} número{numbers.length > 1 ? 's' : ''} selecionado{numbers.length > 1 ? 's' : ''}</span></div><strong className="payment-total">{money(amount)}</strong></div>
    <div className="chosen-numbers">{numbers.map(n => <span key={n}>{numberLabel(n, campaign.total_numbers)}</span>)}</div>
    {preview && <p className="notice">Esta é uma prévia. Nenhuma reserva ou pagamento será realizado.</p>}
    {isDemo && <p className="notice">Demonstração local. Use dados de teste e não efetue pagamentos reais.</p>}
    {error && <p className="error" role="alert"><AlertCircle size={16} />{error}</p>}
    {!order && !preview && (!user || authLoading) ? (authLoading ? <p className="notice">Verificando sua conta...</p> : <AccountAccess compact/>) : !order && <form onSubmit={submit} className="payment-form"><div className="step-label"><span>1</span> Seus dados para a reserva</div><div className="form-grid"><label>{copy.name_label}<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required minLength={3} maxLength={100} placeholder="Como você se chama?" /></label><label>{copy.phone_label}<input value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" type="tel" required placeholder="(11) 99999-9999" /></label></div><button className="button primary full" disabled={!ready || busy}>{busy ? 'Reservando...' : copy.reserve_button}<ArrowRight size={17} /></button><button type="button" className="text-button full" onClick={onClose}>Escolher mais números</button></form>}
    {order && <div className={`reservation-state ${paid ? 'success' : ''}`} role="status"><Clock3 size={17} /><span>{paid ? `Pagamento confirmado${order.paid_at ? ` em ${new Date(order.paid_at).toLocaleString('pt-BR')}` : ''}.` : expired ? 'Prazo encerrado. Não efetue o Pix desta reserva.' : cancelled ? 'Esta reserva foi cancelada. Não efetue o Pix.' : `Reserva #${order.id.slice(0, 8).toUpperCase()} · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} para confirmar`}</span></div>}
    {order && !preview && user && <div className="payment-sync"><span className="small muted">{lastChecked ? `Consultado às ${lastChecked}` : 'Consultando sua reserva...'}{!paid && !cancelled && !expired ? ' · atualiza a cada 8 s' : ''}</span><button className="text-button" disabled={checking} onClick={() => void refreshRef.current?.()}><RefreshCw size={14} />{checking ? 'Consultando...' : 'Verificar status'}</button></div>}
    {syncError && <p className="notice" role="alert">{syncError}</p>}
    {order && !user && !preview && <p className="notice">Entre novamente na sua conta em “Meus números” para acompanhar esta reserva.</p>}
    {!paid && !expired && !cancelled && <><div className="step-label"><span>2</span> {copy.pix_title}</div><div className={`pix-box ${!canPay ? 'pix-preview' : ''}`}><div className="qr">{canPay && payload ? <PixQR value={payload} /> : <QrCode size={64} strokeWidth={1.25} />}</div><div><span className="muted small">{canPay ? 'Escaneie ou copie a chave' : 'Dados de pagamento'}</span><strong className="pix-key">{recipient.pix_key || 'Chave Pix a configurar'}</strong><span className="muted small">{recipient.receiver_name || 'Recebedor a definir'}</span><button className="copy-key" disabled={!canPay || !payload} onClick={() => copyValue(recipient.pix_key, 'key')}>{copied === 'key' ? <Check size={14} /> : <Copy size={14} />}{copied === 'key' ? 'Chave copiada' : 'Copiar chave Pix'}</button></div></div>{canPay && <button className="button secondary full" onClick={() => copyValue(payload, 'payload')}>{copied === 'payload' ? <Check size={16} /> : <Copy size={16} />}{copied === 'payload' ? 'Código copiado!' : 'Copiar Pix com valor'}</button>}
    {!payload || !destination ? <p className="notice">O organizador ainda precisa configurar os dados de pagamento e WhatsApp. <button className="inline-link" onClick={onConfigure}>Abrir configurações</button></p> : null}
    {canPay && destination && <a className="button primary full whatsapp-button" href={`https://wa.me/${destination}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={19} />{copy.whatsapp_button}<ArrowRight size={17} /></a>}
    <p className="payment-footnote">{canPay ? copy.instructions : 'Reserve os números antes de pagar. A confirmação é feita pelo organizador após conferir o comprovante.'}</p></>}
    {(expired || cancelled) && <p className="notice">Se já realizou o pagamento, fale com o organizador antes de reservar novamente.{destination && <a className="text-button" href={`https://wa.me/${destination}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} />Falar sobre esta reserva</a>}</p>}
  </Modal>;
}
