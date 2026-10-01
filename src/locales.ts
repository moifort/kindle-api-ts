import type { KindleLocale, LocaleConfig } from './types.js'

/**
 * Every Amazon store a Kindle library lives on.
 *
 * The marketplace ids are the retail ones, which the Kindle store sells on —
 * not Audible's, which are different ids for the same countries. The sign-in
 * goes through each store's generic page (`frflex`); only the French one has
 * been proven against a real account.
 */
export const KINDLE_LOCALES: Record<KindleLocale, LocaleConfig> = {
  fr: { domain: 'fr', marketplaceId: 'A13V1IB3VIYZZH', countryCode: 'fr', assocHandle: 'frflex' },
  com: { domain: 'com', marketplaceId: 'ATVPDKIKX0DER', countryCode: 'us', assocHandle: 'usflex' },
  'co.uk': {
    domain: 'co.uk',
    marketplaceId: 'A1F83G8C2ARO7P',
    countryCode: 'uk',
    assocHandle: 'gbflex',
  },
  de: { domain: 'de', marketplaceId: 'A1PA6795UKMFR9', countryCode: 'de', assocHandle: 'deflex' },
  it: { domain: 'it', marketplaceId: 'APJ6JRA9NG5V4', countryCode: 'it', assocHandle: 'itflex' },
  es: { domain: 'es', marketplaceId: 'A1RKKUPIHCS9HS', countryCode: 'es', assocHandle: 'esflex' },
  ca: { domain: 'ca', marketplaceId: 'A2EUQ1WTGCTBG2', countryCode: 'ca', assocHandle: 'caflex' },
  'com.au': {
    domain: 'com.au',
    marketplaceId: 'A39IBJ37TRP1C6',
    countryCode: 'au',
    assocHandle: 'auflex',
  },
  in: { domain: 'in', marketplaceId: 'A21TJRUUN4KGV', countryCode: 'in', assocHandle: 'inflex' },
  'co.jp': {
    domain: 'co.jp',
    marketplaceId: 'A1VC38T7YXB528',
    countryCode: 'jp',
    assocHandle: 'jpflex',
  },
} as const
