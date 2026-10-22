import { useEffect,useRef,useState } from 'react';
import { Check,Save,Upload,UserRound,X } from 'lucide-react';
import { isDemo } from '../lib/api';
import { saveAdminPhoto,type AdminPhoto } from '../lib/admin-profile';

export function AdminPhotoImage({src}:{src:string}){
  const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
  return src&&!failed?<img src={src} alt="Foto de perfil do administrador" onError={()=>setFailed(true)}/>:<UserRound aria-hidden="true" size={22}/>;
}
export default function AdminProfile({photo,loading,loadError}:{photo:AdminPhoto;loading:boolean;loadError:string}){
  const input=useRef<HTMLInputElement>(null);const [file,setFile]=useState<File|null>(null);const [preview,setPreview]=useState('');const [remove,setRemove]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  useEffect(()=>{if(!file){setPreview('');return;}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  const shown=remove?'':preview||photo.avatar_url;const dirty=!!file||remove;
  function choose(next?:File){
    setError('');setMessage('');if(!next)return;
    if(!['image/png','image/jpeg','image/webp','image/avif'].includes(next.type)){setError('Escolha uma imagem PNG, JPG, WebP ou AVIF.');return;}
    if(!next.size||next.size>(isDemo?1000000:2000000)){setError(isDemo?'Na demonstração, use uma imagem de até 1 MB.':'Escolha uma imagem de até 2 MB.');return;}
    setRemove(false);setFile(next);
  }
  async function save(event:React.FormEvent){
    event.preventDefault();if(!dirty||busy)return;setBusy(true);setError('');setMessage('');
    try{await saveAdminPhoto(remove?null:file);setFile(null);setRemove(false);if(input.current)input.current.value='';setMessage('Foto de perfil atualizada.');}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar sua foto.');}finally{setBusy(false);}
  }
  return <section className="panel admin-profile-panel"><div><span className="eyebrow muted">SUA CONTA NO PAINEL</span><h2>Foto de perfil</h2><p>Personalize a imagem que aparece no cabeçalho e na barra lateral. Cada administrador tem a própria foto.</p></div><form onSubmit={save}><div className="admin-profile-photo"><AdminPhotoImage src={shown}/></div><div className="admin-profile-fields"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/avif" hidden aria-label="Arquivo da foto de perfil" disabled={busy} onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/><div className="admin-profile-actions"><button type="button" className="button secondary" disabled={busy||loading} onClick={()=>input.current?.click()}><Upload size={16}/>{shown?'Trocar foto':'Escolher foto'}</button>{shown&&<button type="button" className="text-button" disabled={busy||loading} onClick={()=>{setFile(null);setRemove(true);setError('');setMessage('');}}><X size={15}/>Remover foto</button>}</div><p className="small muted">PNG, JPG, WebP ou AVIF · até {isDemo?'1':'2'} MB. Prefira uma imagem quadrada; ela será exibida em um círculo.</p><p className="small muted">Sua foto fica restrita à sua conta administrativa.</p>{dirty&&<p className="small muted">Clique em salvar para aplicar a alteração.</p>}</div><div className="admin-profile-feedback">{(error||loadError)&&<p className="error" role="alert">{error||loadError}</p>}{message&&<p className="success-message" role="status"><Check size={16}/>{message}</p>}<button className="button primary" disabled={busy||loading||!dirty}><Save size={16}/>{busy?'Salvando...':'Salvar foto'}</button></div></form></section>;
}
