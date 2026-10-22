import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpRight, ArrowRight, Ticket, Menu, X, Search, SlidersHorizontal, ShieldCheck, MessageCircle, Zap, Gift, Sparkles, ChevronDown, Plus } from 'lucide-react';
import { loadTickets, isDemo } from '../lib/api';
import { money, type Campaign, type Order, type Settings } from '../lib/domain';
import { useAuth } from '../lib/auth';
import { appearanceStyle, normalizeAppearance, type SiteAppearance, type SectionKey } from '../lib/appearance';
import { navigate } from '../lib/navigation';
import { Brand, SafeImage } from './SiteElements';
import Modal from './Modal';
import CampaignDetail from './CampaignDetail';
import ParticipantAccount from './ParticipantAccount';
import DrawResults from './DrawResults';
const Payment = lazy(() => import('./Payment'));
type Checkout = { campaign: Campaign; numbers: number[]; order?: Order };

export default function PublicSite({ path, settings, campaigns, loading, error, reload, preview = false }: {
  path: string; settings: Settings; campaigns: Campaign[]; loading: boolean; error: string; reload: () => Promise<void>; preview?: boolean;
}) {
  const appearance = normalizeAppearance(settings.appearance);
  const { header, hero, footer, sections } = appearance;
  const [mobileMenu,setMobileMenu] = useState(false);
  const [filter,setFilter] = useState('Todas'); const [query,setQuery] = useState(''); const [sort,setSort] = useState('featured');
  const [checkout,setCheckout] = useState<Checkout|null>(null); const [revision,setRevision] = useState(0);
  const {user}=useAuth(); const previousUser=useRef(user?.id);
  useEffect(()=>{if(previousUser.current && previousUser.current!==user?.id)setCheckout(null);previousUser.current=user?.id;},[user?.id]);
  const [info,setInfo] = useState<'privacy'|'terms'|null>(null);
  useEffect(() => setMobileMenu(false),[path]);
  const current = campaigns.find(c => path === `/campanha/${c.id}`);
  const featured = campaigns.find(c => c.id === hero.featured_id && c.status === 'active') || campaigns.find(c => c.status === 'active');
  const visible = campaigns.filter(c => c.status !== 'paused' && (filter === 'Todas' || c.category === filter) && c.title.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
    .sort((a,b) => sort === 'price' ? a.price-b.price : sort === 'recent' ? campaigns.indexOf(b)-campaigns.indexOf(a) : 0);
  const activeCount = campaigns.filter(c => c.status === 'active').length;
  function section(id: string) {
    if (path !== '/') navigate(preview ? '/?site_preview=1' : '/');
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior:'smooth' }),30);
    setMobileMenu(false);
  }
  function openOrders() { if(!preview)navigate('/conta'); }
  const brand = <Brand name={settings.site_name} logo={appearance.identity.logo} width={appearance.identity.logo_width} alt={appearance.identity.logo_alt} />;
  const nav = <>
    {sections.visible.campaigns && <button onClick={() => section('campanhas')}>{header.campaigns_label}</button>}
    {sections.visible.how && <button onClick={() => section('como-funciona')}>{header.how_label}</button>}
    {sections.visible.faq && <button onClick={() => section('duvidas')}>{header.faq_label}</button>}
    <button onClick={()=>{if(!preview)navigate('/resultados');}}>{header.results_label}</button>
  </>;
  const homeSections: Record<SectionKey,ReactNode> = {
    hero: <section className="hero container" id="destaque"><div className="hero-copy">
      <span className="eyebrow"><span className="tiny-line" />{hero.eyebrow}</span>
      <h1><span className="hero-title-lines">{hero.title}</span>{hero.highlight && <><br /><span className="hero-highlight">{hero.highlight}<svg viewBox="0 0 340 14" aria-hidden="true"><path d="M3 10Q164-4 335 6" /></svg></span></>}</h1>
      <p className="preserve-lines">{hero.description}</p>
      <button className="button primary hero-cta" onClick={() => featured ? navigate(`/campanha/${featured.id}`) : section('campanhas')}>{hero.button}<ArrowUpRight size={19} /></button>
      {(hero.caption || hero.caption_emphasis) && <div className="hero-caption"><Ticket size={16} /><span>{hero.caption} <strong>{hero.caption_emphasis}</strong></span></div>}
    </div><div className={`hero-visual ${hero.image_fit === 'contain' ? 'tattoo-poster' : ''}`}>
      {featured || hero.image ? <>
        <SafeImage src={hero.image || featured!.image} alt={hero.image_alt || featured?.title || ''} className="hero-image" eager fit={hero.image_fit} />
        {hero.image_fit === 'cover' && <div className="hero-image-shade" />}
        {hero.badge && <div className="hero-badge"><span className="live-dot" />{hero.badge}</div>}
        {hero.side_text && <div className="hero-side-label">{hero.side_text}</div>}
        {featured && hero.image_fit === 'cover' && <div className="hero-card-bottom"><div><h2>{featured.title}</h2><p>{featured.subtitle}</p></div><button className="hero-arrow" aria-label={`Participar de ${featured.title}`} onClick={() => navigate(`/campanha/${featured.id}`)}><ArrowUpRight size={29} /></button></div>}
        {hero.credit && <span className="hero-photo-credit">{hero.credit}</span>}
      </> : <div className="no-featured"><Ticket size={60} /><h2>{hero.empty_title}</h2><p>{hero.empty_text}</p></div>}
    </div></section>,
    trust: <div className="trust-strip"><div className="container trust-inner">{appearance.trust.map((text,i) => {
      const Icon = [ShieldCheck,Ticket,MessageCircle,Zap][i%4];
      return <span key={i}><Icon />{text}</span>;
    })}</div></div>,
    campaigns: <section className="container campaigns-section" id="campanhas">
      <div className="section-title-row"><div><span className="eyebrow muted">{appearance.campaigns.eyebrow}</span><h2>{appearance.campaigns.title}</h2></div><span className="count-badge"><span className="live-dot" />{activeCount} campanha{activeCount !== 1 ? 's' : ''} ativa{activeCount !== 1 ? 's' : ''}</span></div>
      <div className="campaign-toolbar"><div className="filter-tabs">{['Todas',...Array.from(new Set(campaigns.map(c => c.category)))].map(category => <button key={category} className={filter === category ? 'filter active' : 'filter'} onClick={() => setFilter(category)}>{category === 'Todas' && <SlidersHorizontal size={14} />}{category}</button>)}</div>
      <div className="search-sort"><div className="search-box"><Search size={16} /><input aria-label={appearance.campaigns.search} placeholder={appearance.campaigns.search} value={query} onChange={e => setQuery(e.target.value)} /></div><label className="sort-control"><SlidersHorizontal size={15} /><select aria-label="Ordenar campanhas" value={sort} onChange={e => setSort(e.target.value)}><option value="featured">Destaques</option><option value="price">Menor valor</option><option value="recent">Mais recentes</option></select><ChevronDown size={13} /></label></div></div>
      <div className={`campaign-grid ${visible.length === 1 ? 'single-campaign' : ''}`}>{visible.map((campaign,index) => <CampaignCard key={campaign.id} campaign={campaign} revision={revision} featured={index === 0} copy={appearance.campaigns} />)}</div>
      {!visible.length && <div className="empty-state"><Search size={32} /><h3>Nenhuma campanha por aqui.</h3><p>Tente outra categoria ou outro termo de busca.</p><button className="text-button" onClick={() => { setFilter('Todas'); setQuery(''); }}>Limpar filtros</button></div>}
      <p className="demo-caption">{isDemo ? 'Demonstração local. Não efetue pagamentos reais.' : appearance.campaigns.footnote}</p>
    </section>,
    how: <section className="container how-section" id="como-funciona"><div className="how-intro"><span className="eyebrow">{appearance.how.eyebrow}</span><h2 className="preserve-lines">{appearance.how.title}</h2><p className="preserve-lines">{appearance.how.description}</p><span className="how-decor"><Ticket size={76} strokeWidth={1} /></span></div>
      <div className="steps" style={{ gridTemplateColumns:`repeat(${Math.max(1,Math.min(3,appearance.how.steps.length))},1fr)` }}>{appearance.how.steps.map((step,i) => {
        const Icon = [Ticket,Zap,MessageCircle][i%3];
        return <div className="how-step" key={i}><span className="step-number">{String(i+1).padStart(2,'0')}</span><div className="step-icon"><Icon size={22} /></div><h3>{step.title}</h3><p>{step.text}</p>{i < appearance.how.steps.length-1 && <ArrowRight className="step-arrow" size={17} />}</div>;
      })}</div>
    </section>,
    faq: <section className="container faq-section" id="duvidas"><div><span className="eyebrow muted">{appearance.faq.eyebrow}</span><h2>{appearance.faq.title}</h2><p>{appearance.faq.description}</p></div><div className="faq-list">{appearance.faq.items.map((item,i) => <details key={i}><summary>{item.question}<Plus size={17} /></summary><p className="preserve-lines">{item.answer}</p></details>)}</div></section>,
  };
  return <div className="public-site" style={appearanceStyle(appearance) as CSSProperties}>
    {preview && <div className="site-preview-banner">Prévia de edição · nenhuma reserva será criada</div>}
    {header.announcement_enabled && <div className="announcement"><span className="live-dot" />{header.announcement}<span className="announcement-side">{header.side_text}<Sparkles size={12} /></span></div>}
    <header className="site-header"><div className="container header-inner"><a href="/" aria-label={`${settings.site_name}, início`} onClick={e => { e.preventDefault(); navigate(preview ? '/?site_preview=1' : '/'); }}>{brand}</a><nav className={mobileMenu ? 'main-nav open' : 'main-nav'}>{nav}</nav><div className="header-actions"><button className="button secondary my-numbers" onClick={openOrders}><Ticket size={16} />{header.orders_label}</button><button className="icon-button mobile-toggle" aria-label={mobileMenu ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMobileMenu(!mobileMenu)}>{mobileMenu ? <X /> : <Menu />}</button></div></div></header>
    <main>
      {error && <div className="container"><div className="error load-error" role="alert">{error}<button className="text-button" onClick={reload}>Tentar novamente</button></div></div>}
      {loading ? <div className="container loading-state"><span className="spinner" />Preparando suas possibilidades...</div> : path.startsWith('/conta') && !preview ? <ParticipantAccount key={user?.id||'visitor'} path={path} campaigns={campaigns} onPayment={order=>setCheckout({campaign:order.campaign,numbers:order.numbers,order})}/> : path==='/resultados' && !preview ? <section className="container results-page"><span className="eyebrow">SORTEIOS DO SITE</span><h1>Resultados dos sorteios</h1><p>Os resultados serão publicados aqui após a realização do sorteio pelo organizador.</p><DrawResults campaigns={campaigns}/></section> : current ? <CampaignDetail key={current.id} campaign={current} revision={revision} copy={appearance.details} onCheckout={numbers => setCheckout({ campaign:current,numbers })} /> : path.startsWith('/campanha/') ? <div className="container empty-state"><Gift size={40} /><h1>Campanha não encontrada</h1><button className="button primary" onClick={() => navigate(preview ? '/?site_preview=1' : '/')}>Voltar para as campanhas</button></div> : sections.order.filter(key => sections.visible[key]).map(key => <div className="site-section" data-section={key} key={key}>{homeSections[key]}</div>)}
      {!preview && (current || path==='/') && <DrawResults campaigns={campaigns} campaignId={current?.id}/>}
    </main>
    <footer><div className="container footer-top"><div><a href="/" onClick={e => { e.preventDefault(); navigate(preview ? '/?site_preview=1' : '/'); }}>{brand}</a><p>{footer.tagline}</p></div><div className="footer-links">{nav}<button onClick={() => setInfo('terms')}>{footer.terms_label}</button></div>{footer.location && <div className="footer-social"><Ticket size={18} /><span>{footer.location}</span></div>}</div><div className="container footer-bottom"><span>© {new Date().getFullYear()} {settings.site_name}. {footer.copyright}</span><div><button onClick={() => setInfo('privacy')}>{footer.privacy_label}</button><button onClick={() => setInfo('terms')}>{footer.terms_label}</button></div></div></footer>
    {checkout && <Suspense fallback={null}><Payment key={checkout.order?.id || `${checkout.campaign.id}-${checkout.numbers.join('-')}`} {...checkout} settings={settings} copy={appearance.checkout} preview={preview} onClose={() => setCheckout(null)} onReserved={() => setRevision(v => v+1)} onConfigure={() => { setCheckout(null); if (!preview) navigate('/admin/configuracoes'); }} /></Suspense>}
    {info && <Modal brand={settings.site_name} title={info === 'privacy' ? footer.privacy_label : footer.terms_label} onClose={() => setInfo(null)}><p className="muted modal-intro preserve-lines">{info === 'privacy' ? footer.privacy_text : footer.terms_text}</p>{footer.notice && <p className="notice preserve-lines">{footer.notice}</p>}</Modal>}
  </div>;
}

