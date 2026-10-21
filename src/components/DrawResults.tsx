import { useEffect,useState } from 'react';
import { Trophy,ShieldCheck } from 'lucide-react';
import { loadDraws } from '../lib/api';
import { numberLabel,type Campaign,type DrawResult } from '../lib/domain';

export function DrawResultCard({ draw,campaign }:{ draw:DrawResult;campaign?:Campaign }) {
  return <article className="draw-result-card"><span className="eyebrow"><Trophy size={16}/>RESULTADO DO SORTEIO</span><h2>{campaign?.title||'Sorteio concluído'}</h2><div className="draw-winning-number">{numberLabel(draw.winning_number,campaign?.total_numbers)}</div><strong>Participante {draw.winner_label}</strong><p>{new Date(draw.drawn_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} · horário de Brasília</p><span className="draw-pool-count"><ShieldCheck size={15}/>{draw.eligible_count} {draw.eligible_count===1?'número':'números'} com pagamento confirmado</span><details><summary>Conferir registro do sorteio</summary><p>Números participantes: {draw.eligible_numbers.map(n=>numberLabel(n,campaign?.total_numbers)).join(', ')}.</p><p>Método: {draw.method}. Posição selecionada: {draw.selected_index}.</p><p className="draw-hash">SHA-256 do conjunto: {draw.pool_hash}</p><p>Identificador: {draw.id}</p></details></article>;
}
export default function DrawResults({ campaigns,campaignId }:{ campaigns:Campaign[];campaignId?:string }) {
  const [results,setResults]=useState<DrawResult[]>([]);const [error,setError]=useState('');
  useEffect(()=>{let active=true;const refresh=()=>loadDraws(campaignId).then(data=>{if(active){setResults(data);setError('');}}).catch(()=>{if(active)setError('Não foi possível consultar os resultados.');});void refresh();const timer=setInterval(refresh,15000);return()=>{active=false;clearInterval(timer);};},[campaignId]);
  if(!results.length && !error) return null;
  return <section className="draw-results container" aria-label="Resultados dos sorteios">{error && <p className="error" role="alert">{error}</p>}{results.map(draw=><DrawResultCard key={draw.id} draw={draw} campaign={campaigns.find(c=>c.id===draw.campaign_id)}/>)}</section>;
}
