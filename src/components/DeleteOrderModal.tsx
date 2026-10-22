import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteOrder } from '../lib/api';
import { money,numberLabel,type Order,type Campaign } from '../lib/domain';
import Modal from './Modal';

export default function DeleteOrderModal({order,campaign,onClose,onDeleted}:{order:Order;campaign?:Campaign;onClose:()=>void;onDeleted:()=>Promise<void>}){
  const [code,setCode]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const expected=order.id.slice(0,8).toUpperCase();
  async function submit(event:React.FormEvent){
    event.preventDefault();if(busy||code.trim().toUpperCase()!==expected)return;setBusy(true);setError('');
    try{await deleteOrder(order.id,code);await onDeleted();}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível excluir a reserva.');setBusy(false);}
  }
  return <Modal title="Excluir esta reserva do histórico?" onClose={()=>{if(!busy)onClose();}}><form className="order-delete-form" onSubmit={submit}><div className="confirmation-summary"><p><strong>{order.customer_name}</strong> · {money(order.amount)}</p><p>{campaign?.title||'Campanha'} · #{expected}</p><p>Números: {order.numbers.map(n=>numberLabel(n,campaign?.total_numbers)).join(', ')}</p></div><p className="notice">A reserva e seu histórico de pagamento serão excluídos permanentemente. Os números ficarão disponíveis e o valor sairá dos totais do painel. A conta e os dados pessoais do participante serão mantidos.</p>{order.status==='paid'&&<p className="notice">Este pagamento está confirmado. Excluir a reserva não devolve o Pix. Confira o recebimento e qualquer devolução antes de continuar.</p>}<p className="small muted">Campanhas com sorteio registrado não permitem excluir reservas.</p><label>Digite {expected} para excluir<input required autoComplete="off" spellCheck={false} maxLength={8} value={code} onChange={e=>setCode(e.target.value)} disabled={busy}/></label>{error&&<p className="error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Voltar</button><button type="submit" className="button danger" disabled={busy||code.trim().toUpperCase()!==expected}><Trash2 size={16}/>{busy?'Excluindo...':'Excluir definitivamente'}</button></div></form></Modal>;
}
