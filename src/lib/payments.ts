import type { Campaign, Order } from './domain.ts';

export function currentOrder<T extends Order>(order:T,now=Date.now()):T {
  return {...order,status:order.status==='pending' && Date.parse(order.expires_at)<=now?'expired':order.status};
}
const brasilia=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
export function paymentDate(value:string) {
  const parts=brasilia.formatToParts(new Date(value));
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
export interface PaymentFilters {query:string;status:string;campaign:string;from:string;to:string}
export function filterPayments(orders:Order[],filters:PaymentFilters,campaigns:Campaign[],now=Date.now()) {
  const query=filters.query.trim().toLocaleLowerCase('pt-BR');
  return orders.map(order=>currentOrder(order,now)).filter(order=>{
    const campaign=campaigns.find(item=>item.id===order.campaign_id);
    const date=paymentDate(order.created_at);
    return (filters.status==='all'||order.status===filters.status)
      && (filters.campaign==='all'||order.campaign_id===filters.campaign)
      && (!filters.from||date>=filters.from) && (!filters.to||date<=filters.to)
      && `${order.customer_name} ${order.phone} ${order.id} ${campaign?.title||''}`.toLocaleLowerCase('pt-BR').includes(query);
  });
}
export function paymentTotals(orders:Order[]) {
  const total=(status:Order['status'])=>orders.filter(order=>order.status===status).reduce((sum,order)=>sum+Math.round(order.amount*100),0)/100;
  return {paid:total('paid'),pending:total('pending'),expired:total('expired'),cancelled:total('cancelled')};
}
function csvCell(value:unknown) {
  let text=String(value??'');
  // O arquivo pode ser aberto no Excel: dados do participante nunca viram fórmulas.
  if (/^[\s\uFEFF]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text)) text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export function paymentsCsv(orders:Order[],campaigns:Campaign[]) {
  const labels={pending:'Aguardando',paid:'Confirmado',cancelled:'Cancelado',expired:'Expirado'};
  const rows:unknown[][]=[['Reserva','Participante','WhatsApp','Campanha','Números','Valor (BRL)','Status','Criada em (UTC)','Prazo (UTC)','Confirmada em (UTC)']];
  for (const order of orders) rows.push([order.id,order.customer_name,order.phone,campaigns.find(c=>c.id===order.campaign_id)?.title||order.campaign_id,order.numbers.join(', '),order.amount.toFixed(2).replace('.',','),labels[order.status],order.created_at,order.expires_at,order.paid_at||'']);
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');
}
