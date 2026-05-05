/** Which Electron BrowserWindow this renderer is (from `?panel=` query). */
export function getPanel(): 'dungeon' | 'timeline' {
  const q = new URLSearchParams(window.location.search).get('panel')
  return q === 'timeline' ? 'timeline' : 'dungeon'
}
