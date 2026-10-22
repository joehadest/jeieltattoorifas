import { useCallback,useEffect,useState } from 'react';
import { isDemo,supabase } from './api';
import { useAuth } from './auth';

export interface AdminPhoto {avatar_path:string;avatar_url:string}
const empty:AdminPhoto={avatar_path:'',avatar_url:''};
const DEMO_KEY='jeiel-demo-admin-photo-v1';
const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif'};
function check(error:{message:string;code?:string}|null){
  if(error)throw new Error(error.code==='42P01'||error.code==='PGRST205'?'A foto de perfil precisa da atualização do banco.':error.message);
}
async function currentUser(){
  if(!supabase)throw new Error('Conexão indisponível.');
  const {data,error}=await supabase.auth.getUser();if(error||!data.user)throw new Error('Entre novamente no painel.');return data.user;
}
export async function loadAdminPhoto():Promise<AdminPhoto>{
  if(!supabase)return {avatar_path:'',avatar_url:localStorage.getItem(DEMO_KEY)||''};
  const user=await currentUser();
  const {data,error}=await supabase.from('admin_profiles').select('avatar_path').eq('user_id',user.id).maybeSingle();check(error);
  if(!data?.avatar_path)return {...empty};
  const photo=await supabase.storage.from('admin-avatars').download(data.avatar_path);
  if(photo.error||!photo.data)throw new Error('Não foi possível carregar sua foto de perfil.');
  return {avatar_path:data.avatar_path,avatar_url:URL.createObjectURL(photo.data)};
}
export async function saveAdminPhoto(file:File|null){
  if(file){
    if(!extensions[file.type])throw new Error('Escolha uma imagem PNG, JPG, WebP ou AVIF.');
    if(!file.size||file.size>(isDemo?1000000:2000000))throw new Error(isDemo?'Na demonstração, use uma imagem de até 1 MB.':'Escolha uma imagem de até 2 MB.');
    try{const image=await createImageBitmap(file);image.close();}catch{throw new Error('Não foi possível abrir essa imagem. Escolha outro arquivo.');}
  }
  if(!supabase){
    if(!file)localStorage.removeItem(DEMO_KEY);
    else{
      const value=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Não foi possível ler a foto.'));reader.readAsDataURL(file);});
      try{localStorage.setItem(DEMO_KEY,value);}catch{throw new Error('O navegador ficou sem espaço. Escolha uma foto menor.');}
    }
  }else{
    const user=await currentUser();let path='';
    if(file){
      path=`${user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
      const result=await supabase.storage.from('admin-avatars').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
      if(result.error)throw new Error('Não foi possível enviar a foto. Confira sua sessão e tente novamente.');
    }
    const {error}=await supabase.from('admin_profiles').upsert({user_id:user.id,avatar_path:path,updated_at:new Date().toISOString()}).select('user_id').single();check(error);
  }
  window.dispatchEvent(new Event('admin-profile-updated'));
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('admin-profile'):null;channel?.postMessage('updated');channel?.close();
}
function release(url:string){if(url.startsWith('blob:'))URL.revokeObjectURL(url);}
export function useAdminPhoto(authorized:boolean){
  const {user}=useAuth();const [photo,setPhoto]=useState<AdminPhoto>(empty);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  const [version,setVersion]=useState(0);const reload=useCallback(()=>setVersion(value=>value+1),[]);
  useEffect(()=>{
    let active=true;let objectUrl='';setPhoto(empty);setError('');
    if(!authorized){setLoading(false);return;}
    setLoading(true);
    void loadAdminPhoto().then(result=>{if(!active){release(result.avatar_url);return;}objectUrl=result.avatar_url;setPhoto(result);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Não foi possível carregar sua foto.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;release(objectUrl);};
  },[authorized,user?.id,version]);
  useEffect(()=>{
    const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('admin-profile'):null;if(channel)channel.onmessage=reload;
    const storage=(event:StorageEvent)=>{if(event.key===DEMO_KEY)reload();};
    window.addEventListener('admin-profile-updated',reload);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('admin-profile-updated',reload);window.removeEventListener('storage',storage);channel?.close();};
  },[reload]);
  return {photo,loading,error,reload};
}
