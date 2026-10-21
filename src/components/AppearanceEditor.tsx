import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronRight, Eye, ExternalLink, FileText, Image, LayoutTemplate, List, MessageCircle, Monitor, Paintbrush, Palette, Plus, RefreshCw, RotateCcw, Save, Smartphone, Trash2, Type, Wallet } from 'lucide-react';
import { saveAppearance, isDemo } from '../lib/api';
import { defaultAppearance, fontOptions, normalizeAppearance, sectionLabels, type SiteAppearance } from '../lib/appearance';
import { demoCampaigns, type Campaign, type Settings } from '../lib/domain';
import { navigate } from '../lib/navigation';
import ImageField from './ImageField';
import Modal from './Modal';

const groups = [
  { id:'identity', title:'Logo e identidade', icon:Image, description:'O nome e a marca que aparecem no cabeçalho e no rodapé.' },
  { id:'theme', title:'Cores e fontes', icon:Palette, description:'Ajuste a paleta, a tipografia e o formato dos elementos.' },
  { id:'sections', title:'Seções da página', icon:LayoutTemplate, description:'Escolha o que aparece e em qual ordem.' },
  { id:'header', title:'Cabeçalho', icon:Type, description:'Personalize a faixa superior e os nomes do menu.' },
  { id:'hero', title:'Destaque principal', icon:Paintbrush, description:'Edite a primeira impressão do seu site.' },
  { id:'campaigns', title:'Lista de campanhas', icon:List, description:'Títulos e chamadas da área de campanhas.' },
  { id:'trust', title:'Faixa de benefícios', icon:Check, description:'Mensagens curtas que ajudam quem participa.' },
  { id:'how', title:'Como participar', icon:ChevronRight, description:'Explique a participação com os seus próprios textos.' },
  { id:'faq', title:'Perguntas frequentes', icon:MessageCircle, description:'Crie, edite e organize as dúvidas dos participantes.' },
  { id:'footer', title:'Rodapé e termos', icon:FileText, description:'Personalize o rodapé, os termos e a política de privacidade.' },
  { id:'checkout', title:'Pop-up de pagamento', icon:Wallet, description:'As chamadas e orientações que acompanham o Pix.' },
  { id:'details', title:'Página da campanha', icon:LayoutTemplate, description:'Os títulos da seleção de números e do regulamento.' },
  { id:'meta', title:'Título do navegador', icon:Type, description:'Nome da aba, descrição da página e ícone do navegador.' },
] as const;
type Group = typeof groups[number]['id'];

