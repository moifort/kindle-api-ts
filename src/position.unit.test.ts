import { afterEach, describe, expect, mock, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { positionIn, readingPosition } from './position'
import type { KindleCredentials } from './types'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const credentials: KindleCredentials = {
  refreshToken: 'Atnr|token',
  adpToken: '{enc:token}',
  devicePrivateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  serial: 'SERIAL1',
  locale: 'fr',
}

const aSidecar = (position: number, tag = 'BPAR') => {
  const file = Buffer.alloc(0x60 + 0x38)
  file.writeUInt32BE(0x60, 0x4e)
  file.write(tag, 0x60, 'latin1')
  file.writeUInt32BE(position, 0x60 + 0x0c)
  return file
}

const answering = (response: Response) => {
  const fetchMock = mock(async (_url: URL, _init: { headers: Record<string, string> }) => response)
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

describe('positionIn', () => {
  test('reads the position off the first record', () => {
    expect(positionIn(aSidecar(310049))).toBe(310049)
  })

  test('finds none where the file says none', () => {
    expect(positionIn(aSidecar(0xffffffff))).toBeUndefined()
  })

  test('finds none in a file of another shape', () => {
    expect(positionIn(aSidecar(310049, 'DATA'))).toBeUndefined()
    expect(positionIn(Buffer.alloc(20))).toBeUndefined()
  })
})

describe('readingPosition', () => {
  test('signs the call with the device key', async () => {
    const fetchMock = answering(new Response(aSidecar(310049)))

    expect(await readingPosition(credentials, 'B0TESTAAA1')).toBe(310049)

    const [url, init] = fetchMock.mock.calls[0] as [URL, { headers: Record<string, string> }]
    const header = init.headers['x-adp-signature'] ?? ''
    const separator = header.indexOf(':')
    const [signature, time] = [header.slice(0, separator), header.slice(separator + 1)]
    const signed = ['GET', `${url.pathname}${url.search}`, time, '', credentials.adpToken].join(
      '\n',
    )
    expect(url.searchParams.get('key')).toBe('B0TESTAAA1')
    expect(createVerify('RSA-SHA256').update(signed).verify(publicKey, signature, 'base64')).toBe(
      true,
    )
  })

  test('finds none on a title with no sidecar', async () => {
    answering(new Response(null, { status: 404 }))
    expect(await readingPosition(credentials, 'B0TESTAAA1')).toBeUndefined()
  })

  test('says so when Amazon refuses', async () => {
    answering(new Response('nope', { status: 503 }))
    await expect(readingPosition(credentials, 'B0TESTAAA1')).rejects.toThrow('Sidecar failed')
  })
})
