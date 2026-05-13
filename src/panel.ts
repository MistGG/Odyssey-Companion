/** Which Electron BrowserWindow this renderer is (from `?panel=` query). */
export function getPanel(): 'dungeon' | 'timeline' | 'meter' | 'update' | 'packetlab' {
  const q = new URLSearchParams(window.location.search).get('panel')
  if (q === 'timeline') return 'timeline'
  if (q === 'meter') return 'meter'
  if (q === 'update') return 'update'
  if (q === 'packetlab') {
    if (import.meta.env.PROD) return 'dungeon'
    return 'packetlab'
  }
  return 'dungeon'
}
