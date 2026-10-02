import { afterEach, describe, expect, mock, test } from 'bun:test'
import fixture from './fixtures/content-ownership.json'
import { csrfTokenIn, pageOf, readLibrary, titleOf } from './library'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const cookies = [{ name: 'session-token', value: 't', domain: '.amazon.fr' }]

describe('pageOf', () => {
  test('reads the items and the account count', () => {
    const page = pageOf(fixture)

    expect(page.items.map((item) => item.asin)).toEqual([
      'B0TESTAAA1',
      'B0TESTDICT',
      'B0TESTSAMP',
      'B0TESTPRIM',
    ])
    expect(page.total).toBe(4)
  })

  // Amazon sets `success` false on answers that carry every item.
  test('does not trust the success flag', () => {
    expect(pageOf(fixture).items).toHaveLength(4)
  })

  test('says so when the answer has no items', () => {
    expect(() => pageOf({ GetContentOwnershipData: { success: true } })).toThrow(
      'Content ownership answered without items',
    )
    expect(() => pageOf({ somethingElse: {} })).toThrow()
  })
})

describe('titleOf', () => {
  const [purchase, dictionary, sample, prime] = pageOf(fixture).items

  test('maps a purchase, its credited author, cover, status and acquisition', () => {
    expect(titleOf(purchase)).toEqual({
      asin: 'B0TESTAAA1',
      title: "Les Veilleurs (Tome 3) - L'Hiver",
      sortableTitle: "veilleurs tome 3 l'hiver french edition, les",
      authors: ['Camille Fabre'],
      coverUrl: 'https://m.media-amazon.com/images/I/91TestCoverA.jpg',
      readStatus: 'READ',
      originType: 'Purchase',
      category: 'KindleEBook',
      acquiredAt: new Date(1789387902805),
    })
  })

  test('falls back on the authors field, split on commas', () => {
    expect(titleOf(prime).authors).toEqual(['Ana Duval', 'Paul Rey'])
  })

  test('leaves the origin and the category as Amazon spells them', () => {
    expect(titleOf(dictionary).originType).toBe('KindleDictionary')
    expect(titleOf(sample).category).toBe('KindleEBookSample')
  })

  test('has no cover, no sort key and no date where Amazon gives none', () => {
    expect(titleOf(sample).coverUrl).toBeUndefined()
    expect(titleOf(sample).sortableTitle).toBeUndefined()
    expect(titleOf(prime).acquiredAt).toBeUndefined()
  })
})

describe('csrfTokenIn', () => {
  test('reads the token the page declares', () => {
    expect(csrfTokenIn('<script>var csrfToken = "abc+/=";</script>')).toBe('abc+/=')
    expect(csrfTokenIn('<input type="hidden" name="csrfToken" value="xyz">')).toBe('xyz')
    expect(csrfTokenIn('<html></html>')).toBeUndefined()
  })
})

describe('readLibrary', () => {
  const page = (startIndex: number, count: number, total: number) => ({
    GetContentOwnershipData: {
      numberOfItems: total,
      items: Array.from({ length: count }, (_, index) => ({
        asin: `B0PAGE${String(startIndex + index).padStart(4, '0')}`,
        title: `Livre ${startIndex + index}`,
      })),
    },
  })

  test('reads every page up to the account count, with the token and the cookies', async () => {
    const calls: { url: string; headers: Record<string, string>; body?: string }[] = []
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ url: String(url), headers, body: init?.body ? String(init.body) : undefined })
      if (!init?.method) {
        return new Response('<script>var csrfToken = "tok";</script>', { status: 200 })
      }
      const input = JSON.parse(new URLSearchParams(String(init.body)).get('activityInput') ?? '{}')
      const start = input.fetchCriteria.startIndex as number
      return Response.json(page(start, start === 100 ? 20 : 50, 120))
    }) as unknown as typeof fetch

    const titles = await readLibrary('fr', cookies)

    expect(titles).toHaveLength(120)
    expect(calls[0].url).toBe(
      'https://www.amazon.fr/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
    )
    expect(calls[0].headers.Cookie).toBe('session-token=t')
    expect(calls.slice(1).map((call) => new URLSearchParams(call.body).get('csrfToken'))).toEqual([
      'tok',
      'tok',
      'tok',
    ])
  })

  test('stops on a short page even when the count says more', async () => {
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method
        ? Response.json(page(0, 3, 165))
        : new Response('csrfToken = "tok"', { status: 200 }),
    ) as unknown as typeof fetch

    expect(await readLibrary('fr', cookies)).toHaveLength(3)
  })

  test('says the page carried no token', async () => {
    globalThis.fetch = mock(async () => new Response('<html></html>')) as unknown as typeof fetch

    const failure = await readLibrary('fr', cookies).catch((error) => error)

    expect(failure.kind).toBe('csrf-missing')
  })
})
