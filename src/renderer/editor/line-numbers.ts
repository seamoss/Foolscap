import { Compartment, type Extension } from '@codemirror/state'
import { type EditorView, lineNumbers } from '@codemirror/view'

/* Line numbers are an editor-only aid. The preview pane renders blocks, not
 * source lines — a paragraph is one block however many lines it spans — so
 * the toggle never touches it.
 *
 * One compartment serves every tab's state: extension() reads the persisted
 * choice at state creation, so fresh tabs open correctly without a follow-up
 * dispatch, and sync() brings a background state built before a toggle
 * current when it is swapped in. */

const STORE_KEY = 'foolscap:line-numbers'
const compartment = new Compartment()

// Off is the empty array, which sync() relies on to read a state's choice.
const contentFor = (on: boolean): Extension => (on ? lineNumbers() : [])

export function lineNumbersOn(): boolean {
  return localStorage.getItem(STORE_KEY) === '1' // off by default
}

export function lineNumbersExtension(): Extension {
  return compartment.of(contentFor(lineNumbersOn()))
}

export function setLineNumbers(view: EditorView, on: boolean): void {
  localStorage.setItem(STORE_KEY, on ? '1' : '0')
  view.dispatch({ effects: compartment.reconfigure(contentFor(on)) })
}

export function syncLineNumbers(view: EditorView): void {
  const on = lineNumbersOn()
  const current = compartment.get(view.state)
  const currentlyOn = !(Array.isArray(current) && current.length === 0)
  if (currentlyOn !== on) view.dispatch({ effects: compartment.reconfigure(contentFor(on)) })
}
