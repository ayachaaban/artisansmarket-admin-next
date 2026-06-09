const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const SERVICE_ACCOUNT = path.join(
  __dirname,
  '..',
  'artisansmarket-5f2b6-firebase-adminsdk-fbsvc-db3140094b.json',
);

initializeApp({ credential: cert(require(SERVICE_ACCOUNT)) });
const db = getFirestore();

const AI_ENDPOINT = 'https://artisans-push.artisansmarket.workers.dev/ai';
const AI_AUTH = 'f59d5b3cb8b2c54a2fea349b000ffeede367b8d3f6f7997a21f453f10fe180cf';
const DEV_BASE = 'http://localhost:3000';

const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✘\x1b[0m';
const DOT = '\x1b[90m·\x1b[0m';
let pass = 0,
  fail = 0;
const ok = (m) => { pass++; console.log(`  ${PASS} ${m}`); };
const bad = (m, e) => { fail++; console.log(`  ${FAIL} ${m}${e ? ` — ${e.message || e}` : ''}`); };
const note = (m) => console.log(`    ${DOT} ${m}`);
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function checkCollection(name, required = []) {
  try {
    const snap = await db.collection(name).limit(3).get();
    ok(`read \`${name}\` (sampled ${snap.size})`);
    if (snap.empty) return note('(empty)');
    const sample = snap.docs[0].data();
    const missing = required.filter((k) => !(k in sample));
    if (missing.length) bad(`  \`${name}\` missing: [${missing.join(', ')}]`);
    else if (required.length) ok(`  shape OK [${required.join(', ')}]`);
    const total = (await db.collection(name).count().get()).data().count;
    note(`total: ${total}`);
  } catch (e) {
    bad(`read \`${name}\` failed`, e);
  }
}

async function checkAdmins() {
  try {
    const snap = await db.collection('admins').get();
    if (snap.empty) bad('no admins in /admins');
    else {
      ok(`/admins has ${snap.size} doc(s)`);
      snap.docs.forEach((d) => note(`${d.data().email || d.id} (${d.data().role || 'n/a'})`));
    }
  } catch (e) {
    bad('cannot read /admins', e);
  }
}

async function checkWrite() {
  const ref = db.collection('_smoke_test').doc(`run-${Date.now()}`);
  try {
    await ref.set({ at: FieldValue.serverTimestamp() });
    if (!(await ref.get()).exists) return bad('write/read mismatch');
    ok('write succeeded');
    await ref.delete();
    ok('delete succeeded');
  } catch (e) {
    bad('write/delete failed', e);
  }
}

async function checkAi() {
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Push-Auth': AI_AUTH },
      body: JSON.stringify({
        max_tokens: 20,
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'Reply with the word PONG.' },
          { role: 'user', content: 'ping' },
        ],
      }),
    });
    if (!res.ok) return bad(`worker /ai → ${res.status}`);
    const j = await res.json();
    const r = j?.choices?.[0]?.message?.content?.trim() || '';
    if (r) ok(`worker /ai reachable (reply "${r.slice(0, 30)}")`);
    else bad('worker /ai empty reply');
  } catch (e) {
    bad('worker /ai unreachable', e);
  }
}

async function checkRoute(r) {
  try {
    const res = await fetch(DEV_BASE + r, { redirect: 'manual' });
    if (res.status >= 200 && res.status < 400) ok(`${r} → ${res.status}`);
    else bad(`${r} → ${res.status}`);
  } catch (e) {
    bad(`${r} unreachable`, e.message);
  }
}

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('   Artisans Market — Final smoke test');
  console.log('═══════════════════════════════════════════════════');

  section('[1] Admin accounts');
  await checkAdmins();

  section('[2] Every Firestore collection used by the admin');
  await checkCollection('users', ['name', 'email', 'role', 'status']);
  await checkCollection('posts', ['artistId', 'description', 'category', 'status']);
  await checkCollection('orders', ['customerId', 'artistId', 'status']);
  await checkCollection('payments', ['amount', 'status']);
  await checkCollection('payouts', ['artistId', 'amount', 'status']);
  await checkCollection('wallets', ['balance']);
  await checkCollection('ratings', ['artistId', 'customerId', 'stars']);
  await checkCollection('reports', ['reporterId', 'postId', 'reason', 'status']);
  await checkCollection('notifications', ['userId', 'title', 'message', 'type']);
  await checkCollection('broadcasts');
  await checkCollection('subscriptions', ['artistId', 'plan']);
  await checkCollection('conversations');

  section('[3] Firestore write + delete round-trip');
  await checkWrite();

  section('[4] Cloudflare Worker /ai');
  await checkAi();

  section('[5] Next.js dev routes');
  for (const r of [
    '/login',
    '/dashboard/overview',
    '/dashboard/users',
    '/dashboard/posts',
    '/dashboard/orders',
    '/dashboard/payments',
    '/dashboard/payouts',
    '/dashboard/ratings',
    '/dashboard/reports',
    '/dashboard/notifications',
    '/dashboard/ai',
    '/dashboard/analytics',
  ]) {
    await checkRoute(r);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`   ${pass} passed · ${fail} failed`);
  console.log('═══════════════════════════════════════════════════');
  setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(2);
});
