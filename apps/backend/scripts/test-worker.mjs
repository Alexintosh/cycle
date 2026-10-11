import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const emails = new Map()
const secret = 'local-worker-test-secret-at-least-32-characters'
const mf = new Miniflare(convertV4MiniflareOptions({
  workers: [{
    name: 'cycle', modules: true, scriptPath: 'dist/worker.js',
    compatibilityDate: '2026-08-20', compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'test-cycle' },
    bindings: {
      NODE_ENV: 'production', FRONTEND_URL: 'https://cycle.test', JWT_SECRET: secret,
      EMAIL_FROM: 'test@cycle.test', EMAIL_AUTH_ENABLED: 'true',
    },
    serviceBindings: { ASSETS: () => new Response('frontend'), EMAIL: 'email-mock' },
    outboundService: () => { throw new Error('Tests must not make external calls') },
  }, {
    name: 'email-mock', modules: true, compatibilityDate: '2026-08-20',
    script: `import { WorkerEntrypoint } from 'cloudflare:workers';
      export default class extends WorkerEntrypoint {
        async send(message) {
          await this.env.CAPTURE.fetch(new Request('https://email.test', {
            method: 'POST', body: JSON.stringify(message),
          }));
          return { messageId: 'mock-email' };
        }
      }`,
    serviceBindings: { CAPTURE: async (request) => {
      const mail = await request.json()
      assert.equal(mail.from.email, 'test@cycle.test')
      emails.set(mail.to, /\b\d{6}\b/.exec(mail.text)[0])
      return new Response(null, { status: 202 })
    } },
  }],
}))
try {
  const db = await mf.getD1Database('DB')
  const schema = await readFile('migrations/0001_initial.sql', 'utf8') + await readFile('migrations/0002_passkey_signup.sql', 'utf8') + await readFile('migrations/0003_offline_sync.sql', 'utf8') + await readFile('migrations/0004_package_authoring.sql', 'utf8')
  await db.batch(schema.split(';').map((part) => part.trim()).filter(Boolean).map((part) => db.prepare(part)))
  async function call(path, token, body, method) {
    return mf.dispatchFetch(`https://cycle.test/api${path}`, {
      method: method ?? (body ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  }
  assert.equal((await mf.dispatchFetch('https://cycle.test/week')).status, 200)
  assert.equal((await call('/health')).status, 200)
  assert.equal((await call('/habits')).status, 401)
  async function login(email) {
    const sent = await call('/auth/request-otp', null, { email })
    assert.equal(sent.status, 200, await sent.text())
    const stored = await db.prepare('SELECT code FROM one_time_passwords WHERE email=?').bind(email).first()
    assert.equal(stored.code, createHmac('sha256', secret).update(`${email}:${emails.get(email)}`).digest('hex'))
    const response = await call('/auth/verify-otp', null, { email, code: emails.get(email) })
    const payload = await response.json()
    assert.equal(response.status, 200, JSON.stringify(payload))
    return payload.data
  }
  const alice = await login('alice@cycle.test'), bob = await login('bob@cycle.test')
  const aliceData = (await (await call('/data/export', alice.token)).json()).data
  assert.ok(aliceData.habits.length)
  assert.equal((await call(`/habits/${aliceData.habits[0].id}`, bob.token)).status, 404)
  const snapshot = { ...aliceData, logs: [{ id: 'log-1', habitId: aliceData.habits[0].id, logDate: '2026-10-11', loggedAt: new Date().toISOString() }] }
  const imported = await call('/data/import', bob.token, snapshot)
  assert.equal(imported.status, 200, await imported.text())
  const bobData = (await (await call('/data/export', bob.token)).json()).data
  assert.notEqual(bobData.habits[0].id, aliceData.habits[0].id)
  assert.equal(bobData.logs.length, 1)
  const conflictPackage = { id: 'p', packageId: 'duplicate', title: 'Package', author: 'test', installedVersion: '1', installedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  assert.equal((await call('/data/import', bob.token, { ...bobData, packages: [conflictPackage, conflictPackage] })).status, 400)
  const after = (await (await call('/data/export', bob.token)).json()).data
  assert.deepEqual(after.habits, bobData.habits)
  assert.deepEqual(after.logs, bobData.logs)
  const registry = (await (await call('/packages/registry', alice.token)).json()).data
  const pkg = registry.packages[0]
  assert.ok(pkg)
  const installed = await call(`/packages/${pkg.id}/install`, alice.token, {})
  assert.equal(installed.status, 200, await installed.text())
  const ownedInput = { title: 'D1 published package', version: '1.0.0', items: Array.from({length:15},(_,index) => ({id:'item-'+index,title:'Item '+index,timeframe:'monthly',section:'UPKEEP',goal:1})) }
  const createdPackage = await call('/packages',alice.token,ownedInput)
  const createdPayload = await createdPackage.json()
  assert.equal(createdPackage.status,200,JSON.stringify(createdPayload))
  assert.equal(createdPayload.data.items.length,15)
  const ownedId = createdPayload.data.id
  const owned = (await (await call('/packages/mine',alice.token)).json()).data
  assert.ok(owned.some(item => item.id===ownedId))
  assert.equal((await call('/packages/'+ownedId,bob.token,ownedInput,'PATCH')).status,404)
  const updatedPackage = await call('/packages/'+ownedId,alice.token,{...ownedInput,version:'1.1.0'},'PATCH')
  assert.equal(updatedPackage.status,200,await updatedPackage.text())
  assert.equal((await call('/packages/'+ownedId+'/install',bob.token,{})).status,200)
  await db.prepare("CREATE TRIGGER reject_test_item BEFORE INSERT ON package_items WHEN NEW.title = 'Rejected test item' BEGIN SELECT RAISE(ABORT, 'Test rollback'); END").run()
  const rejectedPackage = await call('/packages',alice.token,{title:'Must roll back',version:'1',items:[{title:'Rejected test item',timeframe:'daily'}]})
  assert.equal(rejectedPackage.status,400,await rejectedPackage.text())
  assert.equal(await db.prepare("SELECT id FROM packages WHERE title='Must roll back'").first(),null)
  await db.prepare('DROP TRIGGER reject_test_item').run()
  const manyLogs = await call(`/habits/${aliceData.habits[0].id}/logs`, alice.token, { count: 100, date: '2026-10-11' })
  assert.equal(manyLogs.status, 200, await manyLogs.text())
  const offlineCommand = { id: crypto.randomUUID(), habitId: aliceData.habits[0].id, kind: 'add-log', date: '2026-10-11', count: 2, loggedAt: new Date().toISOString() }
  const beforeOffline = (await (await call('/data/export', alice.token)).json()).data.logs.length
  const sync = await call('/habits/sync', alice.token, offlineCommand)
  assert.equal(sync.status,200,await sync.text())
  const replay = await call('/habits/sync', alice.token, offlineCommand)
  assert.equal(replay.status,200,await replay.text())
  const afterOffline = (await (await call('/data/export', alice.token)).json()).data.logs.length
  assert.equal(afterOffline,beforeOffline+2)
  assert.equal((await call('/habits/sync',bob.token,{...offlineCommand,id:crypto.randomUUID()})).status,404)
  assert.equal((await call('/habits/sync',alice.token,{...offlineCommand,count:3})).status,409)
  const refreshed = await call('/auth/refresh', null, { refreshToken: alice.refreshToken })
  assert.equal(refreshed.status, 200)
  const tokens = (await refreshed.json()).data
  assert.equal((await call('/auth/refresh', null, { refreshToken: alice.refreshToken })).status, 401)
  assert.equal((await call('/auth/me', alice.token)).status, 401)
  assert.equal((await call('/auth/logout', tokens.token, {}, 'POST')).status, 200)
  assert.equal((await call('/auth/me', tokens.token)).status, 401)
  assert.equal((await call('/auth/refresh', null, { refreshToken: tokens.refreshToken })).status, 401)
  console.log('Worker/D1: OTP, tenant isolation, atomic imports, packages, refresh and logout passed.')
} finally {
  await mf.dispose()
}

// Exercise the deployed authentication mode without any email binding or sender.
const passwordless = new Miniflare(convertV4MiniflareOptions({
  name: 'cycle-passwordless', modules: true, scriptPath: 'dist/worker.js',
  compatibilityDate: '2026-08-20', compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'passwordless-cycle' },
  bindings: { NODE_ENV: 'production', FRONTEND_URL: 'https://cycle.test', JWT_SECRET: secret },
  serviceBindings: { ASSETS: () => new Response('frontend') },
  outboundService: () => { throw new Error('Passwordless auth must not make external calls') },
}))
try {
  const { testAuthenticator } = await import('./webauthn-fixture.mjs')
  const db = await passwordless.getD1Database('DB')
  for (const file of ['0001_initial.sql','0002_passkey_signup.sql','0003_offline_sync.sql','0004_package_authoring.sql']) {
    const schema = await readFile('migrations/'+file,'utf8')
    await db.batch(schema.split(';').map(part => part.trim()).filter(Boolean).map(part => db.prepare(part)))
  }
  const call = async (path, body, token) => {
    const response = await passwordless.dispatchFetch('https://cycle.test/api/auth'+path, {
      method: body ? 'POST' : 'GET', headers: { 'content-type':'application/json', ...(token ? {authorization:'Bearer '+token} : {}) },
      ...(body ? {body:JSON.stringify(body)} : {}),
    })
    return {status:response.status,...await response.json()}
  }
  assert.equal((await call('/request-otp',{email:'passkey@cycle.test'})).status,403)
  const begin = await call('/enroll/options',{email:'passkey@cycle.test'})
  assert.equal(begin.status,200)
  const key = await testAuthenticator(begin.data.options,'https://cycle.test')
  const session = await call('/enroll/verify',{challengeId:begin.data.challengeId,response:key.response})
  assert.equal(session.status,200,JSON.stringify(session))
  assert.equal(session.data.recoveryCodes.length,8)
  assert.equal((await call('/me',null,session.data.token)).status,200)
  assert.equal((await call('/enroll/options',{email:'passkey@cycle.test'})).status,409)
  const bodyless = await passwordless.dispatchFetch('https://cycle.test/api/auth/passkeys/authenticate/options', { method: 'POST' })
  const auth = { status: bodyless.status, ...await bodyless.json() }
  assert.equal(auth.status, 200, JSON.stringify(auth))
  const login = await call('/passkeys/authenticate/verify',{challengeId:auth.data.challengeId,response:await key.authenticate(auth.data.options)})
  assert.equal(login.status,200,JSON.stringify(login))
  const recover = await call('/enroll/options',{email:'passkey@cycle.test',recoveryCode:session.data.recoveryCodes[0]})
  const replacement = await testAuthenticator(recover.data.options,'https://cycle.test')
  const restored = await call('/enroll/verify',{challengeId:recover.data.challengeId,response:replacement.response})
  assert.equal(restored.status,200,JSON.stringify(restored))
  assert.equal(restored.data.user.id,session.data.user.id)
  assert.equal((await call('/me',null,session.data.token)).status,401)
  assert.equal((await call('/enroll/options',{email:'passkey@cycle.test',recoveryCode:session.data.recoveryCodes[0]})).status,400)
  const stored = await db.prepare('SELECT hash FROM recovery_codes WHERE user_id=?').bind(session.data.user.id).all()
  assert.equal(stored.results.length,8)
  assert.ok(stored.results.every(row => /^[a-f0-9]{64}$/.test(row.hash)))
  console.log('Worker/D1 without email: passkey signup, signed login, recovery and revocation passed.')
} finally { await passwordless.dispose() }
