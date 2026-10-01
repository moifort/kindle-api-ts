import { afterEach, describe, expect, mock, test } from 'bun:test'
import { DEVICE, landingUrlOf, login, register } from './client'
import { KindleApiError } from './utils'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('login', () => {
  test('opens a Kindle sign-in on the retail store of the locale', async () => {
    const { loginUrl } = await login('fr')
    const url = new URL(loginUrl)

    expect(url.origin + url.pathname).toBe('https://www.amazon.fr/ap/signin')
    expect(url.searchParams.get('marketPlaceId')).toBe('A13V1IB3VIYZZH')
    // Amazon answers 404 to `amzn_kindle_ios_fr`: the store's generic page is the one.
    expect(url.searchParams.get('openid.assoc_handle')).toBe('frflex')
    expect(url.searchParams.has('pageId')).toBe(false)
    expect(url.searchParams.get('openid.oa2.code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('openid.return_to')).toBe(landingUrlOf('fr'))
  })

  test('names a Kindle device in the client id', async () => {
    const { loginUrl, session } = await login('com')
    const clientId = new URL(loginUrl).searchParams.get('openid.oa2.client_id') ?? ''
    const decoded = Buffer.from(clientId.replace('device:', ''), 'hex').toString('utf-8')

    expect(decoded).toBe(`${session.serial}#${DEVICE.type}`)
  })

  test('hands out the three cookies to plant, on the store domain', async () => {
    const { cookies } = await login('co.uk')

    expect(cookies.map(({ name }) => name)).toEqual(['frc', 'map-md', 'amzn-app-id'])
    for (const cookie of cookies) expect(cookie.domain).toBe('.amazon.co.uk')
  })

  test('never reuses a session', async () => {
    const a = await login('fr')
    const b = await login('fr')

    expect(a.session.serial).not.toBe(b.session.serial)
    expect(a.session.codeVerifier).not.toBe(b.session.codeVerifier)
  })
})

describe('register', () => {
  const session = {
    codeVerifier: 'verifier',
    serial: 'SERIAL',
    locale: 'fr' as const,
    createdAt: new Date(),
  }

  test('keeps the refresh token and the device key, and no access token', async () => {
    let sent: { url: string; body: Record<string, unknown> } | undefined
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)) }
      return Response.json({
        response: {
          success: {
            tokens: {
              bearer: { access_token: 'access', refresh_token: 'Atnr|refresh', expires_in: '3600' },
              mac_dms: { adp_token: '{adp}', device_private_key: 'key' },
            },
          },
        },
      })
    }) as unknown as typeof fetch

    const credentials = await register('the-code', session)

    expect(sent?.url).toBe('https://api.amazon.fr/auth/register')
    expect((sent?.body.registration_data as { device_type: string }).device_type).toBe(DEVICE.type)
    expect(credentials).toEqual({
      refreshToken: 'Atnr|refresh',
      adpToken: '{adp}',
      devicePrivateKey: 'key',
      serial: 'SERIAL',
      locale: 'fr',
    })
  })

  test('names every device apart, so a second sign-in is no duplicate', async () => {
    const names: string[] = []
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { registration_data: { device_name: string } }
      names.push(body.registration_data.device_name)
      return new Response('', { status: 400 })
    }) as unknown as typeof fetch

    await register('the-code', { ...session, serial: 'A1B2C3D4E5F6' }).catch(() => {})
    await register(
      'the-code',
      { ...session, serial: 'F6E5D4C3B2A1' },
      { deviceName: 'Shiori' },
    ).catch(() => {})

    expect(names).toEqual(['Kindle for iPhone A1B2', 'Shiori F6E5'])
  })

  test('says Amazon refused the device', async () => {
    globalThis.fetch = mock(
      async () => new Response('', { status: 403, statusText: 'Forbidden' }),
    ) as unknown as typeof fetch

    const failure = await register('the-code', session).catch((error) => error)

    expect(failure).toBeInstanceOf(KindleApiError)
    expect(failure.kind).toBe('registration')
  })

  test("carries Amazon's own reason for the refusal", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            response: {
              error: {
                code: 'InvalidValue',
                index: 'opaque',
                message: 'One or more provided values are invalid.',
              },
            },
          }),
          { status: 400, statusText: 'Bad Request' },
        ),
    ) as unknown as typeof fetch

    const failure = await register('the-code', session).catch((error) => error)

    expect(failure.message).toBe(
      'Device registration failed: 400 Bad Request: InvalidValue — One or more provided values are invalid.',
    )
  })
})
