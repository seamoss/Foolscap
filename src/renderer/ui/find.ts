import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery
} from '@codemirror/search'
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view'

/* Custom find & replace panel (replaces @codemirror/search's default, which
 * lays out with a <br> and reads like a toolbar spill). Two aligned rows:
 * search + navigation + mode chips, replace + actions. Enter finds next,
 * Shift+Enter previous, Escape closes. Regex optional, per the plan. */

const COUNT_CAP = 1000

function button(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label
  el.title = title
  el.setAttribute('aria-label', title)
  el.addEventListener('click', onClick)
  return el
}

function chip(label: string, title: string, initial: boolean, onToggle: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'find-chip'
  el.textContent = label
  el.title = title
  el.setAttribute('aria-label', title)
  el.setAttribute('aria-pressed', String(initial))
  el.addEventListener('click', () => {
    el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') !== 'true'))
    onToggle()
  })
  return el
}

const pressed = (el: HTMLButtonElement): boolean => el.getAttribute('aria-pressed') === 'true'

export function createFindPanel(view: EditorView): Panel {
  const existing = getSearchQuery(view.state)

  const dom = document.createElement('div')
  dom.className = 'find-panel'

  const searchInput = document.createElement('input')
  searchInput.className = 'find-input'
  searchInput.placeholder = 'Find'
  searchInput.setAttribute('aria-label', 'Find')
  // openSearchPanel on an already-open panel looks for [main-field] to
  // refocus and reselect; without it a second ⌘F is a silent no-op.
  searchInput.setAttribute('main-field', 'true')
  searchInput.value = existing.search

  const replaceInput = document.createElement('input')
  replaceInput.className = 'find-input'
  replaceInput.placeholder = 'Replace'
  replaceInput.setAttribute('aria-label', 'Replace with')
  replaceInput.value = existing.replace

  const count = document.createElement('span')
  count.className = 'find-count'

  const caseChip = chip('Aa', 'Match case', existing.caseSensitive, () => commit())
  const reChip = chip('.*', 'Regular expression', existing.regexp, () => commit())
  const wordChip = chip('ab', 'Whole word', existing.wholeWord, () => commit())

  const commit = (): void => {
    const query = new SearchQuery({
      search: searchInput.value,
      replace: replaceInput.value,
      caseSensitive: pressed(caseChip),
      regexp: pressed(reChip),
      wholeWord: pressed(wordChip)
    })
    // Recounting happens in update() when the effect lands — one path for
    // our own commits and for queries set from outside (openSearchPanel
    // seeds from the selection when the panel is already open).
    view.dispatch({ effects: setSearchQuery.of(query) })
  }

  const syncFromQuery = (query: SearchQuery): void => {
    if (searchInput.value !== query.search) searchInput.value = query.search
    if (replaceInput.value !== query.replace) replaceInput.value = query.replace
    caseChip.setAttribute('aria-pressed', String(query.caseSensitive))
    reChip.setAttribute('aria-pressed', String(query.regexp))
    wordChip.setAttribute('aria-pressed', String(query.wholeWord))
    recount(query)
  }

  const recount = (query: SearchQuery): void => {
    if (!query.search || !query.valid) {
      count.textContent = ''
      return
    }
    let n = 0
    const cursor = query.getCursor(view.state)
    while (n < COUNT_CAP && !cursor.next().done) n++
    count.textContent = n >= COUNT_CAP ? `${COUNT_CAP}+` : `${n} ${n === 1 ? 'match' : 'matches'}`
  }

  searchInput.addEventListener('input', commit)
  replaceInput.addEventListener('input', commit)

  dom.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearchPanel(view)
    } else if (e.key === 'Enter' && e.target === searchInput) {
      e.preventDefault()
      ;(e.shiftKey ? findPrevious : findNext)(view)
    } else if (e.key === 'Enter' && e.target === replaceInput) {
      e.preventDefault()
      replaceNext(view)
    }
  })

  const searchRow = document.createElement('div')
  searchRow.className = 'find-row'
  const chips = document.createElement('span')
  chips.className = 'find-chips'
  chips.append(caseChip, reChip, wordChip)
  searchRow.append(
    searchInput,
    button('‹', 'Previous match', () => findPrevious(view)),
    button('›', 'Next match', () => findNext(view)),
    chips,
    count,
    button('×', 'Close', () => closeSearchPanel(view))
  )

  const replaceRow = document.createElement('div')
  replaceRow.className = 'find-row'
  replaceRow.append(
    replaceInput,
    button('Replace', 'Replace this match', () => replaceNext(view)),
    button('All', 'Replace all matches', () => replaceAll(view))
  )

  dom.append(searchRow, replaceRow)

  let recountTimer: number | undefined
  return {
    dom,
    top: true,
    mount: () => {
      searchInput.focus()
      searchInput.select()
    },
    update: (update: ViewUpdate) => {
      for (const tr of update.transactions)
        for (const effect of tr.effects)
          if (effect.is(setSearchQuery)) syncFromQuery(effect.value)
      if (update.docChanged) {
        window.clearTimeout(recountTimer)
        recountTimer = window.setTimeout(() => recount(getSearchQuery(view.state)), 200)
      }
    }
  }
}
