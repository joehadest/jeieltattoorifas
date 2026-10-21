import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, children, onClose, wide = false, brand = 'PAINEL DO ORGANIZADOR' }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; brand?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab') {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]') || []);
        const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal ${wide ? 'modal-wide' : ''}`}><div className="modal-head"><div><span className="eyebrow">{brand}</span><h2 id="modal-title">{title}</h2></div><button type="button" aria-label="Fechar" className="icon-button" onClick={onClose}><X size={21} /></button></div>{children}</div></div>;
}
