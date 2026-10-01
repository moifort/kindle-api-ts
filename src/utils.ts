import { Buffer } from 'node:buffer'

export const base64url = (buffer: Buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const base64nopad = (buffer: Buffer) => buffer.toString('base64').replace(/=+$/, '')

export const toHexString = (input: string) => Buffer.from(input, 'utf-8').toString('hex')

/** What every call to Amazon fails with, typed by what went wrong */
export class KindleApiError extends Error {
  constructor(
    readonly kind:
      | 'registration'
      | 'cookie-exchange'
      | 'csrf-missing'
      | 'unexpected-shape'
      | 'http',
    message: string,
  ) {
    super(message)
    this.name = 'KindleApiError'
  }
}

/**
 * Amazon serves its account pages to browsers. A request that does not look
 * like one is far more likely to meet a robot check than the page asked for.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
