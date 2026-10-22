import { supabase } from './api';

export interface AdminAccessEntry {
  email:string; user_id:string|null; status:'active'|'pending'|'expired'; is_current:boolean;
  invited_at:string|null; expires_at:string|null;
}
const DEMO_KEY='jeiel-demo-admin-access-v1';
const current:AdminAccessEntry={email:'organizador@demonstracao.local',user_id:'demo-admin',status:'active',is_current:true,invited_at:null,expires_at:null};
function demoEntries():AdminAccessEntry[]{
  try{return [current,...JSON.parse(localStorage.getItem(DEMO_KEY)||'[]')];}catch{return [current];}
}
function check(error:{message:string;code?:string}|null){
  if(error)throw new Error(error.code==='PGRST202'||error.code==='42883'?'A gestão de administradores precisa da atualização do banco.':error.message);
}
export async function getAdminAuthorization():Promise<boolean>{
  if(!supabase)return true;
  const {data,error}=await supabase.auth.getSession();check(error);
  if(!data.session)return false;
  const result=await supabase.rpc('activate_admin_access');check(result.error);return result.data===true;
}
export async function listAdminAccess():Promise<AdminAccessEntry[]>{
  if(!supabase)return demoEntries();
  const {data,error}=await supabase.rpc('admin_list_access');check(error);return data||[];
}
export async function addAdminAccess(email:string):Promise<'active'|'pending'>{
  const address=email.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||address.length>254)throw new Error('Informe um e-mail válido.');
  if(!supabase){
    const entries=demoEntries();if(entries.some(item=>item.email===address))throw new Error('Este e-mail já tem acesso ou uma autorização pendente.');
    const entry:AdminAccessEntry={email:address,user_id:null,status:'pending',is_current:false,invited_at:new Date().toISOString(),expires_at:new Date(Date.now()+7*86400000).toISOString()};
    localStorage.setItem(DEMO_KEY,JSON.stringify([...entries.filter(item=>!item.is_current),entry]));return 'pending';
  }
  const {data,error}=await supabase.rpc('admin_add_access',{p_email:address});check(error);return data;
}
export async function revokeAdminAccess(email:string){
  if(!supabase){
    const entries=demoEntries();if(entries.some(item=>item.email===email&&item.is_current))throw new Error('Você não pode remover seu próprio acesso.');
    localStorage.setItem(DEMO_KEY,JSON.stringify(entries.filter(item=>!item.is_current&&item.email!==email)));return;
  }
  const {error}=await supabase.rpc('admin_revoke_access',{p_email:email});check(error);
}
