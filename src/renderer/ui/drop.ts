import { DROPPABLE_FILE, DROPPABLE_IMAGE } from '../../shared/types'

/* 'open' a markdown file, 'image' places pictures into the document,
 * 'reject' anything else (never let it land as pasted text), 'pass' a
 * plain text drag to CodeMirror. A mixed drop is judged by its first file. */
export type DropVerdict = 'open' | 'image' | 'reject' | 'pass'

export function classifyDrop(fileNames: readonly string[]): DropVerdict {
  const first = fileNames[0]
  if (first === undefined) return 'pass'
  if (DROPPABLE_FILE.test(first)) return 'open'
  if (DROPPABLE_IMAGE.test(first)) return 'image'
  return 'reject'
}

/* The images in a drop judged 'image'; anything else riding along is
 * ignored rather than opened or rejected. */
export function droppedImages<T extends { name: string }>(files: readonly T[]): T[] {
  return files.filter((f) => DROPPABLE_IMAGE.test(f.name))
}
