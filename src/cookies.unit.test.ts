import { afterEach, describe, expect, mock, test } from 'bun:test'
import { cookieHeaderOf, cookiesOf, websiteCookies } from './cookies'

const credentials = {
  refreshToken: 'Atnr|refresh',
  adpToken: '{adp}',
  devicePrivateKey: 'key',
  serial: 'SERIAL',
  locale: 'fr' as const,
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

describe('cookiesOf', () => {
  test('reads every cookie of every domain group, quotes removed', () => {
    const cookies = cookiesOf(
      {
        response: {
          tokens: {
            cookies: {
              '.amazon.fr': [
                { Name: 'session-id', Value: '123' },
                { Name: 'x-acbfr', Value: '"quoted"' },
              ],
            },
          },
        },
      },
      '.amazon.fr',
    )

    expect(cookies).toEqual([
      { name: 'session-id', value: '123', domain: '.amazon.fr' },
      { name: 'x-acbfr', value: 'quoted', domain: '.amazon.fr' },
    ])
  })

  test('answers nothing for an answer without cookies', () => {
    expect(cookiesOf({}, '.amazon.fr')).toEqual([])
  })
})

describe('websiteCookies', () => {
  test('trades the refresh token on the store of the account', async () => {
    let sent: { url: string; body: URLSearchParams } | undefined
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      sent = { url: String(url), body: new URLSearchParams(String(init?.body)) }
      return Response.json({
        response: { tokens: { cookies: { '.amazon.fr': [{ Name: 'at-acbfr', Value: 'a' }] } } },
      })
    }) as unknown as typeof fetch

    const cookies = await websiteCookies(credentials)

    expect(sent?.url).toBe('https://www.amazon.fr/ap/exchangetoken/cookies')
    expect(sent?.body.get('source_token')).toBe('Atnr|refresh')
    expect(sent?.body.get('requested_token_type')).toBe('auth_cookies')
    expect(sent?.body.get('domain')).toBe('.amazon.fr')
    expect(cookies).toEqual([{ name: 'at-acbfr', value: 'a', domain: '.amazon.fr' }])
  })

  test('says the exchange was refused', async () => {
    globalThis.fetch = mock(
      async () => new Response('', { status: 401 }),
    ) as unknown as typeof fetch

    const failure = await websiteCookies(credentials).catch((error) => error)

    expect(failure.kind).toBe('cookie-exchange')
  })

  test("carries Amazon's own reason for the refusal", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token expired' }),
          { status: 400 },
        ),
    ) as unknown as typeof fetch

    const failure = await websiteCookies(credentials).catch((error) => error)

    expect(failure.message).toBe(
      'Cookie exchange failed: 400: invalid_grant — Refresh token expired',
    )
  })

  test('refuses an exchange that minted nothing', async () => {
    globalThis.fetch = mock(async () => Response.json({ response: {} })) as unknown as typeof fetch

    const failure = await websiteCookies(credentials).catch((error) => error)

    expect(failure.kind).toBe('cookie-exchange')
  })
})

describe('cookieHeaderOf', () => {
  test('joins the cookies as a browser sends them', () => {
    expect(
      cookieHeaderOf([
        { name: 'a', value: '1', domain: '.amazon.fr' },
        { name: 'b', value: '2', domain: '.amazon.fr' },
      ]),
    ).toBe('a=1; b=2')
  })
})
