import { DEVICE } from './client.js'
import { KINDLE_LOCALES } from './locales.js'
import type { KindleCookie, KindleCredentials } from './types.js'
import { KindleApiError } from './utils.js'

type ExchangeAnswer = {
  response?: {
    tokens?: {
      cookies?: Record<string, { Name?: string; Value?: string }[]>
    }
  }
}

/**
 * Fresh website cookies for the account's Amazon store, minted from the device's
 * refresh token.
 *
 * Website cookies are what Amazon's own account pages are read with. Minting
 * them on every call rather than keeping them means nothing expires on the
 * caller's side: as long as the device stays registered, this works.
 *
 * @throws KindleApiError (`cookie-exchange`) when Amazon refuses the token — the
 *   device was deregistered, or the password changed
 */
export const websiteCookies = async (credentials: KindleCredentials): Promise<KindleCookie[]> => {
  const config = KINDLE_LOCALES[credentials.locale]
  const domain = `.amazon.${config.domain}`

  const response = await fetch(`https://www.amazon.${config.domain}/ap/exchangetoken/cookies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-amzn-identity-auth-domain': `api.amazon.${config.domain}`,
    },
    body: new URLSearchParams({
      app_name: DEVICE.appName,
      app_version: DEVICE.appVersion,
      source_token: credentials.refreshToken,
      requested_token_type: 'auth_cookies',
      source_token_type: 'refresh_token',
      domain,
    }).toString(),
  })
  if (!response.ok) {
    throw new KindleApiError(
      'cookie-exchange',
      `Cookie exchange failed: ${response.status} ${response.statusText}`,
    )
  }

  const cookies = cookiesOf((await response.json()) as ExchangeAnswer, domain)
  if (cookies.length === 0) {
    throw new KindleApiError('cookie-exchange', 'Cookie exchange answered without cookies')
  }
  return cookies
}

/**
 * The cookies an exchange answered with. Amazon groups them by domain and quotes
 * some values; the quotes are not part of the value.
 */
export const cookiesOf = (answer: ExchangeAnswer, domain: string): KindleCookie[] =>
  Object.values(answer.response?.tokens?.cookies ?? {})
    .flat()
    .flatMap(({ Name, Value }) =>
      Name && Value !== undefined ? [{ name: Name, value: Value.replace(/"/g, ''), domain }] : [],
    )

/** The `Cookie` header that sends these cookies */
export const cookieHeaderOf = (cookies: readonly KindleCookie[]) =>
  cookies.map(({ name, value }) => `${name}=${value}`).join('; ')
