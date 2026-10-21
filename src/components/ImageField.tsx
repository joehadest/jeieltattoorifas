import { useRef, useState } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';
import { uploadSiteImage, isDemo } from '../lib/api';
import { isSafeImageUrl } from '../lib/appearance';

export default function ImageField({ label, value, onChange, onPending, help }: {
  label: string; value: string; onChange: (value:string) => void; onPending?: (delta:number) => void; help?:string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [broken,setBroken] = useState('');
  async function upload(file?:File) {
    if (!file) return;
    setBusy(true); setError(''); onPending?.(1);
    try { onChange(await uploadSiteImage(file)); setBroken(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar a imagem.'); }
    finally { setBusy(false); onPending?.(-1); if (input.current) input.current.value=''; }
  }
  return <div className="image-field"><label>{label}<input value={value.startsWith('data:') ? '' : value} onChange={e => { onChange(e.target.value); setBroken(''); }} placeholder="https://... ou /images/arquivo.png" maxLength={2048} disabled={busy} aria-label={`Endereço de ${label.toLowerCase()}`} /></label>
    <div className="image-field-row"><div className="image-field-preview">{value && isSafeImageUrl(value) && broken !== value ? <img src={value} alt={`Prévia de ${label.toLowerCase()}`} onError={() => setBroken(value)} /> : <ImagePlus size={25} />}</div><div className="image-field-actions"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/avif" hidden onChange={e => void upload(e.target.files?.[0])} aria-label={`Arquivo de ${label.toLowerCase()}`} /><button type="button" className="button secondary" disabled={busy} onClick={() => input.current?.click()}><Upload size={15} />{busy ? 'Enviando...' : `Enviar ${label.toLowerCase()}`}</button>{value && <button type="button" className="text-button" disabled={busy} onClick={() => onChange('')}><X size={13} />Remover</button>}<span className="field-help">PNG, JPG, WebP ou AVIF · até {isDemo ? '1' : '5'} MB</span></div></div>
    {help && <p className="field-help">{help}</p>}{error && <p className="error" role="alert">{error}</p>}
  </div>;
}
