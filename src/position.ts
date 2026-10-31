import { Buffer } from 'node:buffer'
import { createPrivateKey, createSign } from 'node:crypto'
import type { KindleCredentials } from './types.js'
import { KindleApiError, amazonRefusalOf } from './utils.js'

const SIDECAR_URL = 'https://cde-ta-g7g.amazon.com/FionaCDEServiceEngine/sidecar'
const SIDECAR_TIMEOUT_MS = 10_000

const RECORD_OFFSET = 0x4e
const POSITION_OFFSET = 0x0c
const NO_POSITION = 0xffffffff

/**
 * Where Whispersync last saw the reader in a title, in the book's own units.
 *
 * Read with the device's key, not website cookies: this is the Kindle app's own
 * call. The position is an offset into the book's text: Amazon answers no length
 * here, so it converts to a page or a share only by estimate.
 *
 * @returns The position, or undefined on a title with no sidecar — one never
 *   opened — or one holding no position
 * @throws KindleApiError (`http`) when Amazon refuses the call
 */
export const readingPosition = async (
  credentials: KindleCredentials,
  asin: string,
): Promise<number | undefined> => {
  const url = new URL(SIDECAR_URL)
  url.search = new URLSearchParams({ type: 'EBOK', key: asin }).toString()
  const response = await fetch(url, {
    headers: signedHeaders(credentials, `${url.pathname}${url.search}`),
    signal: AbortSignal.timeout(SIDECAR_TIMEOUT_MS),
  })
  if (response.status === 404) return undefined
  if (!response.ok) {
    throw new KindleApiError('http', `Sidecar failed: ${await amazonRefusalOf(response)}`)
  }
  return positionIn(Buffer.from(await response.arrayBuffer()))
}

/** A device call signs its method, path, time and token with the device's key */
const signedHeaders = (credentials: KindleCredentials, path: string) => {
  const raw = credentials.devicePrivateKey
  const key = raw.includes('BEGIN')
    ? createPrivateKey(raw)
    : createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' })
  const time = new Date().toISOString()
  const signature = createSign('RSA-SHA256')
    .update(['GET', path, time, '', credentials.adpToken].join('\n'))
    .sign(key, 'base64')
  return {
    'x-adp-token': credentials.adpToken,
    'x-adp-alg': 'SHA256withRSA:1.0',
    'x-adp-signature': `${signature}:${time}`,
  }
}

/**
 * The position in a sidecar: a Palm database of type `BPARMOBI`, the offset of
 * its first record at 0x4e, and that record, tagged `BPAR`, holding the position
 * 12 bytes in. Amazon documents none of it: the field was found on a real account
 * and checked against what its Kindle showed. Its other records hold the reader's
 * highlights, so nothing here may be logged.
 */
export const positionIn = (sidecar: Buffer): number | undefined => {
  if (sidecar.length < RECORD_OFFSET + 4) return undefined
  const record = sidecar.readUInt32BE(RECORD_OFFSET)
  if (sidecar.length < record + POSITION_OFFSET + 4) return undefined
  if (sidecar.toString('latin1', record, record + 4) !== 'BPAR') return undefined
  const position = sidecar.readUInt32BE(record + POSITION_OFFSET)
  return position === NO_POSITION ? undefined : position
}
