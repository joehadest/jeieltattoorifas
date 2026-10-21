import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { loadPublic } from './lib/api';
import { defaultSettings, type Campaign, type Settings } from './lib/domain';
import { normalizeAppearance } from './lib/appearance';
import { navigate } from './lib/navigation';
import PublicSite from './components/PublicSite';
const Admin = lazy(() => import('./components/Admin'));

export default function App() {
  const [path,setPath] = useState(window.location.pathname);
  const [settings,setSettings] = useState<Settings>(defaultSettings);
  const [campaigns,setCampaigns] = useState<Campaign[]>([]);
  const [loading,setLoading] = useState(true); const [error,setError] = useState('');
  const [previewEnabled] = useState(() => window.parent !== window && new URLSearchParams(window.location.search).get('site_preview') === '1');
  const [preview,setPreview] = useState<{ settings:Settings; campaigns:Campaign[] }|null>(null);
  const reload = useCallback(async () => {
    try { const data = await loadPublic(); setSettings(data.settings); setCampaigns(data.campaigns); setError(''); }
    catch { setError('Não foi possível carregar os dados. Confira a conexão com o Supabase.'); }
    finally { setLoading(false); }
  },[]);
  useEffect(() => {
    void reload();
    const route = () => setPath(window.location.pathname);
    const refresh = () => { void reload(); };
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('site-settings') : null;
    if (channel) channel.onmessage = refresh;
    window.addEventListener('popstate',route); window.addEventListener('storage',refresh); window.addEventListener('site-settings-updated',refresh);
    return () => { window.removeEventListener('popstate',route); window.removeEventListener('storage',refresh); window.removeEventListener('site-settings-updated',refresh); channel?.close(); };
  },[reload]);
  useEffect(() => {
    if (!previewEnabled) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'site-preview-reset') { navigate('/?site_preview=1'); return; }
      if (event.data.type !== 'site-preview' || !event.data.settings || typeof event.data.settings.site_name !== 'string') return;
      const appearance = normalizeAppearance(event.data.settings.appearance);
      setPreview({ settings:{ ...settings, site_name:event.data.settings.site_name.slice(0,50), appearance }, campaigns:Array.isArray(event.data.campaigns) ? event.data.campaigns : campaigns });
      window.parent.postMessage({ type:'site-preview-applied' },window.location.origin);
    };
    window.addEventListener('message',receive);
    window.parent.postMessage({ type:'site-preview-ready' },window.location.origin);
    return () => window.removeEventListener('message',receive);
  },[previewEnabled,settings,campaigns]);
  const shownSettings = preview?.settings || settings;
  const appearance = normalizeAppearance(shownSettings.appearance);
  useEffect(() => {
    document.title = path.startsWith('/admin') ? `Painel · ${settings.site_name}` : appearance.meta.title.replaceAll('{site_name}',shownSettings.site_name);
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = appearance.meta.description;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) favicon.href = appearance.identity.favicon || '/favicon.svg';
  },[appearance.meta.title,appearance.meta.description,appearance.identity.favicon,path,settings.site_name,shownSettings.site_name]);
  if (path.startsWith('/admin') && !previewEnabled) return <Suspense fallback={<div className="loading-state"><span className="spinner" />Carregando painel...</div>}><Admin settings={settings} campaigns={campaigns} loading={loading} loadError={error} reload={reload} /></Suspense>;
  return <PublicSite path={path} settings={shownSettings} campaigns={preview?.campaigns || campaigns} loading={preview ? false : loading} error={preview ? '' : error} reload={reload} preview={previewEnabled} />;
}