export default function AppearanceEditor({ settings, campaigns, onSaved }: { settings:Settings; campaigns:Campaign[]; onSaved:()=>Promise<void> }) {
  const savedAppearance = useMemo(() => normalizeAppearance(settings.appearance),[settings.appearance]);
  const [draft,setDraft] = useState<SiteAppearance>(() => normalizeAppearance(settings.appearance));
  const [name,setName] = useState(settings.site_name);
  const [baseline,setBaseline] = useState(() => JSON.stringify({ name:settings.site_name, appearance:normalizeAppearance(settings.appearance) }));
  const [group,setGroup] = useState<Group>('identity'); const [device,setDevice] = useState<'desktop'|'mobile'>('desktop');
  const [busy,setBusy] = useState(false); const [uploads,setUploads] = useState(0); const [error,setError] = useState(''); const [message,setMessage] = useState('');
  const [confirmation,setConfirmation] = useState<'discard'|'reset'|null>(null); const [leave,setLeave] = useState<string|null>(null); const bypass = useRef(false);
  const frame = useRef<HTMLIFrameElement>(null); const viewport = useRef<HTMLDivElement>(null);
  const [previewVersion,setPreviewVersion] = useState(() => Date.now());
  const [previewReady,setPreviewReady] = useState(false); const [previewFailed,setPreviewFailed] = useState(false);
  const previewRetries = useRef(0);
  const [bounds,setBounds] = useState({ width:450,height:610 });
  const dirty = JSON.stringify({ name,appearance:draft }) !== baseline;
  const groupInfo = groups.find(item => item.id === group)!;
  useEffect(() => {
    if (dirty) return;
    setDraft(savedAppearance); setName(settings.site_name); setBaseline(JSON.stringify({ name:settings.site_name,appearance:savedAppearance }));
    // Do not overwrite a draft if another page refreshes its saved settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[settings.site_name,savedAppearance]);
  useEffect(() => {
    const unload = (event:BeforeUnloadEvent) => { if (dirty || uploads) { event.preventDefault(); event.returnValue=''; } };
    const route = (event:Event) => { if ((dirty || uploads) && !bypass.current) { event.preventDefault(); setLeave((event as CustomEvent<string>).detail); } };
    window.addEventListener('beforeunload',unload); window.addEventListener('app:navigate',route);
    return () => { window.removeEventListener('beforeunload',unload); window.removeEventListener('app:navigate',route); };
  },[dirty,uploads]);
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; setBounds({ width:rect.width,height:rect.height }); });
    observer.observe(element); return () => observer.disconnect();
  },[]);
  const previewCampaigns = useMemo(() => (campaigns.length ? campaigns : demoCampaigns).map(c => ({ ...c,status:'active' as const })),[campaigns]);
  const sendPreview = useCallback(() => frame.current?.contentWindow?.postMessage({ type:'site-preview', settings:{ site_name:name,appearance:normalizeAppearance(draft) },campaigns:previewCampaigns },window.location.origin),[draft,name,previewCampaigns]);
  useEffect(() => { sendPreview(); },[sendPreview]);
  useEffect(() => {
    const ready = (event:MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'site-preview-ready' || event.data?.type === 'site-preview-applied') {
        setPreviewReady(true); setPreviewFailed(false);
        if (event.data.type === 'site-preview-ready') sendPreview();
      }
    };
    window.addEventListener('message',ready); return () => window.removeEventListener('message',ready);
  },[sendPreview]);
  useEffect(() => {
    if (previewReady) return;
    const timer = window.setTimeout(() => {
      if (previewRetries.current === 0) { previewRetries.current=1; setPreviewVersion(previous => previous+1); }
      else setPreviewFailed(true);
    },5000);
    return () => window.clearTimeout(timer);
  },[previewReady,previewVersion]);
  function refreshPreview() {
    previewRetries.current=0; setPreviewReady(false); setPreviewFailed(false); setPreviewVersion(previous => previous+1);
  }
  function update(groupName: keyof SiteAppearance, key:string, value:unknown) {
    setMessage('');
    setDraft(previous => ({ ...previous,[groupName]:{ ...(previous[groupName] as unknown as Record<string,unknown>),[key]:value } }));
  }
  function field(groupName:keyof SiteAppearance,key:string,label:string,multiline=false) {
    const value = String((draft[groupName] as unknown as Record<string,unknown>)[key] ?? '');
    return <label key={`${groupName}.${key}`}>{label}{multiline ? <textarea rows={key.endsWith('_text') ? 6 : 3} maxLength={10000} value={value} onChange={event => update(groupName,key,event.target.value)} /> : <input maxLength={500} value={value} onChange={event => update(groupName,key,event.target.value)} />}</label>;
  }
  const fields = (groupName:keyof SiteAppearance,items:Array<[string,string,boolean?]>) => items.map(([key,label,multiline]) => field(groupName,key,label,multiline));
  function resetToSaved() { setDraft(savedAppearance); setName(settings.site_name); setBaseline(JSON.stringify({ name:settings.site_name,appearance:savedAppearance })); setError(''); setMessage('Alterações descartadas.'); }
  async function save(event:React.FormEvent) {
    event.preventDefault(); if (uploads) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await saveAppearance(name,draft); await onSaved();
      setBaseline(JSON.stringify({ name,appearance:draft })); setMessage('Personalização salva. O site já está atualizado.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a personalização.'); }
    finally { setBusy(false); }
  }
  function reorderSection(index:number,delta:number) {
    const order=[...draft.sections.order]; [order[index],order[index+delta]]=[order[index+delta],order[index]]; update('sections','order',order);
  }
  function reorderItem(kind:'faq'|'how',index:number,delta:number) {
    if (kind === 'faq') { const items=[...draft.faq.items]; [items[index],items[index+delta]]=[items[index+delta],items[index]]; update('faq','items',items); }
    else { const steps=[...draft.how.steps]; [steps[index],steps[index+delta]]=[steps[index+delta],steps[index]]; update('how','steps',steps); }
  }
  const itemActions = (kind:'faq'|'how',index:number,total:number) => <div className="editor-item-actions"><button type="button" className="icon-button" disabled={index===0} aria-label={`Mover item ${index+1} para cima`} onClick={() => reorderItem(kind,index,-1)}><ArrowUp size={14} /></button><button type="button" className="icon-button" disabled={index===total-1} aria-label={`Mover item ${index+1} para baixo`} onClick={() => reorderItem(kind,index,1)}><ArrowDown size={14} /></button><button type="button" className="icon-button danger-action" aria-label={`Remover item ${index+1}`} onClick={() => kind==='faq' ? update('faq','items',draft.faq.items.filter((_,i) => i!==index)) : update('how','steps',draft.how.steps.filter((_,i) => i!==index))}><Trash2 size={14} /></button></div>;
  let controls;
  switch(group) {
    case 'identity': controls=<><label>Nome do site<input required minLength={2} maxLength={50} value={name} onChange={event => setName(event.target.value)} /></label><ImageField label="Logo" value={draft.identity.logo} onChange={value => update('identity','logo',value)} onPending={delta => setUploads(value => value+delta)} help="Uma imagem com fundo transparente funciona bem no tema escuro. Sem imagem, o nome do site aparece como marca." /><div className="form-grid"><label>Largura da logo<input type="range" min={60} max={280} value={draft.identity.logo_width} onChange={e => update('identity','logo_width',Number(e.target.value))} /><span className="field-help">{draft.identity.logo_width} px · ajustada automaticamente no celular</span></label>{field('identity','logo_alt','Descrição da logo')}</div></>; break;
    case 'theme': controls=<><div className="theme-presets"><span className="field-help">Comece por uma combinação</span><div>{[{ label:'Preto e dourado',accent:'#e7bd35',background:'#101010',surface:'#191919',text:'#f1f0eb',muted:'#a5a196',border:'#34322c' },{ label:'Preto e verde',accent:'#c5f366',background:'#101110',surface:'#191b18',text:'#f1f2ed',muted:'#a1a69a',border:'#343b2c' },{ label:'Preto e branco',accent:'#ffffff',background:'#0e0e0e',surface:'#1a1a1a',text:'#f5f5f5',muted:'#aaaaaa',border:'#383838' }].map(preset => <button type="button" key={preset.label} onClick={() => { const { label:_,...colors }=preset; setDraft(previous => ({ ...previous,theme:{ ...previous.theme,...colors } })); }}><i style={{ background:preset.accent }} />{preset.label}</button>)}</div></div><div className="color-fields">{([['accent','Destaques e botões'],['background','Fundo da página'],['surface','Fundo dos cartões'],['text','Texto principal'],['muted','Texto secundário'],['border','Bordas']] as const).map(([key,label]) => <label key={key}>{label}<div className="color-field"><input type="color" value={/^#[0-9a-f]{6}$/i.test(draft.theme[key]) ? draft.theme[key] : '#000000'} onChange={event => update('theme',key,event.target.value)} aria-label={`Escolher cor: ${label}`} /><input value={draft.theme[key]} maxLength={7} onChange={event => update('theme',key,event.target.value)} aria-label={`Código da cor: ${label}`} /></div></label>)}</div><div className="form-grid">{(['font','heading_font'] as const).map((key,index) => <label key={key}>{index ? 'Fonte dos títulos' : 'Fonte dos textos'}<select value={draft.theme[key]} onChange={e => update('theme',key,e.target.value)}>{fontOptions.map(font => <option key={font}>{font}</option>)}</select></label>)}</div><label>Cantos dos botões e cartões<input type="range" min={0} max={24} value={draft.theme.radius} onChange={e => update('theme','radius',Number(e.target.value))} /><span className="field-help">{draft.theme.radius} px</span></label></>; break;
    case 'sections': controls=<><p className="editor-help">O cabeçalho e o rodapé permanecem disponíveis. Use as setas para mudar a ordem das demais seções.</p><div className="section-sort-list">{draft.sections.order.map((key,index) => <div className="section-sort-row" key={key}><span className="section-index">{String(index+1).padStart(2,'0')}</span><label className="toggle-label"><input type="checkbox" checked={draft.sections.visible[key]} onChange={e => update('sections','visible',{ ...draft.sections.visible,[key]:e.target.checked })} /><span>{sectionLabels[key]}</span></label><div><button type="button" className="icon-button" aria-label={`Mover ${sectionLabels[key]} para cima`} disabled={!index} onClick={() => reorderSection(index,-1)}><ArrowUp size={15} /></button><button type="button" className="icon-button" aria-label={`Mover ${sectionLabels[key]} para baixo`} disabled={index===draft.sections.order.length-1} onClick={() => reorderSection(index,1)}><ArrowDown size={15} /></button></div></div>)}</div></>; break;
    case 'header': controls=<><label className="toggle-label"><input type="checkbox" checked={draft.header.announcement_enabled} onChange={e => update('header','announcement_enabled',e.target.checked)} />Mostrar faixa superior</label>{fields('header',[['announcement','Texto da faixa superior'],['side_text','Texto no canto da faixa']])}<div className="editor-divider" /><div className="form-grid">{fields('header',[['campaigns_label','Menu de campanhas'],['how_label','Menu de instruções'],['faq_label','Menu de dúvidas'],['results_label','Nome do link de resultados'],['orders_label','Botão dos números']])}</div></>; break;
    case 'hero': controls=<>{fields('hero',[['eyebrow','Frase acima do título'],['title','Título principal (uma linha por trecho)',true],['highlight','Trecho em destaque'],['description','Descrição',true],['button','Texto do botão'],['caption','Texto abaixo do botão'],['caption_emphasis','Complemento em destaque']])}<div className="editor-divider" /><label>Campanha em destaque<select value={draft.hero.featured_id} onChange={e => update('hero','featured_id',e.target.value)}><option value="">Primeira campanha ativa</option>{campaigns.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}</select></label><ImageField label="Imagem do destaque" value={draft.hero.image} onChange={value => update('hero','image',value)} onPending={delta => setUploads(value => value+delta)} help="Sem imagem própria, o destaque usa a imagem da campanha escolhida." /><div className="form-grid">{field('hero','image_alt','Descrição da imagem')}<label>Enquadramento<select value={draft.hero.image_fit} onChange={e => update('hero','image_fit',e.target.value)}><option value="contain">Mostrar imagem inteira</option><option value="cover">Preencher e recortar</option></select></label></div>{fields('hero',[['badge','Etiqueta sobre a imagem'],['side_text','Texto na lateral da imagem'],['credit','Legenda da imagem'],['empty_title','Título quando não há campanha'],['empty_text','Descrição quando não há campanha']])}</>; break;
    case 'campaigns': controls=<>{fields('campaigns',[['eyebrow','Frase acima do título'],['title','Título da seção'],['search','Texto da busca'],['button','Texto do botão de participação'],['footnote','Orientação abaixo das campanhas',true]])}<p className="notice">As fotos, descrições, valores e números de cada prêmio são editados na área Campanhas.</p></>; break;
    case 'trust': controls=<><p className="editor-help">Até seis frases. Os ícones são combinados automaticamente.</p>{draft.trust.map((text,index) => <div className="inline-list-field" key={index}><label>Benefício {index+1}<input value={text} maxLength={150} onChange={event => setDraft(previous => ({ ...previous,trust:previous.trust.map((item,i) => i===index ? event.target.value : item) }))} /></label><button type="button" className="icon-button" aria-label={`Remover benefício ${index+1}`} onClick={() => setDraft(previous => ({ ...previous,trust:previous.trust.filter((_,i) => i!==index) }))}><Trash2 size={15} /></button></div>)}<button type="button" className="button secondary" disabled={draft.trust.length>=6} onClick={() => setDraft(previous => ({ ...previous,trust:[...previous.trust,'Novo benefício'] }))}><Plus size={15} />Adicionar benefício</button></>; break;
    case 'how': controls=<>{fields('how',[['eyebrow','Frase acima do título'],['title','Título da seção',true],['description','Descrição',true]])}<div className="editor-divider" />{draft.how.steps.map((step,index) => <div className="editor-list-card" key={index}><div className="editor-item-head"><strong>Passo {index+1}</strong>{itemActions('how',index,draft.how.steps.length)}</div><label>Título do passo<input value={step.title} maxLength={150} onChange={e => update('how','steps',draft.how.steps.map((item,i) => i===index ? { ...item,title:e.target.value } : item))} /></label><label>Descrição do passo<textarea rows={3} value={step.text} maxLength={1000} onChange={e => update('how','steps',draft.how.steps.map((item,i) => i===index ? { ...item,text:e.target.value } : item))} /></label></div>)}<button type="button" className="button secondary" disabled={draft.how.steps.length>=6} onClick={() => update('how','steps',[...draft.how.steps,{ title:'Novo passo',text:'' }])}><Plus size={15} />Adicionar passo</button></>; break;
    case 'faq': controls=<>{fields('faq',[['eyebrow','Frase acima do título'],['title','Título da seção'],['description','Descrição']])}<div className="editor-divider" />{draft.faq.items.map((item,index) => <div className="editor-list-card" key={index}><div className="editor-item-head"><strong>Pergunta {index+1}</strong>{itemActions('faq',index,draft.faq.items.length)}</div><label>Pergunta<input value={item.question} maxLength={300} onChange={e => update('faq','items',draft.faq.items.map((entry,i) => i===index ? { ...entry,question:e.target.value } : entry))} /></label><label>Resposta<textarea rows={4} value={item.answer} maxLength={5000} onChange={e => update('faq','items',draft.faq.items.map((entry,i) => i===index ? { ...entry,answer:e.target.value } : entry))} /></label></div>)}<button type="button" className="button secondary" disabled={draft.faq.items.length>=20} onClick={() => update('faq','items',[...draft.faq.items,{ question:'Nova pergunta',answer:'' }])}><Plus size={15} />Adicionar pergunta</button></>; break;
    case 'footer': controls=<>{fields('footer',[['tagline','Frase ao lado da logo'],['location','Localização ou frase do rodapé'],['copyright','Texto de direitos autorais'],['privacy_label','Nome do link de privacidade'],['terms_label','Nome do link de termos'],['privacy_text','Política de privacidade',true],['terms_text','Termos de participação',true],['notice','Observação ao final dos termos',true]])}</>; break;
    case 'checkout': controls=<>{fields('checkout',[['title','Título do pop-up'],['name_label','Rótulo do nome'],['phone_label','Rótulo do WhatsApp'],['reserve_button','Botão para reservar'],['pix_title','Título das instruções do Pix'],['whatsapp_button','Botão de envio do comprovante'],['instructions','Orientação após reservar',true]])}<p className="notice">O Pix, o nome do recebedor e o WhatsApp de destino ficam em Configurações. O status do pagamento é confirmado em Reservas e pagamentos.</p></>; break;
    case 'details': controls=<>{fields('details',[['back','Botão para voltar às campanhas'],['eyebrow','Frase acima da grade'],['title','Título da seleção de números'],['rules_title','Título do regulamento'],['art_caption','Legenda da arte'],['continue_button','Botão para continuar com Pix']])}</>; break;
    case 'meta': controls=<>{fields('meta',[['title','Título da aba do navegador'],['description','Descrição da página',true]])}<p className="field-help">Use {'{site_name}'} no título para inserir automaticamente o nome do site.</p><ImageField label="Ícone do navegador" value={draft.identity.favicon} onChange={value => update('identity','favicon',value)} onPending={delta => setUploads(value => value+delta)} help="Prefira uma imagem quadrada que seja legível em tamanho pequeno." /></>; break;
  }
  const deviceWidth = device==='mobile' ? 390 : 1200;
  const scale = Math.min(1,Math.max(.1,bounds.width/deviceWidth));
  return <form className="appearance-editor" onSubmit={save}>
    <div className="appearance-toolbar"><div><span className={`edit-status ${dirty ? 'unsaved' : ''}`}><span className="live-dot" />{uploads ? 'Enviando imagem...' : dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span><span className="appearance-toolbar-note">Sua identidade, do seu jeito.</span></div><div><a className="button secondary" href="/" target="_blank" rel="noreferrer"><ExternalLink size={14} />Ver site salvo</a><button type="button" className="icon-button" title="Descartar alterações" aria-label="Descartar alterações" disabled={!dirty || busy || !!uploads} onClick={() => setConfirmation('discard')}><RotateCcw size={17} /></button><button className="button primary" disabled={!dirty || busy || !!uploads}><Save size={16} />{busy ? 'Salvando...' : 'Salvar alterações'}</button></div></div>
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="success-message" role="status"><Check size={16} />{message}</p>}
    <div className="appearance-layout"><div className="appearance-controls"><div className="appearance-groups">{groups.map(item => <button type="button" key={item.id} className={group===item.id ? 'active' : ''} onClick={() => setGroup(item.id)}><item.icon size={15} />{item.title}</button>)}</div><section className="panel appearance-fields"><div className="appearance-fields-heading"><span className="round-icon"><groupInfo.icon size={21} /></span><div><h2>{groupInfo.title}</h2><p>{groupInfo.description}</p></div></div>{controls}</section><div className="appearance-reset"><p>Quer recomeçar pelo visual original?</p><button type="button" className="text-button" onClick={() => setConfirmation('reset')} disabled={busy || !!uploads}>Restaurar visual padrão<RotateCcw size={13} /></button></div></div>
    <aside className="appearance-preview"><div className="preview-toolbar"><span><Eye size={15} />Prévia ao vivo</span><div><button type="button" className={device==='desktop' ? 'active' : ''} aria-label="Prévia no computador" onClick={() => setDevice('desktop')}><Monitor size={16} /></button><button type="button" className={device==='mobile' ? 'active' : ''} aria-label="Prévia no celular" onClick={() => setDevice('mobile')}><Smartphone size={16} /></button><button type="button" aria-label="Recarregar prévia" onClick={refreshPreview}><RefreshCw size={15} /></button></div></div><div className="preview-browser-bar"><span /><span /><span /><p>Seu site · {device==='mobile' ? 'celular' : 'computador'}</p></div><div className="preview-frame-viewport" ref={viewport}>{!previewReady && <div className="preview-loading" role="status">{previewFailed ? <><p>Não foi possível carregar a prévia.</p><button type="button" className="button secondary" onClick={refreshPreview}>Recarregar prévia</button></> : <><span className="spinner" /><p>Carregando prévia...</p></>}</div>}<iframe key={previewVersion} ref={frame} title="Prévia do site com as alterações" src={`/?site_preview=1&preview_session=${previewVersion}`} onLoad={sendPreview} style={{ width:deviceWidth,height:Math.ceil(bounds.height/scale),transform:`scale(${scale})`,left:Math.max(0,(bounds.width-deviceWidth*scale)/2) }} /></div><p className="preview-note">As alterações aparecem só nesta prévia até salvar. {isDemo ? 'Demonstração local.' : 'Rascunhos podem aparecer para conferir o visual.'}</p></aside></div>
    {confirmation && <Modal title={confirmation==='discard' ? 'Descartar as alterações?' : 'Restaurar o visual padrão?'} onClose={() => setConfirmation(null)}><p className="muted modal-intro">{confirmation==='discard' ? 'A prévia voltará para a última versão salva.' : 'Os textos e o tema voltarão ao padrão Jeiel Tattoo. Nome, campanhas e dados de pagamento serão mantidos. O site só muda depois de salvar.'}</p><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setConfirmation(null)}>Voltar</button><button type="button" className="button primary" onClick={() => { if (confirmation==='discard') resetToSaved(); else { setDraft(structuredClone(defaultAppearance)); setMessage('Visual padrão carregado na prévia. Salve para aplicar ao site.'); } setConfirmation(null); }}>{confirmation==='discard' ? 'Descartar alterações' : 'Carregar visual padrão'}</button></div></Modal>}
    {leave && <Modal title="Sair sem salvar?" onClose={() => setLeave(null)}><p className="muted modal-intro">Você tem alterações que ainda não foram salvas.</p><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setLeave(null)}>Continuar editando</button><button type="button" className="button primary" disabled={!!uploads} onClick={() => { bypass.current=true; navigate(leave); }}>Descartar e sair</button></div></Modal>}
  </form>;
}
