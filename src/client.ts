import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { KINDLE_LOCALES } from './locales.js'
import type { AuthSession, KindleCookie, KindleCredentials, KindleLocale } from './types.js'
import { KindleApiError, base64nopad, base64url, toHexString } from './utils.js'

/**
 * Who the device says it is: the Kindle app for iPhone.
 *
 * Amazon checks the device type when it registers a device, and decides from it
 * what the device may read. These are the one place to change if Amazon stops
 * accepting them.
 */
export const DEVICE = {
  type: 'A3NWHXTQ4EBCZS',
  appName: 'Kindle',
  appVersion: '7.21',
  softwareVersion: '1210000000',
  bundleId: 'com.amazon.Lassen',
  name: '%FIRST_NAME%%FIRST_NAME_POSSESSIVE_STRING%%DUPE_STRATEGY_1ST%Kindle for iPhone',
} as const

/**
 * Generate a login URL for the Kindle PKCE OAuth flow.
 *
 * Returns the URL to load in a browser, the session to hand back to `register`,
 * and the cookies to plant in that browser before loading it: they are what
 * makes the request look like the Kindle iOS app.
 */
export const login = async (locale: KindleLocale) => {
  const config = KINDLE_LOCALES[locale]

  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())

  const serial = randomUUID().replace(/-/g, '').toUpperCase()
  const clientId = toHexString(`${serial}#${DEVICE.type}`)

  const session: AuthSession = { codeVerifier, serial, locale, createdAt: new Date() }

  const params = new URLSearchParams({
    'openid.oa2.response_type': 'code',
    'openid.oa2.code_challenge_method': 'S256',
    'openid.oa2.code_challenge': codeChallenge,
    'openid.return_to': `https://www.amazon.${config.domain}/ap/maplanding`,
    'openid.assoc_handle': `amzn_kindle_ios_${config.countryCode}`,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    pageId: 'amzn_kindle_ios',
    accountStatusPolicy: 'P1',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.mode': 'checkid_setup',
    'openid.ns.oa2': 'http://www.amazon.com/ap/ext/oauth/2',
    'openid.oa2.client_id': `device:${clientId}`,
    'openid.ns.pape': 'http://specs.openid.net/extensions/pape/1.0',
    marketPlaceId: config.marketplaceId,
    'openid.oa2.scope': 'device_auth_access',
    forceMobileLayout: 'true',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.pape.max_auth_age': '0',
  })

  const loginUrl = `https://www.amazon.${config.domain}/ap/signin?${params.toString()}`
  const domain = `.amazon.${config.domain}`

  const cookies: KindleCookie[] = [
    { name: 'frc', value: base64nopad(randomBytes(313)), domain },
    {
      name: 'map-md',
      value: base64nopad(
        Buffer.from(
          JSON.stringify({
            device_user_dictionary: [],
            device_registration_data: { software_version: DEVICE.softwareVersion },
            app_identifier: { app_version: DEVICE.appVersion, bundle_id: DEVICE.bundleId },
          }),
        ),
      ),
      domain,
    },
    { name: 'amzn-app-id', value: 'MAPiOSLib/6.0/ToHideRetailLink', domain },
  ]

  return { loginUrl, session, cookies } as const
}

/** Where Amazon sends the browser once the reader has signed in. The authorization code rides on it. */
export const landingUrlOf = (locale: KindleLocale) =>
  `https://www.amazon.${KINDLE_LOCALES[locale].domain}/ap/maplanding`

/**
 * Register the device with the authorization code the landing URL carried.
 *
 * @param authorizationCode - The `openid.oa2.authorization_code` of the landing URL
 * @param session - The session `login` returned
 * @throws KindleApiError (`registration`) when Amazon refuses the device
 */
export const register = async (
  authorizationCode: string,
  session: AuthSession,
): Promise<KindleCredentials> => {
  const config = KINDLE_LOCALES[session.locale]
  const body = {
    requested_token_type: ['bearer', 'mac_dms', 'website_cookies'],
    cookies: { website_cookies: [], domain: `.amazon.${config.domain}` },
    registration_data: {
      domain: 'Device',
      app_version: DEVICE.appVersion,
      device_serial: session.serial,
      device_type: DEVICE.type,
      device_name: DEVICE.name,
      os_version: '18.0',
      software_version: DEVICE.softwareVersion,
      device_model: 'iPhone',
      app_name: DEVICE.appName,
    },
    auth_data: {
      client_id: toHexString(`${session.serial}#${DEVICE.type}`),
      authorization_code: authorizationCode,
      code_verifier: session.codeVerifier,
      code_algorithm: 'SHA-256',
      client_domain: 'DeviceLegacy',
    },
    requested_extensions: ['device_info', 'customer_info'],
  }

  const response = await fetch(`https://api.amazon.${config.domain}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new KindleApiError(
      'registration',
      `Device registration failed: ${response.status} ${response.statusText}`,
    )
  }

  const data = (await response.json()) as {
    response?: {
      success?: {
        tokens?: {
          bearer?: { refresh_token?: string }
          mac_dms?: { adp_token?: string; device_private_key?: string }
        }
      }
    }
  }
  const tokens = data.response?.success?.tokens
  const refreshToken = tokens?.bearer?.refresh_token
  const adpToken = tokens?.mac_dms?.adp_token
  const devicePrivateKey = tokens?.mac_dms?.device_private_key
  if (!refreshToken || !adpToken || !devicePrivateKey) {
    throw new KindleApiError('registration', 'Device registration answered without tokens')
  }

  return {
    refreshToken,
    adpToken,
    devicePrivateKey,
    serial: session.serial,
    locale: session.locale,
  }
}
