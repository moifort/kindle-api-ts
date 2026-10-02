import { z } from 'zod'
import { cookieHeaderOf, websiteCookies } from './cookies.js'
import { KINDLE_LOCALES } from './locales.js'
import type {
  KindleCookie,
  KindleCredentials,
  KindleLocale,
  KindleTitle,
  ReadStatus,
} from './types.js'
import { BROWSER_USER_AGENT, KindleApiError } from './utils.js'

const PAGE_SIZE = 50

/** The page "Manage your content and devices" opens on, which carries the CSRF token its calls need */
const contentListPath = '/hz/mycd/digital-console/contentlist/booksAll/dateDsc/'
const ajaxPath = '/hz/mycd/digital-console/ajax'

const itemSchema = z.object({
  asin: z.string(),
  title: z.string(),
  sortableTitle: z.string().optional().nullable(),
  authors: z.string().optional().nullable(),
  bookProducerDetails: z
    .array(z.object({ name: z.string().optional(), role: z.string().optional() }))
    .optional()
    .nullable(),
  productImage: z.string().optional().nullable(),
  readStatus: z.string().optional().nullable(),
  originType: z.string().optional().nullable(),
  udlCategory: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  acquiredTime: z.number().optional().nullable(),
})

const pageSchema = z.object({
  items: z.array(z.unknown()),
  numberOfItems: z.number().optional().nullable(),
})

type Item = z.infer<typeof itemSchema>

/**
 * Every Kindle book on the account, with its read status, as "Manage your
 * content and devices" lists it.
 *
 * Mints website cookies from the device's refresh token, then reads the list.
 * Samples and dictionaries are included: they are on the account, and what to
 * do with them is the caller's call — `originType` and `category` say which.
 *
 * @throws KindleApiError when Amazon refuses the cookies or answers in a shape
 *   this client does not know
 */
export const library = async (credentials: KindleCredentials): Promise<KindleTitle[]> =>
  readLibrary(credentials.locale, await websiteCookies(credentials))

/** The same list, read with cookies the caller already holds — a browser session's, say */
export const readLibrary = async (
  locale: KindleLocale,
  cookies: readonly KindleCookie[],
): Promise<KindleTitle[]> => {
  const origin = `https://www.amazon.${KINDLE_LOCALES[locale].domain}`
  const headers = { Cookie: cookieHeaderOf(cookies), 'User-Agent': BROWSER_USER_AGENT }
  const csrfToken = await csrfTokenOf(origin, headers)
  const items = await pagesFrom(origin, headers, csrfToken, 0)
  return items.map(titleOf)
}

const csrfTokenOf = async (origin: string, headers: Record<string, string>) => {
  const response = await fetch(`${origin}${contentListPath}`, { headers })
  if (!response.ok) {
    throw new KindleApiError(
      'http',
      `Content list failed: ${response.status} ${response.statusText}`,
    )
  }
  // A session Amazon does not accept is sent to the sign-in page rather than refused.
  if (response.url.includes('/ap/signin')) {
    throw new KindleApiError('cookie-exchange', 'Amazon asked to sign in again')
  }
  const token = csrfTokenIn(await response.text())
  if (!token) throw new KindleApiError('csrf-missing', 'No CSRF token on the content list page')
  return token
}

/** The token the content list page declares for its own calls */
export const csrfTokenIn = (html: string) =>
  html.match(/csrfToken\s*=\s*["']([^"']+)["']/)?.[1] ??
  html.match(/name=["']csrfToken["'][^>]*value=["']([^"']+)["']/)?.[1]

/**
 * Page after page until the account's count is reached. `hasMoreItems` is not
 * trusted: Amazon answers it false on a first page of 50 out of 165.
 */
const pagesFrom = async (
  origin: string,
  headers: Record<string, string>,
  csrfToken: string,
  startIndex: number,
): Promise<Item[]> => {
  const page = await pageAt(origin, headers, csrfToken, startIndex)
  const total = page.total ?? 0
  const next = startIndex + PAGE_SIZE
  return page.items.length === PAGE_SIZE && next < total
    ? [...page.items, ...(await pagesFrom(origin, headers, csrfToken, next))]
    : page.items
}

const pageAt = async (
  origin: string,
  headers: Record<string, string>,
  csrfToken: string,
  startIndex: number,
) => {
  const body = new URLSearchParams({
    activity: 'GetContentOwnershipData',
    activityInput: JSON.stringify({
      contentType: 'Ebook',
      contentCategoryReference: 'booksAll',
      itemStatusList: ['Active'],
      showSharedContent: true,
      fetchCriteria: {
        sortOrder: 'DESCENDING',
        sortIndex: 'DATE',
        startIndex,
        batchSize: PAGE_SIZE,
        totalContentCount: -1,
      },
      surfaceType: 'LargeDesktop',
    }),
    csrfToken,
  })
  const response = await fetch(`${origin}${ajaxPath}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) {
    throw new KindleApiError(
      'http',
      `Content ownership failed: ${response.status} ${response.statusText}`,
    )
  }
  return pageOf(await response.json())
}

/**
 * One page of the answer. Its `success` flag is not trusted either: Amazon sets
 * it false on answers that carry every item. The items are what is checked.
 */
export const pageOf = (answer: unknown): { items: Item[]; total?: number } => {
  const parsed = pageSchema.safeParse(
    (answer as { GetContentOwnershipData?: unknown } | null)?.GetContentOwnershipData,
  )
  if (!parsed.success) {
    throw new KindleApiError('unexpected-shape', 'Content ownership answered without items')
  }
  const items = parsed.data.items.flatMap((raw) => {
    const item = itemSchema.safeParse(raw)
    return item.success ? [item.data] : []
  })
  return { items, total: parsed.data.numberOfItems ?? undefined }
}

export const titleOf = (item: Item): KindleTitle => ({
  asin: item.asin,
  title: item.title.trim(),
  sortableTitle: item.sortableTitle?.trim() || undefined,
  authors: authorsOf(item),
  coverUrl: item.productImage || undefined,
  readStatus: readStatusOf(item.readStatus),
  originType: item.originType ?? 'Unknown',
  category: item.udlCategory ?? item.category ?? 'Unknown',
  acquiredAt: item.acquiredTime ? new Date(item.acquiredTime) : undefined,
})

/**
 * Who wrote it, in reading order. The contributors list names each one with
 * their role, already "Lauren Roberts"; the plain `authors` field is the
 * fallback, several names separated by commas.
 */
const authorsOf = (item: Item): string[] => {
  const credited = (item.bookProducerDetails ?? [])
    .filter((producer) => producer.role === 'author' && producer.name?.trim())
    .map((producer) => (producer.name as string).trim())
  if (credited.length > 0) return credited
  return (item.authors ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

const readStatusOf = (value: string | null | undefined): ReadStatus =>
  value === 'READ' ? 'READ' : 'UNKNOWN'
