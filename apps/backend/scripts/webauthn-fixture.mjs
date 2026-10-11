// Software authenticator used only by tests; never exposes an application credential.
import { isoCBOR } from '@simplewebauthn/server/helpers'
const b64 = bytes => Buffer.from(bytes).toString('base64url')
const bytes = value => new Uint8Array(Buffer.from(value, 'base64url'))
const concat = (...parts) => new Uint8Array(Buffer.concat(parts.map(part => Buffer.from(part))))
const digest = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
export async function testAuthenticator(options, origin, overrides = {}) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
  const id = crypto.getRandomValues(new Uint8Array(16))
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, bytes(jwk.x)], [-3, bytes(jwk.y)]]))
  const authData = concat(await digest(options.rp.id), [overrides.flags ?? 0x45], [0,0,0,0], new Uint8Array(16), [0,16], id, cose)
  const clientDataJSON = b64(new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, ...overrides.client })))
  const response = { id: b64(id), rawId: b64(id), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON, attestationObject: b64(isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',authData]]))), transports: ['internal'] } }
  async function authenticate(requestOptions) {
    const client = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: requestOptions.challenge, origin }))
    const auth = concat(await digest(options.rp.id), [0x05], [0,0,0,1])
    const signed = concat(auth, new Uint8Array(await crypto.subtle.digest('SHA-256', client)))
    const raw = new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, keys.privateKey, signed))
    const integer = part => { let value = [...part]; while (value.length > 1 && value[0] === 0) value.shift(); if (value[0] & 0x80) value.unshift(0); return [2,value.length,...value] }
    const contents = [...integer(raw.slice(0,32)),...integer(raw.slice(32))]
    return { id: b64(id), rawId: b64(id), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(client), authenticatorData: b64(auth), signature: b64(new Uint8Array([0x30,contents.length,...contents])), userHandle: options.user.id } }
  }
  return { response, authenticate }
}
