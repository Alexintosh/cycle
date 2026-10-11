import { describe, expect, it } from "bun:test"
import { eq } from "drizzle-orm"
import { createTestServer } from "./helpers.ts"
import { users, recoveryCodes, passkeys, habits, authEnrollments } from "../src/db/schema.ts"
import { recoveryHash } from "../src/modules/auth/enrollment-routes.ts"
// @ts-ignore Test fixture shared with the Node/Miniflare suite.
import { testAuthenticator } from "../scripts/webauthn-fixture.mjs"

async function setup() {
  const server = await createTestServer({ configOverrides: { emailAuthEnabled: false } })
  const call = async (path: string, body?: any, token?: string, method?: string) => {
    const response = await server.app.handle(new Request('http://localhost/auth'+path, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type':'application/json', ...(token ? {authorization:'Bearer '+token} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) }))
    return { status: response.status, ...(await response.json() as any) }
  }
  return { ...server, call }
}
describe('passwordless enrollment', () => {
  it('creates with a verified passkey, signs in, hashes codes, protects existing accounts and consumes recovery once', async () => {
    const { call, db, client } = await setup()
    expect((await call('/request-otp',{email:'alice@example.com'})).status).toBe(403)
    const begin = await call('/enroll/options',{email:'Alice@example.com',displayName:'Alice'})
    expect(begin.status).toBe(200)
    expect(await db.select().from(users)).toHaveLength(0)
    const key = await testAuthenticator(begin.data.options,'http://localhost:3100')
    const signed = await call('/enroll/verify',{challengeId:begin.data.challengeId,response:key.response})
    expect(signed.status).toBe(200)
    expect(signed.data.recoveryCodes).toHaveLength(8)
    expect((await db.select().from(recoveryCodes))[0].hash).not.toBe(signed.data.recoveryCodes[0])
    expect((await call('/enroll/verify',{challengeId:begin.data.challengeId,response:key.response})).status).toBe(400)
    expect((await call('/enroll/options',{email:'alice@example.com'})).status).toBe(409)
    const login = await call('/passkeys/authenticate/options',{})
    const authenticated = await call('/passkeys/authenticate/verify',{challengeId:login.data.challengeId,response:await key.authenticate(login.data.options)})
    expect(authenticated.status).toBe(200)
    expect(authenticated.data.user.id).toBe(signed.data.user.id)
    expect((await call('/passkeys/'+key.response.id,undefined,signed.data.token,'DELETE')).status).toBe(409)
    const originalHabits = await db.select().from(habits)
    const code = signed.data.recoveryCodes[0]
    const recover = await call('/enroll/options',{email:'alice@example.com',recoveryCode:code})
    const competing = await call('/enroll/options',{email:'alice@example.com',recoveryCode:code})
    const replacement = await testAuthenticator(recover.data.options,'http://localhost:3100')
    const recovered = await call('/enroll/verify',{challengeId:recover.data.challengeId,response:replacement.response})
    expect(recovered.status).toBe(200)
    expect(recovered.data.user.id).toBe(signed.data.user.id)
    expect(await db.select().from(habits)).toEqual(originalHabits)
    expect((await call('/me',undefined,authenticated.data.token)).status).toBe(401)
    expect(await db.select().from(passkeys)).toHaveLength(1)
    expect((await call('/enroll/options',{email:'alice@example.com',recoveryCode:code})).status).toBe(400)
    const anotherKey = await testAuthenticator(competing.data.options,'http://localhost:3100')
    expect((await call('/enroll/verify',{challengeId:competing.data.challengeId,response:anotherKey.response})).status).toBe(400)
    expect((await call('/recovery-codes',{},signed.data.token)).status).toBe(401)
    const regenerated = await call('/recovery-codes',{},recovered.data.token)
    expect(regenerated.status).toBe(200)
    expect(regenerated.data.recoveryCodes).toHaveLength(8)
    expect((await call('/enroll/options',{email:'alice@example.com',recoveryCode:recovered.data.recoveryCodes[0]})).status).toBe(400)
    expect(await db.select().from(recoveryCodes)).toHaveLength(8)
    client.close()
  })
  it('rejects wrong origins, absent user verification and expired challenges without creating an account', async () => {
    const { call, db, client } = await setup()
    for (const [origin,flags] of [['https://evil.test',0x45],['http://localhost:3100',0x41]] as const) {
      const begin = await call('/enroll/options',{email:'invalid@example.com'})
      const key = await testAuthenticator(begin.data.options,origin,{flags})
      expect((await call('/enroll/verify',{challengeId:begin.data.challengeId,response:key.response})).status).toBe(400)
    }
    const begin = await call('/enroll/options',{email:'invalid@example.com'})
    await db.update(authEnrollments).set({expiresAt:new Date(0)}).where(eq(authEnrollments.id,begin.data.challengeId))
    const key = await testAuthenticator(begin.data.options,'http://localhost:3100')
    expect((await call('/enroll/verify',{challengeId:begin.data.challengeId,response:key.response})).status).toBe(400)
    expect(await db.select().from(users)).toHaveLength(0)
    client.close()
  })
  it('protects migrated accounts with expiring setup codes and preserves their data', async () => {
    const { call, db, client } = await setup()
    const now = new Date()
    await db.insert(users).values({id:'migrated',email:'owner@example.com',displayName:'Owner',createdAt:now,updatedAt:now})
    await db.insert(habits).values({id:'preserved',userId:'migrated',name:'My habit',frequency:'daily',createdAt:now,updatedAt:now})
    const hash = await recoveryHash('owner@example.com','test-setup-code')
    await db.insert(recoveryCodes).values({hash,userId:'migrated',expiresAt:new Date(0)})
    expect((await call('/enroll/options',{email:'owner@example.com'})).status).toBe(409)
    expect((await call('/enroll/options',{email:'owner@example.com',recoveryCode:'wrong'})).status).toBe(400)
    expect((await call('/enroll/options',{email:'owner@example.com',recoveryCode:'test-setup-code'})).status).toBe(400)
    await db.update(recoveryCodes).set({expiresAt:new Date(Date.now()+60000)}).where(eq(recoveryCodes.hash,hash))
    const begin = await call('/enroll/options',{email:'owner@example.com',recoveryCode:'test-setup-code'})
    const key = await testAuthenticator(begin.data.options,'http://localhost:3100')
    const recovered = await call('/enroll/verify',{challengeId:begin.data.challengeId,response:key.response})
    expect(recovered.status).toBe(200)
    expect(recovered.data.user.id).toBe('migrated')
    expect(await db.select().from(habits)).toHaveLength(1)
    client.close()
  })
})
