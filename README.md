# kindle-api-ts

A typed TypeScript client for an Amazon Kindle library: sign a Kindle device in, mint website
cookies from its refresh token, and read the books the account owns with their read status.

Amazon publishes no Kindle library API. This reads what Amazon's own "Manage your content and
devices" page reads, with the cookies a registered device can mint — so it keeps working as long
as the device stays registered, and breaks if Amazon changes that page.

## Quick start

```ts
import { landingUrlOf, library, login, register } from 'kindle-api-ts'

// 1. Open the sign-in in a browser, after planting `cookies` on the store domain.
const { loginUrl, session, cookies } = await login('fr')

// 2. Amazon redirects to `landingUrlOf('fr')` with `openid.oa2.authorization_code`.
const credentials = await register(authorizationCode, session)

// 3. Every Kindle book on the account. Store `credentials` sealed: the refresh token is a
//    standing grant on the account.
const titles = await library(credentials)
```

## API

| Function | Does |
|---|---|
| `login(locale)` | The PKCE sign-in URL for a Kindle-for-iPhone device, its session, the cookies to plant |
| `landingUrlOf(locale)` | The redirect that carries the authorization code |
| `register(code, session)` | Registers the device; returns `KindleCredentials` (no access token: nothing needs one) |
| `websiteCookies(credentials)` | Fresh `amazon.<domain>` cookies, minted from the refresh token |
| `library(credentials)` | Every title on the account: ASIN, title, authors, cover, `readStatus`, `originType`, `category`, `acquiredAt` |
| `readLibrary(locale, cookies)` | The same, with cookies already at hand |

Every failure is a `KindleApiError` whose `kind` is `registration`, `cookie-exchange`,
`csrf-missing`, `unexpected-shape` or `http`.

Samples (`category: KindleEBookSample`) and the dictionaries Amazon files under every account
(`originType: KindleDictionary`) are returned like any title: filtering them is the caller's call.

## Development

```bash
bun test
bunx tsc --noEmit
bunx biome check
bun run build
```
