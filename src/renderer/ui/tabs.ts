import type { TabsState } from '../../shared/types'

/* The tab strip, living inside the titlebar drag region. Hidden with a
 * single tab — a one-document window looks exactly like it always did.
 *
 * Main owns tab identity, order, and activation; this bar renders
 * tabs:state and sends intents back. Drags are pointer-based: horizontal
 * movement reorders within the strip, and pulling a tab past the detach
 * threshold tears it out into its own window at the drop point. */

export interface TabBarHooks {
  onActivate(docId: number): void
  onClose(docId: number): void
  onReorder(docId: number, toIndex: number): void
  onDetach(docId: number, screenX: number, screenY: number): void
  onNewTab(): void
  /* ⌘-click: the path menu for this tab's file. */
  onPathMenu(docId: number): void
}

const DRAG_START_PX = 4
const DETACH_PX = 44

interface DragState {
  docId: number
  el: HTMLElement
  startX: number
  startY: number
  /* Midpoints of every tab at dragstart, in DOM order — the reorder target
   * index is how many of them sit left of the pointer. */
  midpoints: number[]
  fromIndex: number
  dragging: boolean
  detachArmed: boolean
}

export class TabBar {
  private readonly el: HTMLElement
  private state: TabsState | null = null
  private drag: DragState | null = null

  constructor(
    strip: HTMLElement,
    private readonly hooks: TabBarHooks
  ) {
    this.el = document.createElement('div')
    this.el.className = 'tabbar'
    this.el.hidden = true
    strip.append(this.el)
  }

  get visible(): boolean {
    return !this.el.hidden
  }

  update(state: TabsState): void {
    this.state = state
    // Mid-drag rerenders would yank the tab out from under the pointer;
    // the pending state lands when the drag resolves (main re-broadcasts).
    if (this.drag) return
    this.render()
  }

  private render(): void {
    const state = this.state
    if (!state || state.tabs.length <= 1) {
      this.el.hidden = true
      this.el.replaceChildren()
      return
    }
    this.el.hidden = false
    const items = state.tabs.map((tab) => {
      const el = document.createElement('div')
      el.className = 'tab'
      if (tab.docId === state.active) el.classList.add('active')
      el.dataset['docId'] = String(tab.docId)
      if (tab.path) el.title = tab.path

      if (tab.dirty) {
        const dot = document.createElement('span')
        dot.className = 'tab-dirty'
        dot.textContent = '•'
        el.append(dot)
      }
      const name = document.createElement('span')
      name.className = 'tab-name'
      name.textContent = tab.name
      el.append(name)

      const close = document.createElement('button')
      close.className = 'tab-close'
      close.type = 'button'
      close.textContent = '×'
      close.title = 'Close tab'
      close.setAttribute('aria-label', `Close ${tab.name}`)
      close.addEventListener('pointerdown', (e) => e.stopPropagation())
      close.addEventListener('click', (e) => {
        e.stopPropagation()
        this.hooks.onClose(tab.docId)
      })
      el.append(close)

      el.addEventListener('pointerdown', (e) => this.onPointerDown(e, tab.docId, el))
      return el
    })

    const add = document.createElement('button')
    add.className = 'tab-add'
    add.type = 'button'
    add.textContent = '+'
    add.title = 'New tab (⌘T)'
    add.setAttribute('aria-label', 'New tab')
    add.addEventListener('click', () => this.hooks.onNewTab())

    this.el.replaceChildren(...items, add)
  }

  private onPointerDown(e: PointerEvent, docId: number, el: HTMLElement): void {
    if (e.button !== 0) return
    // ⌘-click asks where the file lives; it neither activates nor drags.
    if (e.metaKey) {
      e.preventDefault()
      this.hooks.onPathMenu(docId)
      return
    }
    const tabs = [...this.el.querySelectorAll<HTMLElement>('.tab')]
    this.drag = {
      docId,
      el,
      startX: e.clientX,
      startY: e.clientY,
      midpoints: tabs.map((t) => {
        const r = t.getBoundingClientRect()
        return r.left + r.width / 2
      }),
      fromIndex: tabs.indexOf(el),
      dragging: false,
      detachArmed: false
    }
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // capture is an optimization (drag keeps tracking outside the strip);
      // without it the handlers still work for in-strip gestures
    }
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerCancel)
  }

  private onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.dragging && Math.abs(dx) < DRAG_START_PX && Math.abs(dy) < DRAG_START_PX) return
    drag.dragging = true

    const detach = Math.abs(dy) > DETACH_PX
    if (detach !== drag.detachArmed) {
      drag.detachArmed = detach
      drag.el.classList.toggle('tab-detaching', detach)
    }
    // The tab rides the pointer: along the strip while reordering, freely
    // (ghosted) once the pull is far enough to mean "make this a window".
    drag.el.style.transform = detach ? `translate(${dx}px, ${dy}px)` : `translateX(${dx}px)`
    drag.el.classList.add('tab-dragging')
  }

  private onPointerUp = (e: PointerEvent): void => {
    const drag = this.drag
    if (!drag) return
    this.endDrag()
    if (!drag.dragging) {
      this.hooks.onActivate(drag.docId)
      return
    }
    if (drag.detachArmed) {
      this.hooks.onDetach(drag.docId, e.screenX, e.screenY)
      return
    }
    const toIndex = drag.midpoints.filter((mid) => mid < e.clientX).length
    // Crossing your own midpoint isn't a move; correct for the gap the
    // dragged tab leaves behind.
    const adjusted = toIndex > drag.fromIndex ? toIndex - 1 : toIndex
    if (adjusted !== drag.fromIndex) this.hooks.onReorder(drag.docId, adjusted)
    else this.render()
  }

  private onPointerCancel = (): void => {
    this.endDrag()
    this.render()
  }

  private endDrag(): void {
    const drag = this.drag
    if (!drag) return
    this.drag = null
    drag.el.style.transform = ''
    drag.el.classList.remove('tab-dragging', 'tab-detaching')
    drag.el.removeEventListener('pointermove', this.onPointerMove)
    drag.el.removeEventListener('pointerup', this.onPointerUp)
    drag.el.removeEventListener('pointercancel', this.onPointerCancel)
  }
}
