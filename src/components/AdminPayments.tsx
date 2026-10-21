import { useEffect, useState } from 'react';
import { Check, Clock3, Download, Eye, MessageCircle, Search, ShieldCheck, Wallet, X } from 'lucide-react';
import { getOrderEvents } from '../lib/api';
import { money, numberLabel, whatsappNumber, type Campaign, type Order, type OrderEvent } from '../lib/domain';
import { currentOrder, filterPayments, paymentsCsv, paymentTotals, type PaymentFilters } from '../lib/payments';
import { StatusBadge } from './SiteElements';
import Modal from './Modal';

const initialFilters:PaymentFilters={query:'',status:'all',campaign:'all',from:'',to:''};
const dateTime=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
const eventLabels={created:'Reserva criada',paid:'Pagamento confirmado pelo organizador',cancelled:'Reserva cancelada pelo organizador',expired:'Reserva expirada'};

export default function AdminPayments({orders,campaigns,busy,onAction}:{orders:Order[];campaigns:Campaign[];busy:boolean;onAction:(order:Order,status:'paid'|'cancelled')=>void}) {
  const [filters,setFilters]=useState(initialFilters);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [events,setEvents]=useState<OrderEvent[]>([]);
  const [historyError,setHistoryError]=useState('');
  const [historyLoading,setHistoryLoading]=useState(false);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const selected=orders.find(order=>order.id===selectedId);
  const detail=selected?currentOrder(selected,now):null;
  useEffect(()=>{
    if (!selectedId) return;
    let active=true;
    setHistoryLoading(true);setEvents([]);setHistoryError('');
    void getOrderEvents(selectedId).then(result=>{if(active)setEvents(result);}).catch(()=>{if(active)setHistoryError('Não foi possível carregar o histórico. Confira a conexão e se a atualização de pagamentos foi aplicada ao banco.');}).finally(()=>{if(active)setHistoryLoading(false);});
    return()=>{active=false;};
  },[selectedId,selected?.status]);
  const invalidRange=!!filters.from&&!!filters.to&&filters.from>filters.to;
  const shown=(invalidRange?[]:filterPayments(orders,filters,campaigns,now))
    .sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending'));
  const summary=invalidRange?[]:filterPayments(orders,{...filters,status:'all'},campaigns,now);
  const totals=paymentTotals(summary);
  function exportCsv() {
    const url=URL.createObjectURL(new Blob([paymentsCsv(shown,campaigns)],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`pagamentos-${new Date().toISOString().slice(0,10)}.csv`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function action(order:Order,status:'paid'|'cancelled') {setSelectedId(null);onAction(order,status);}
  return <div className="finance-page">
    <section className="finance-receiving panel"><span className="round-icon"><Wallet size={23}/></span><div><span className="eyebrow muted">RECEBIMENTO</span><h2>Pix direto para sua conta</h2><p>O cliente paga e envia o comprovante pelo WhatsApp. Confira o crédito no banco e confirme a reserva.</p></div><span className="payment-method"><Check size={14}/>Conferência pelo organizador</span></section>
    <div className="metrics-grid finance-metrics">{[
      {label:'Em aberto',amount:totals.pending,status:'pending',icon:Clock3,accent:true},
      {label:'Confirmados',amount:totals.paid,status:'paid',icon:Wallet,accent:false},
    ].map(metric=>{const count=summary.filter(order=>order.status===metric.status).length;return <button type="button" className={`metric-card finance-metric ${metric.accent?'accent':''}`} key={metric.status} aria-pressed={filters.status===metric.status} onClick={()=>setFilters({...filters,status:filters.status===metric.status?'all':metric.status})}><div><span>{metric.label}</span><metric.icon size={18}/></div><strong>{money(metric.amount)}</strong><small>{count} reserva{count===1?'':'s'} · clique para filtrar</small></button>;})}</div>
    <section className="panel finance-list"><div className="panel-title"><div><h2>Reservas e pagamentos<span className="mini-count">{shown.length}</span></h2><p>As reservas em aberto aparecem primeiro. Abra “Conferir” para revisar e confirmar o recebimento.</p></div><button className="button secondary" disabled={!shown.length} onClick={exportCsv}><Download size={16}/>Exportar CSV</button></div>
      <div className="finance-filters"><label className="finance-search">Buscar<div className="search-box"><Search size={16}/><input placeholder="Nome, telefone, código ou campanha" value={filters.query} onChange={e=>setFilters({...filters,query:e.target.value})}/></div></label><label>Status<select value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="all">Todos os status</option><option value="pending">Aguardando conferência</option><option value="paid">Confirmados</option><option value="expired">Expirados</option><option value="cancelled">Cancelados</option></select></label><label>Campanha<select value={filters.campaign} onChange={e=>setFilters({...filters,campaign:e.target.value})}><option value="all">Todas as campanhas</option>{campaigns.map(campaign=><option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label><label>De<input type="date" value={filters.from} max={filters.to||undefined} onChange={e=>setFilters({...filters,from:e.target.value})}/></label><label>Até<input type="date" value={filters.to} min={filters.from||undefined} onChange={e=>setFilters({...filters,to:e.target.value})}/></label><button className="text-button" onClick={()=>setFilters(initialFilters)}>Limpar filtros</button></div>
      {invalidRange&&<p className="error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
      <div className="table-scroll"><table className="orders-table finance-table"><thead><tr><th>Reserva / participante</th><th>Campanha</th><th>Valor</th><th>Status</th><th>Prazo / confirmação</th><th className="align-right">Atendimento</th></tr></thead><tbody>{shown.map(order=><tr key={order.id}>
        <td><div className="table-person"><span className="avatar">{order.customer_name.slice(0,1).toUpperCase()}</span><div><strong>{order.customer_name}</strong><small>#{order.id.slice(0,8).toUpperCase()}</small><small>{order.phone}</small></div></div></td>
        <td><strong className="table-campaign">{campaigns.find(campaign=>campaign.id===order.campaign_id)?.title||'Campanha'}</strong><span className="table-numbers">{order.numbers.length} número{order.numbers.length===1?'':'s'} · Pix</span></td>
        <td className="table-money">{money(order.amount)}</td><td><StatusBadge status={order.status}/></td>
        <td className="finance-date">{order.status==='paid'?(order.paid_at?dateTime(order.paid_at):'Data não registrada'):dateTime(order.expires_at)}<small>{order.status==='paid'?'Confirmação':'Prazo da reserva'}</small></td>
        <td><div className="table-actions">{order.status==='pending'?<button className="button secondary finance-review" aria-label={`Conferir pagamento de ${order.customer_name}`} onClick={()=>setSelectedId(order.id)}><Eye size={15}/>Conferir</button>:<button className="icon-button" title="Ver detalhes" aria-label={`Ver pagamento de ${order.customer_name}`} onClick={()=>setSelectedId(order.id)}><Eye size={17}/></button>}{whatsappNumber(order.phone)&&<a className="icon-button finance-whatsapp" aria-label={`Abrir WhatsApp de ${order.customer_name}`} title="Atender no WhatsApp" href={`https://wa.me/${whatsappNumber(order.phone)}?text=${encodeURIComponent(`Olá! Sobre sua reserva #${order.id.slice(0,8).toUpperCase()} no Jeiel Tattoo.`)}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/></a>}</div></td>
      </tr>)}</tbody></table></div>
      {!shown.length&&<div className="empty-state table-empty"><Wallet size={34}/><h3>{orders.length?'Nenhuma reserva com esses filtros.':'Seus pagamentos aparecerão aqui.'}</h3><p>{orders.length?'Altere a busca, o período ou o status.':'As reservas de clientes vão alimentar este acompanhamento.'}</p></div>}
    </section>
    {detail&&<Modal title={`Reserva #${detail.id.slice(0,8).toUpperCase()}`} onClose={()=>setSelectedId(null)}><div className="finance-detail-head"><div><span className="eyebrow muted">{campaigns.find(c=>c.id===detail.campaign_id)?.title}</span><h3>{detail.customer_name}</h3><span className="small muted">{detail.phone}</span></div><StatusBadge status={detail.status}/></div><div className="chosen-numbers">{detail.numbers.map(number=><span key={number}>{numberLabel(number,campaigns.find(c=>c.id===detail.campaign_id)?.total_numbers)}</span>)}</div><dl className="finance-facts"><div><dt>Valor da reserva</dt><dd>{money(detail.amount)}</dd></div><div><dt>Forma de confirmação</dt><dd>Pix · conferência manual</dd></div><div><dt>Criada em</dt><dd>{dateTime(detail.created_at)}</dd></div><div><dt>Prazo para confirmar</dt><dd>{dateTime(detail.expires_at)}</dd></div>{detail.paid_at&&<div><dt>Confirmada em</dt><dd>{dateTime(detail.paid_at)}</dd></div>}{detail.cancelled_at&&<div><dt>Cancelada em</dt><dd>{dateTime(detail.cancelled_at)}</dd></div>}{detail.payment_snapshot&&<><div><dt>Chave Pix desta reserva</dt><dd>{detail.payment_snapshot.pix_key}</dd></div><div><dt>Recebedor</dt><dd>{detail.payment_snapshot.receiver_name}</dd></div></>}</dl><section className="finance-history"><h3><ShieldCheck size={17}/>Histórico da reserva</h3>{historyLoading?<p className="small muted">Carregando histórico...</p>:historyError?<p className="notice" role="alert">{historyError}</p>:events.length?<ol>{events.map(event=><li key={event.id}><span className="history-dot"/><div><strong>{eventLabels[event.event_type]}</strong><span>{dateTime(event.occurred_at)} · {event.source==='manual'?'Ação do organizador':'Sistema'}</span></div></li>)}</ol>:<p className="small muted">Esta reserva não tem eventos registrados. O histórico começa após a atualização de pagamentos.</p>}</section>{detail.status==='pending'?<><p className="notice">Confira o crédito de {money(detail.amount)} no banco e os dados do comprovante antes de confirmar. O envio pelo WhatsApp não confirma o pagamento.</p><div className="finance-detail-actions"><button className="button primary" disabled={busy} onClick={()=>action(detail,'paid')}><Check size={16}/>Confirmar recebimento</button><button className="button secondary" disabled={busy} onClick={()=>action(detail,'cancelled')}><X size={16}/>Cancelar reserva</button></div></>:detail.status==='expired'||detail.status==='cancelled'?<p className="notice">Não confirme pagamentos para esta reserva. Se houve crédito, confira com o cliente e trate a devolução pelo banco; os números podem ter sido reservados novamente.</p>:null}{whatsappNumber(detail.phone)&&<a className="text-button finance-contact" href={`https://wa.me/${whatsappNumber(detail.phone)}?text=${encodeURIComponent(`Olá, ${detail.customer_name}! Sobre sua reserva #${detail.id.slice(0,8).toUpperCase()} no Jeiel Tattoo.`)}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/>Atender participante no WhatsApp</a>}</Modal>}
  </div>;
}
