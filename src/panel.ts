/** Which Electron BrowserWindow this renderer is (from `?panel=` query). */
export function getPanel(): 'dungeon' | 'timeline' | 'meter' | 'timers' | 'hud' | 'settings' | 'update' {
  const q = new URLSearchParams(window.location.search).get('panel')
  if (q === 'timeline') return 'timeline'
  if (q === 'meter') return 'meter'
  if (q === 'timers') return 'timers'
  if (q === 'hud') return 'hud'
  if (q === 'settings') return 'settings'
  if (q === 'update') return 'update'
  return 'dungeon'
}
