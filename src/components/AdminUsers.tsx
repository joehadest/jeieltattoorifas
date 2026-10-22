import { useEffect,useState } from 'react';
import { Check,Copy,ShieldCheck,UserPlus,X } from 'lucide-react';
import { addAdminAccess,listAdminAccess,revokeAdminAccess,type AdminAccessEntry } from '../lib/admin-access';
import Modal from './Modal';

export default function AdminUsers(){
  const [entries,setEntries]=useState<AdminAccessEntry[]>([]);const [email,setEmail]=useState('');const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');const [message,setMessage]=useState('');const [confirm,setConfirm]=useState<{kind:'add'|'remove';email:string}|null>(null);
  useEffect(()=>{let active=true;void listAdminAccess().then(data=>{if(active)setEntries(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  async function apply(){
    if(!confirm)return;setBusy(true);setError('');setMessage('');
    try{
      if(confirm.kind==='add'){
        const status=await addAdminAccess(confirm.email);setEmail('');setMessage(status==='active'?'Administrador adicionado. A conta já pode acessar /admin.':'E-mail autorizado por 7 dias. Compartilhe o link /admin; a pessoa cria a própria senha em Primeiro acesso e confirma o e-mail.');
      }else{await revokeAdminAccess(confirm.email);setMessage('Acesso administrativo removido. A conta de participante foi preservada.');}
      setConfirm(null);setEntries(await listAdminAccess());
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar os acessos.');}finally{setBusy(false);}
  }
  return <div className="admin-users"><section className="panel admin-access-intro"><ShieldCheck size={28}/><div><h2>Quem pode organizar</h2><p>Administradores têm acesso às campanhas, participantes, pagamentos, sorteios e configurações. Autorize somente pessoas de confiança.</p></div></section>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="success-message" role="status"><Check size={16}/>{message}</p>}
    <section className="panel admin-access-add"><h2>Adicionar administrador</h2><p>Uma conta com e-mail já confirmado recebe acesso imediato. Para uma nova conta, a pessoa define a própria senha e confirma o e-mail.</p><form onSubmit={e=>{e.preventDefault();setError('');setMessage('');setConfirm({kind:'add',email:email.trim().toLowerCase()});}}><label>E-mail do novo administrador<input type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="pessoa@exemplo.com"/></label><button className="button primary" disabled={busy||loading}><UserPlus size={16}/>Autorizar e-mail</button></form><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/admin`);setMessage('Link copiado. Envie-o à pessoa autorizada. Nenhum e-mail de convite foi enviado automaticamente.');}catch{setError('Não foi possível copiar. Use o endereço do site seguido de /admin.');}}}><Copy size={15}/>Copiar link de acesso</button></section>
    <section className="panel"><div className="panel-title"><div><h2>Administradores e autorizações</h2><p>{entries.filter(item=>item.status==='active').length} administrador(es) ativo(s)</p></div></div>{loading?<div className="loading-state"><span className="spinner"/>Carregando acessos...</div>:<ul className="admin-access-list">{entries.map(item=><li key={item.email}><div><strong>{item.email}</strong><span>{item.is_current?'Sua conta · ':''}{item.status==='active'?'Administrador ativo':item.status==='pending'?'Aguardando cadastro ou confirmação':'Autorização expirada'}{item.status!=='active'&&item.expires_at?` · até ${new Date(item.expires_at).toLocaleDateString('pt-BR')}`:''}</span></div><button type="button" className="button secondary" disabled={busy||item.is_current} onClick={()=>{setError('');setConfirm({kind:'remove',email:item.email});}}><X size={15}/>{item.status==='active'?'Remover acesso':'Cancelar autorização'}</button></li>)}</ul>}</section>
    {confirm&&<Modal title={confirm.kind==='add'?'Autorizar este administrador?':'Remover acesso administrativo?'} onClose={()=>{if(!busy)setConfirm(null);}}><p className="muted modal-intro"><strong>{confirm.email}</strong></p><p className="notice">{confirm.kind==='add'?'Essa pessoa poderá gerenciar todos os dados e funções do painel, inclusive autorizar outros administradores.':'O acesso ao painel será removido. A conta, os dados pessoais e as participações não serão excluídos.'}</p>{error&&<p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>setConfirm(null)}>Voltar</button><button className="button primary" disabled={busy} onClick={()=>void apply()}>{busy?'Aguarde...':confirm.kind==='add'?'Confirmar autorização':'Remover acesso'}</button></div></Modal>}
  </div>;
}
