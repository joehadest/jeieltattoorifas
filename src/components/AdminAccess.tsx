import { useState } from 'react';
import { ArrowRight,ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/api';
import { getAdminAuthorization } from '../lib/admin-access';
import { Brand } from './SiteElements';
import { navigate } from '../lib/navigation';

export default function AdminAccess({name,logo,alt,onAuthenticated}:{name:string;logo:string;alt:string;onAuthenticated:()=>Promise<void>}){
  const [signup,setSignup]=useState(false);const [email,setEmail]=useState('');const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function submit(event:React.FormEvent){
    event.preventDefault();if(!supabase)return;setBusy(true);setError('');setMessage('');
    try{
      if(signup){
        const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${location.origin}/conta`}});
        if(error)throw error;setPassword('');
        if(!data.session){setMessage('Confira seu e-mail para confirmar a conta. Depois, volte a /admin e entre. Somente e-mails autorizados pelo organizador acessam o painel.');return;}
      }else{
        const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');
      }
      if(!await getAdminAuthorization()){
        await supabase.auth.signOut({scope:'local'});throw new Error('Este e-mail não tem acesso ao painel. Peça ao organizador para autorizar seu e-mail em Administradores.');
      }
      await onAuthenticated();
    }catch(e){
      const code=(e as {code?:string}).code;
      setError(code==='invalid_credentials'?'E-mail ou senha incorretos.':code==='email_not_confirmed'?'Confirme seu e-mail antes de entrar.':code==='weak_password'?'Use uma senha forte com pelo menos 8 caracteres.':code?'Não foi possível concluir. Confira os dados e tente novamente.':e instanceof Error?e.message:'Não foi possível entrar.');
    }finally{setBusy(false);}
  }
  return <div className="admin-login"><a href="/" onClick={e=>{e.preventDefault();navigate('/');}}><Brand name={name} logo={logo} alt={alt} width={130}/></a><div className="login-card"><span className="round-icon"><ShieldCheck size={26}/></span><span className="eyebrow muted">ÁREA RESTRITA DO ORGANIZADOR</span><h1>{signup?'Seu primeiro acesso.':'Bom ter você de volta.'}</h1><p>{signup?'Use o e-mail autorizado por um administrador e defina sua senha.':'Entre com uma conta autorizada para cuidar das campanhas.'}</p><form onSubmit={submit}><label>E-mail<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username"/></label><label>Senha<input type="password" required minLength={signup?8:1} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={signup?'new-password':'current-password'}/></label>{error&&<p className="error" role="alert">{error}</p>}{message&&<p className="success-message" role="status">{message}</p>}<button className="button primary full" disabled={busy}>{busy?'Aguarde...':signup?'Criar meu acesso':'Entrar no painel'}<ArrowRight size={17}/></button></form><button type="button" className="text-button full" disabled={busy} onClick={()=>{setSignup(!signup);setPassword('');setError('');setMessage('');}}>{signup?'Já tenho conta':'Primeiro acesso com e-mail autorizado'}</button><button type="button" className="text-button full" disabled={busy} onClick={()=>navigate('/conta')}>Recuperar senha na área da conta</button><button type="button" className="text-button full" onClick={()=>navigate('/')}>Voltar para o site</button></div></div>;
}
