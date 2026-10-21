import { useState } from 'react';
import { ArrowRight,KeyRound,Mail,UserRound } from 'lucide-react';
import { isDemo,supabase } from '../lib/api';
import { useAuth } from '../lib/auth';
import { whatsappNumber } from '../lib/domain';

export default function AccountAccess({ compact=false }:{ compact?:boolean }) {
  const { enterDemo }=useAuth();
  const [mode,setMode]=useState<'login'|'signup'|'reset'>('login');
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [name,setName]=useState(''); const [phone,setPhone]=useState('');
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  async function submit(event:React.FormEvent) {
    event.preventDefault(); if(!supabase) return;
    setBusy(true);setError('');setMessage('');
    try {
      const address=email.trim(); const redirect=`${window.location.origin}/conta`;
      if(mode==='reset') {
        const {error}=await supabase.auth.resetPasswordForEmail(address,{redirectTo:`${redirect}/redefinir-senha`}); if(error) throw error;
        setMessage('Se este e-mail tiver uma conta, você receberá um link para redefinir a senha.');
      } else if(mode==='signup') {
        if(name.trim().length<3) throw new Error('Informe seu nome completo.');
        if(!whatsappNumber(phone)) throw new Error('Informe um WhatsApp válido com DDD.');
        const { data,error }=await supabase.auth.signUp({email:address,password,options:{emailRedirectTo:redirect,data:{full_name:name.trim(),phone:whatsappNumber(phone)}}});
        if(error) throw error;
        setPassword(''); if(!data.session) setMessage('Confira seu e-mail para confirmar a conta. Depois, entre com sua senha.');
      } else {
        const {error}=await supabase.auth.signInWithPassword({email:address,password});if(error) throw error;setPassword('');
      }
    } catch(e) {
      const code=(e as {code?:string}).code;
      setError(code==='invalid_credentials' ? 'E-mail ou senha incorretos.' : code==='email_not_confirmed' ? 'Confirme seu e-mail antes de entrar. Você pode reenviar a confirmação abaixo.' : code==='weak_password' ? 'Escolha uma senha mais forte, com pelo menos 8 caracteres.' : code==='over_email_send_rate_limit' || code==='over_request_rate_limit' ? 'Aguarde alguns instantes antes de tentar novamente.' : e instanceof Error && !code ? e.message : 'Não foi possível concluir. Confira os dados e tente novamente.');
    } finally {setBusy(false);}
  }
  function changeMode(value:typeof mode) { setMode(value);setError('');setMessage('');setPassword(''); }
  return <div className={`account-access ${compact ? 'compact' : ''}`}>
    <div className="account-access-icon"><UserRound size={25}/></div><span className="eyebrow">ÁREA DO PARTICIPANTE</span>
    <h1>{mode==='signup' ? 'Sua conta. Seus números.' : mode==='reset' ? 'Recupere seu acesso.' : 'Seus números, sempre com você.'}</h1>
    <p>Acompanhe suas reservas, veja os números confirmados e consulte o resultado do sorteio em qualquer dispositivo.</p>
    {isDemo ? <><p className="notice">Demonstração local: o acesso é simulado e os dados ficam neste navegador. Não use uma senha real.</p><button className="button primary full" onClick={enterDemo}>Entrar na demonstração<ArrowRight size={16}/></button></> : <>
      {mode!=='reset' && <div className="account-tabs"><button type="button" className={mode==='login'?'active':''} onClick={()=>changeMode('login')}>Entrar</button><button type="button" className={mode==='signup'?'active':''} onClick={()=>changeMode('signup')}>Criar conta</button></div>}
      <form onSubmit={submit} className="account-form">
        {mode==='signup' && <><label>Nome completo<input required minLength={3} maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label><label>WhatsApp com DDD<input required type="tel" maxLength={25} autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(84) 99999-9999"/></label></>}
        <label>E-mail<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com"/></label>
        {mode!=='reset' && <label>Senha<input required type="password" minLength={mode==='signup'?8:1} maxLength={128} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)}/>{mode==='signup' && <span className="field-help">Use pelo menos 8 caracteres.</span>}</label>}
        {error && <p className="error" role="alert">{error}</p>}{message && <p className="success-message" role="status"><Mail size={17}/>{message}</p>}
        <button className="button primary full" disabled={busy}>{busy?'Aguarde...':mode==='signup'?'Criar minha conta':mode==='reset'?'Enviar link de recuperação':'Entrar na minha conta'}<ArrowRight size={16}/></button>
      </form>
      <button type="button" className="text-button full" onClick={()=>changeMode(mode==='reset'?'login':'reset')}><KeyRound size={14}/>{mode==='reset'?'Voltar para entrar':'Esqueci minha senha'}</button>
      {error.includes('Confirme seu e-mail') && <button type="button" className="text-button full" disabled={busy} onClick={async()=>{setBusy(true); const {error}=await supabase!.auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/conta`}});setBusy(false);setMessage(error?'Não foi possível reenviar. Aguarde e tente novamente.':'Se a confirmação estiver pendente, você receberá um novo e-mail.');}}>Reenviar confirmação</button>}
    </>}
  </div>;
}
