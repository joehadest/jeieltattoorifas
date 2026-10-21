export function navigate(path: string) {
  const event = new CustomEvent('app:navigate', { detail: path, cancelable: true });
  if (!window.dispatchEvent(event)) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