function CampaignCard({ campaign, featured, revision, copy }: { campaign: Campaign; featured: boolean; revision: number; copy: SiteAppearance['campaigns'] }) {
  const [sold,setSold] = useState(0);
  useEffect(() => { let active = true; loadTickets(campaign.id).then(tickets => { if (active) setSold(tickets.filter(t => t.status === 'paid').length); }).catch(() => {}); return () => { active = false; }; },[campaign.id,revision]);
  const percent = Math.round(sold/campaign.total_numbers*100);
  return <article className="campaign-card"><a className="card-image-wrap" href={`/campanha/${campaign.id}`} onClick={e => { e.preventDefault(); navigate(`/campanha/${campaign.id}`); }}><SafeImage src={campaign.image} alt={campaign.title} /><span className="card-category">{campaign.category}</span><span className={`card-status ${featured ? 'featured' : ''}`}>{featured ? <Zap size={12} fill="currentColor" /> : <span className="live-dot" />}{campaign.status === 'finished' ? 'Encerrada' : featured ? 'Em destaque' : copy.button}</span><span className="card-image-arrow"><ArrowUpRight size={20} /></span></a><div className="card-content"><div className="card-overline"><span>{campaign.total_numbers.toLocaleString('pt-BR')} NÚMEROS</span><span>#{campaign.id.slice(-3)}</span></div><h3><a href={`/campanha/${campaign.id}`} onClick={e => { e.preventDefault(); navigate(`/campanha/${campaign.id}`); }}>{campaign.title}</a></h3><p>{campaign.subtitle}</p><div className="progress-label"><span>{sold} números confirmados</span><strong>{percent}%</strong></div><div className="progress-track"><span style={{ width:`${percent}%` }} /></div><div className="card-bottom"><div><span>Por número</span><strong>{money(campaign.price)}</strong></div><button className="button card-button" onClick={() => navigate(`/campanha/${campaign.id}`)}>{campaign.status === 'finished' ? 'Ver campanha' : copy.button}<ArrowUpRight size={16} /></button></div></div></article>;
}
