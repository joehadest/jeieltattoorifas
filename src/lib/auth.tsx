import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { DEMO_CUSTOMER_SESSION,isDemo,supabase } from './api';
import { navigate } from './navigation';

export interface AccountUser { id:string; email?:string }
const AuthContext=createContext<{ user:AccountUser|null;loading:boolean;enterDemo:()=>void;signOut:()=>Promise<void> }>({ user:null,loading:true,enterDemo:()=>{},signOut:async()=>{} });
const demoUser={ id:'00000000-0000-4000-a000-000000000099',email:'participante@demonstracao.local' };
export function AuthProvider({ children }:{ children:ReactNode }) {
  const [user,setUser]=useState<AccountUser|null>(()=>isDemo && sessionStorage.getItem(DEMO_CUSTOMER_SESSION) ? demoUser : null);
  const [loading,setLoading]=useState(!isDemo);
  useEffect(()=>{
    if (!supabase) return;
    let active=true;
    const { data }=supabase.auth.onAuthStateChange((event,session)=>{
      if (!active) return;
      setUser(session?.user||null); setLoading(false);
      if (event==='PASSWORD_RECOVERY') setTimeout(()=>navigate('/conta/redefinir-senha'),0);
    });
    void supabase.auth.getSession().then(({ data })=>{ if(active) { setUser(data.session?.user||null);setLoading(false); } }).catch(()=>{ if(active) setLoading(false); });
    return ()=>{ active=false;data.subscription.unsubscribe(); };
  },[]);
  return <AuthContext.Provider value={{ user,loading,enterDemo:()=>{ sessionStorage.setItem(DEMO_CUSTOMER_SESSION,'1');setUser(demoUser); },signOut:async()=>{
    if (supabase) { const {error}=await supabase.auth.signOut({scope:'local'}); if(error) throw error; }
    else sessionStorage.removeItem(DEMO_CUSTOMER_SESSION);
    setUser(null);
  } }}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
