import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Campaign, Order } from '../lib/domain';

export function Brand({ name, logo = '', width = 160, alt = '' }: { name: string; logo?: string; width?: number; alt?: string }) {
  const [failed,setFailed] = useState(false);
  useEffect(() => setFailed(false),[logo]);
  if (logo && !failed) return <span className="brand"><img className="custom-logo" src={logo} width={width} style={{ width }} alt={alt || name} onError={() => setFailed(true)} /></span>;
  return <span className="brand tattoo-brand"><span className="brand-mark"><Sparkles size={24} strokeWidth={1.2} /></span><span className="brand-name"><span>{name.split(' ').slice(0,-1).join(' ') || name}</span>{name.includes(' ') && <b>{name.split(' ').at(-1)}</b>}</span></span>;
}
export function SafeImage({ src, alt, className = '', eager = false, fit }: { src: string; alt: string; className?: string; eager?: boolean; fit?: 'contain' | 'cover' }) {
  return <img key={src} className={className} src={src} alt={alt} style={fit ? { objectFit:fit } : undefined} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} onError={e => { const image = e.currentTarget; if (!image.dataset.fallback) { image.dataset.fallback = 'true'; image.src = '/images/fallback.svg'; } }} />;
}
export function StatusBadge({ status }: { status: Order['status'] | Campaign['status'] }) {
  const labels = { pending:'Aguardando Pix', paid:'Confirmado', expired:'Expirado', cancelled:'Cancelado', active:'Ativa', paused:'Pausada', finished:'Encerrada' };
  return <span className={`status-badge status-${status}`}><span />{labels[status]}</span>;
}
