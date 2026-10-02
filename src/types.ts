/** The Amazon stores a Kindle library can live on, by their domain suffix */
export type KindleLocale =
  | 'fr'
  | 'com'
  | 'co.uk'
  | 'de'
  | 'it'
  | 'es'
  | 'ca'
  | 'com.au'
  | 'in'
  | 'co.jp'

/** Marketplace configuration for a given locale */
export type LocaleConfig = {
  /** The suffix after `amazon.` — `fr`, `co.uk` */
  domain: string
  /** Amazon's retail marketplace id, the one the Kindle store sells on */
  marketplaceId: string
  /** The country code Amazon's sign-in pages are named after */
  countryCode: string
  /**
   * The sign-in page a Kindle device signs in through: the store's own generic
   * one. Amazon answers 404 to `amzn_kindle_ios_<cc>`, which no app uses.
   */
  assocHandle: string
}

/** A sign-in in flight: what `register` needs to finish what `login` started */
export type AuthSession = {
  codeVerifier: string
  serial: string
  locale: KindleLocale
  createdAt: Date
}

/** A cookie, to plant in a browser before the sign-in or to send with a request */
export type KindleCookie = {
  name: string
  value: string
  domain: string
}

/**
 * What a registered device keeps. The refresh token is a standing grant on the
 * account: store it sealed.
 *
 * There is no access token. Nothing this library reads asks for one — the
 * library is read with website cookies minted from the refresh token — so
 * nothing expires between two calls and nothing has to be written back.
 */
export type KindleCredentials = {
  refreshToken: string
  adpToken: string
  devicePrivateKey: string
  serial: string
  locale: KindleLocale
}

/** Whether Amazon counts the title as read: set when a reader reaches the end, or by hand */
export type ReadStatus = 'READ' | 'UNKNOWN'

/** One title of the library, as "Manage your content and devices" lists it */
export type KindleTitle = {
  asin: string
  title: string
  /**
   * Amazon's sort key for the title: lowercased, a leading article moved to the
   * end, and — on a store selling the edition as foreign to it — the edition's
   * language appended, `"powerless tome 3 fearless french edition"`. Left as
   * Amazon writes it.
   */
  sortableTitle?: string
  /** In reading order — "Lauren Roberts", not "Roberts, Lauren" */
  authors: string[]
  coverUrl?: string
  readStatus: ReadStatus
  /**
   * How the title came to the account: `Purchase`, `Prime`, `KindleUnlimited`,
   * `Sample`, `KindleDictionary`… Left as Amazon spells it — the list is
   * Amazon's and grows without notice.
   */
  originType: string
  /** Amazon's own category: `KindleEBook`, `KindleEBookSample`… */
  category: string
  /** When the title entered the account */
  acquiredAt?: Date
}
