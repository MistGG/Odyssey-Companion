/**
 * Maps a keydown event to an Electron globalShortcut accelerator string.
 * @see https://www.electronjs.org/docs/latest/api/accelerator
 */
export function keyboardEventToAccelerator(e: KeyboardEvent): string | null {
  if (e.repeat) return null

  const code = e.code

  if (
    code === 'ControlLeft' ||
    code === 'ControlRight' ||
    code === 'ShiftLeft' ||
    code === 'ShiftRight' ||
    code === 'AltLeft' ||
    code === 'AltRight' ||
    code === 'MetaLeft' ||
    code === 'MetaRight'
  ) {
    return null
  }

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')
  if (e.metaKey) parts.push('Super')

  let main = ''

  const fn = code.match(/^F(\d{1,2})$/)
  if (fn) {
    main = `F${fn[1]}`
  } else if (code.startsWith('Key')) {
    main = code.slice(3).toUpperCase()
  } else if (code.startsWith('Digit')) {
    main = code.slice(5)
  } else {
    const np = code.match(/^Numpad(\d)$/)
    if (np) {
      main = `num${np[1]}`
    } else {
      const map: Record<string, string> = {
        Space: 'Space',
        Minus: '-',
        Equal: '=',
        BracketLeft: '[',
        BracketRight: ']',
        Backslash: '\\',
        Semicolon: ';',
        Quote: "'",
        Comma: ',',
        Period: '.',
        Slash: '/',
        Backquote: '`',
        IntlBackslash: '\\',
        Tab: 'Tab',
        Enter: 'Enter',
        Escape: 'Escape',
        Backspace: 'Backspace',
        Delete: 'Delete',
        Insert: 'Insert',
        Home: 'Home',
        End: 'End',
        PageUp: 'PageUp',
        PageDown: 'PageDown',
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        NumpadDivide: 'numdiv',
        NumpadMultiply: 'nummult',
        NumpadSubtract: 'numsub',
        NumpadAdd: 'numadd',
        NumpadDecimal: 'numdec',
      }
      main = map[code] ?? ''
    }
  }

  if (!main) return null

  if (parts.length === 0) return main
  return `${parts.join('+')}+${main}`
}
