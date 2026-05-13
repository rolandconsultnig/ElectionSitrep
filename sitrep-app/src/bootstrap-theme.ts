/** Run before React so first paint matches stored theme (avoids relying on inline script in index.html). */
try {
  const t = localStorage.getItem('npf_theme')
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t
  else document.documentElement.dataset.theme = 'light'
} catch {
  document.documentElement.dataset.theme = 'light'
}
