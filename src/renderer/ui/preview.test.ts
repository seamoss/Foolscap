import { describe, expect, it } from 'vitest'
import { bestCoveringIndex, nearestSpanIndex, sourceOffsetAt } from './preview'

describe('bestCoveringIndex', () => {
  it('picks the largest stamp at or below the target', () => {
    expect(bestCoveringIndex([0, 120, 300, 480], 310)).toBe(2)
    expect(bestCoveringIndex([0, 120, 300, 480], 480)).toBe(3)
  })

  it('is not fooled by footnote definitions rendered at the end with early offsets', () => {
    // Body elements in source order, then the hoisted footnote block at pos 50.
    expect(bestCoveringIndex([0, 120, 300, 50], 300)).toBe(2)
  })

  it('returns -1 when everything is past the target', () => {
    expect(bestCoveringIndex([100, 200], 40)).toBe(-1)
  })

  it('skips unstamped elements (NaN)', () => {
    expect(bestCoveringIndex([0, NaN, 80], 90)).toBe(2)
  })
})

describe('nearestSpanIndex', () => {
  const spans = [
    { top: 0, bottom: 100 },
    { top: 100, bottom: 240 },
    { top: 260, bottom: 400 }
  ]

  it('picks the span covering the target line', () => {
    expect(nearestSpanIndex(spans, 150)).toBe(1)
  })

  it('picks the nearest span when the target falls in a gap', () => {
    expect(nearestSpanIndex(spans, 245)).toBe(1)
    expect(nearestSpanIndex(spans, 255)).toBe(2)
  })

  it('ties go to the later span, so nested elements win over parents', () => {
    // A parent covering [0, 400] listed before its child covering [100, 240].
    const nested = [{ top: 0, bottom: 400 }, ...spans]
    expect(nearestSpanIndex(nested, 150)).toBe(2)
  })

  it('returns -1 on empty input', () => {
    expect(nearestSpanIndex([], 50)).toBe(-1)
  })
})

describe('sourceOffsetAt', () => {
  it('maps a click in plain prose straight through', () => {
    const src = "I put every number that claims to tell you you're winning into piles."
    const at = src.indexOf('winning') + 3 // mid-word
    expect(sourceOffsetAt(src, 0, src, at)).toBe(at)
  })

  it('picks the right occurrence of a repeated word', () => {
    const src = 'the cat and the dog and the bird'
    const second = src.indexOf('the', 1)
    const third = src.indexOf('the', second + 1)
    expect(sourceOffsetAt(src, 0, src, second)).toBe(second)
    expect(sourceOffsetAt(src, 0, src, third + 2)).toBe(third + 2)
  })

  it("does not count a word embedded in a longer word ('you' in \"you're\")", () => {
    const src = "tell you you're winning, you know"
    const rendered = src
    const lastYou = src.lastIndexOf('you')
    expect(sourceOffsetAt(src, 0, rendered, lastYou + 1)).toBe(lastYou + 1)
  })

  it('skips mark syntax the rendered text does not show', () => {
    const src = 'intro\n\n**Business outcomes.** The money talks.'
    const rendered = 'Business outcomes. The money talks.'
    const blockPos = src.indexOf('**')
    const at = rendered.indexOf('money')
    expect(sourceOffsetAt(src, blockPos, rendered, at)).toBe(src.indexOf('money'))
  })

  it('lands in link text, not the URL', () => {
    const src = 'see [the docs](https://docs.example.com/docs) here'
    const rendered = 'see the docs here'
    const at = rendered.indexOf('docs')
    expect(sourceOffsetAt(src, 0, rendered, at)).toBe(src.indexOf('docs'))
  })

  it('maps heading text past the # marks', () => {
    const src = 'above\n\n## Section nine\n\nbelow'
    const blockPos = src.indexOf('##')
    const rendered = 'Section nine'
    const at = rendered.indexOf('nine')
    expect(sourceOffsetAt(src, blockPos, rendered, at)).toBe(src.indexOf('nine'))
  })

  it('returns null when the word is split by marks in the source', () => {
    const src = 'you are win**ning** today'
    const rendered = 'you are winning today'
    expect(sourceOffsetAt(src, 0, rendered, rendered.indexOf('winning') + 2)).toBeNull()
  })

  it('returns null on a click that touches no word', () => {
    const src = 'alpha — beta'
    expect(sourceOffsetAt(src, 0, src, src.indexOf('—'))).toBeNull()
  })

  it('keeps the click offset inside the word', () => {
    const src = 'plain winning text'
    const at = src.indexOf('winning') + 5
    expect(sourceOffsetAt(src, 0, src, at)).toBe(at)
  })
})
