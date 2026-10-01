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
 * Why Amazon refused a call, in its own words: a bare status says nothing, and
 * every wrong parameter answers the same 400. The device endpoints answer
 * `{ response: { error: { code, message } } }`, the token exchange the OAuth
 * `{ error, error_description }`; anything else is kept raw, cut short. A
 * refusal carries no token, so nothing secret ends up in the message.
 */
export const amazonRefusalOf = async (response: Response): Promise<string> => {
  const status = `${response.status} ${response.statusText}`.trim()
  const text = await response.text().catch(() => '')
  if (!text) return status
  const reason = reasonIn(text) ?? text.slice(0, 300)
  return `${status}: ${reason}`
}

const reasonIn = (text: string): string | undefined => {
  try {
    const answer = JSON.parse(text) as {
      response?: { error?: { code?: string; message?: string } }
      error?: string
      error_description?: string
    }
    const device = answer.response?.error
    if (device?.code) return [device.code, device.message].filter(Boolean).join(' — ')
    if (answer.error) return [answer.error, answer.error_description].filter(Boolean).join(' — ')
  } catch {}
  return undefined
}

/**
 * Amazon serves its account pages to browsers. A request that does not look
 * like one is far more likely to meet a robot check than the page asked for.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
