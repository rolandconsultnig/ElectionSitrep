/* Scoped-jurisdiction smoke test: HQ / State(Oyo) / State(Lagos) / Area(Ibadan North) */
const BASE = 'http://127.0.0.1:5530'

async function login(username) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'demo' }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`login ${username} failed: ${r.status} ${JSON.stringify(j)}`)
  return j
}

async function api(token, method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, body: j }
}

const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1 }
const ok = (msg) => console.log(`ok: ${msg}`)

const run = async () => {
  // 1. login + jurisdiction in payload
  const oyo = await login('oyo.command')
  const lagos = await login('lagos.command')
  const hq = await login('hq.command')
  const area = await login('area.ibadan')

  const oyoMe = await api(oyo.token, 'GET', '/api/auth/me')
  const j = oyoMe.body?.user?.jurisdiction
  if (j?.level === 'state' && /oyo/i.test(j.stateName || '')) ok(`auth/me jurisdiction: ${j.level} / ${j.stateName}`)
  else fail(`auth/me jurisdiction wrong: ${JSON.stringify(j)}`)

  // 2. POST sitreps as Oyo, Lagos, and Area
  const p1 = await api(oyo.token, 'POST', '/api/sitreps', { kind: 'sitrep', category: 'security', severity: 'medium', title: 'Oyo morning brief', body: 'All quiet across Ibadan.' })
  if (p1.status === 201 || p1.status === 200) ok(`oyo POST sitrep → ${p1.status}`); else fail(`oyo POST → ${p1.status} ${JSON.stringify(p1.body)}`)
  const p2 = await api(lagos.token, 'POST', '/api/sitreps', { kind: 'incident', category: 'logistics', severity: 'critical', title: 'Lagos ballot delay', body: 'Materials late at Lagos Island.' })
  if (p2.status === 201 || p2.status === 200) ok(`lagos POST sitrep → ${p2.status}`); else fail(`lagos POST → ${p2.status} ${JSON.stringify(p2.body)}`)
  const p3 = await api(area.token, 'POST', '/api/sitreps', { kind: 'sitrep', category: 'personnel', severity: 'low', title: 'Ibadan North roll call', body: 'All officers present.' })
  if (p3.status === 201 || p3.status === 200) ok(`area POST sitrep → ${p3.status}`); else fail(`area POST → ${p3.status} ${JSON.stringify(p3.body)}`)

  // 3. scoping: Oyo sees only Oyo
  const oyoFeed = await api(oyo.token, 'GET', '/api/sitreps?limit=100')
  const oyoItems = oyoFeed.body?.sitreps || []
  const oyoStates = new Set(oyoItems.map((i) => i.state))
  if (oyoStates.size <= 1 && [...oyoStates].every((s) => /oyo/i.test(s || ''))) ok(`oyo feed scoped: ${oyoItems.length} rows, states=${[...oyoStates].join(',') || '(none)'}`)
  else fail(`oyo feed leaked: states=${[...oyoStates].join(',')}`)

  // 4. Lagos sees only Lagos
  const lagosFeed = await api(lagos.token, 'GET', '/api/sitreps?limit=100')
  const lagosItems = lagosFeed.body?.sitreps || []
  const lagosStates = new Set(lagosItems.map((i) => i.state))
  if (lagosStates.size <= 1 && [...lagosStates].every((s) => /lagos/i.test(s || ''))) ok(`lagos feed scoped: ${lagosItems.length} rows`)
  else fail(`lagos feed leaked: states=${[...lagosStates].join(',')}`)

  // 5. HQ sees everything
  const hqFeed = await api(hq.token, 'GET', '/api/sitreps?limit=100')
  const hqStates = new Set((hqFeed.body?.sitreps || []).map((i) => i.state))
  if (hqStates.size >= 2) ok(`hq feed national: states=${[...hqStates].join(',')}`)
  else fail(`hq feed should span states, got ${[...hqStates].join(',')}`)

  // 6. Area sees only its LGA
  const areaFeed = await api(area.token, 'GET', '/api/sitreps?limit=100')
  const areaItems = areaFeed.body?.sitreps || []
  const areaLgas = new Set(areaItems.map((i) => i.lga))
  if (areaLgas.size <= 1 && [...areaLgas].every((s) => /ibadan north/i.test(s || ''))) ok(`area feed scoped to LGA: ${areaItems.length} rows, lga=${[...areaLgas].join(',') || '(none)'}`)
  else fail(`area feed leaked: lgas=${[...areaLgas].join(',')}`)

  // 7. cross-jurisdiction PATCH must 404
  const lagosItem = lagosItems.find((i) => String(i.id).startsWith('cmd-'))
  if (lagosItem) {
    const patch = await api(oyo.token, 'PATCH', `/api/sitreps/${lagosItem.id}/status`, { status: 'acknowledged' })
    if (patch.status === 404 || patch.status === 403) ok(`cross-jurisdiction PATCH blocked (${patch.status})`)
    else fail(`cross-jurisdiction PATCH returned ${patch.status}`)
  } else fail('no cmd- lagos item to test PATCH')

  // 8. own-jurisdiction PATCH works
  const oyoItem = oyoItems.find((i) => String(i.id).startsWith('cmd-'))
  if (oyoItem) {
    const patch = await api(oyo.token, 'PATCH', `/api/sitreps/${oyoItem.id}/status`, { status: 'acknowledged' })
    if (patch.status === 200) ok('own-jurisdiction PATCH ok')
    else fail(`own PATCH → ${patch.status} ${JSON.stringify(patch.body)}`)
  }

  // 9. summary endpoint scoped
  const oyoSum = await api(oyo.token, 'GET', '/api/sitreps/summary')
  const hqSum = await api(hq.token, 'GET', '/api/sitreps/summary')
  const oyoTotal = oyoSum.body?.total ?? oyoSum.body?.summary?.total
  const hqTotal = hqSum.body?.total ?? hqSum.body?.summary?.total
  if (typeof oyoTotal === 'number' && typeof hqTotal === 'number' && hqTotal >= oyoTotal) ok(`summary scoped: oyo=${oyoTotal} hq=${hqTotal}`)
  else fail(`summary wrong: oyo=${JSON.stringify(oyoSum.body)} hq=${JSON.stringify(hqSum.body)}`)

  console.log('smoke test complete')
}

run().catch((e) => { console.error('FATAL', e.message); process.exitCode = 1 })
