/** Which Electron BrowserWindow this renderer is (from `?panel=` query). */
export function getPanel(): 'dungeon' | 'timeline' | 'meter' {
  const q = new URLSearchParams(window.location.search).get('panel')
  if (q === 'timeline') return 'timeline'
  if (q === 'meter') return 'meter'
  return 'dungeon'
}
