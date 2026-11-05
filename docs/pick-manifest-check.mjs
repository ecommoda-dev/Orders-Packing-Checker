// ══════════════════════════════════════════════════════════════
// docs/pick-manifest-check.mjs — فحص `POST get_pick_manifest` (Worker v2.11.0 · §PICK)
//
// بيشغّل الـ Worker الحقيقي (index.js) على `fetch` وهمي لشوبيفاي — مفيش أي نداء
// شبكة حقيقي. الغياب (مفيش ميوتيشن · `returns` للـ S2 بس) بيتقاس من النداءات
// نفسها مش من الرد.
//
// التشغيل:  node docs/pick-manifest-check.mjs
// ══════════════════════════════════════════════════════════════
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// index.js بدون package.json type — بننسخه .mjs مؤقتًا عشان الاستيراد يشتغل على أي نسخة Node
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pick-')), 'worker.mjs');
fs.copyFileSync(new URL('../index.js', import.meta.url), tmp);
const worker = (await import(tmp)).default;

let pass = 0, fail = 0;
const is = (c, m, d = '') => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌', m, d); } };

const mk = (id, over = {}) => ({
  id: `gid://shopify/Order/${id}`, legacyResourceId: String(id), name: `#${id}`,
  displayFulfillmentStatus: 'UNFULFILLED', cancelledAt: null,
  manual_status: { value: 'Ready' }, status_2_r_e: null,
  printing_time_s1: { value: '2026-11-05T08:00:00Z' }, printing_time_s2: null,
  s1_packed_by: null, s1_packing_dt: null, s2_packed_by: null, s2_packing_dt: null,
  lineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] }, ...over });
const li = (id, sku, qty, fq, bc) => ({ id: `li${id}`, title: `T-${sku || 'x'}`, sku, quantity: qty,
  currentQuantity: fq, fulfillableQuantity: fq, variant: { id: 'v' + id, barcode: bc, selectedOptions: [{ name: 'Size', value: '45' }] } });
const nodes = (...n) => ({ pageInfo: { hasNextPage: false, endCursor: null }, nodes: n });

const DB = {
  1: mk(1, { displayFulfillmentStatus: 'FULFILLED', lineItems: nodes(li(1, 'A / Black / 45', 2, 2, '111'), li(2, '', 1, 1, '222')) }),
  2: mk(2, { cancelledAt: '2026-11-04T00:00:00Z', lineItems: nodes(li(3, 'A', 1, 1, '1')) }),
  3: mk(3, { s1_packed_by: { value: 'x' }, s1_packing_dt: { value: '2026-11-05T09:00:00Z' }, lineItems: nodes(li(4, 'A', 1, 1, '1')) }),
  4: mk(4, { manual_status: null, status_2_r_e: { value: 'Ready' }, printing_time_s1: null, printing_time_s2: { value: '2026-11-05T08:00:00Z' },
    lineItems: nodes(li(5, 'OLD', 1, 0, '9'), li(6, 'NEW / Red / 40', 1, 1, '333')),
    returns: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'r1', status: 'OPEN', createdAt: '2026-11-05T00:00:00Z',
      exchangeLineItems: { pageInfo: { hasNextPage: false }, nodes: [{ id: 'e1', quantity: 1,
        lineItems: [{ id: 'li6', title: 'N', sku: 'NEW / Red / 40', quantity: 1, variant: { id: 'v6', barcode: '333', selectedOptions: [] } }] }] } }] } }),
  5: mk(5, { manual_status: { value: 'Shipped' }, lineItems: nodes(li(7, 'A', 1, 1, '1')) }),
  7: mk(7, { lineItems: nodes(li(8, 'A', 1, 0, '1')) }),
  8: mk(8, { printing_time_s1: null, lineItems: nodes(li(9, 'A', 1, 1, '1')) }),
};
const gqlCalls = [];
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('oauth')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
  const b = JSON.parse(opts.body);
  gqlCalls.push({ id: b.variables.id.split('/').pop(), withReturns: b.variables.withReturns, mutation: /mutation/.test(b.query) });
  return new Response(JSON.stringify({ data: { order: DB[b.variables.id.split('/').pop()] || null } }), { status: 200 });
};
const env = { WORKER_SECRET: 's', SHOP_DOMAIN: 'x.myshopify.com', CLIENT_ID: 'a', CLIENT_SECRET: 'b', DB: {} };
const call = (method, body) => worker.fetch(new Request('https://w/?action=get_pick_manifest', {
  method, headers: { Authorization: 'Bearer s', Origin: 'https://ecommoda-dev.github.io' }, body: body && JSON.stringify(body) }), env);

console.log('\n① الحكم الحيّ + البنود');
const r = await call('POST', { orders: ['1', '2', '3', '5', '6', '7', '8'].map(id => ({ id, type: 'S1' })).concat([{ id: '4', type: 'S2' }, { id: '1', type: 'S1' }]) });
const j = await r.json();
is(r.status === 200 && j.ok, 'الرد 200 ok');
is(j.requested === 8, 'تكرار id:type اتشال (٩ مبعوتة ← ٨)');
is(j.orders.map(o => o.orderNumber).join() === '#1,#4', 'الجاهز بس: #1 و#4', j.orders.map(o => o.orderNumber).join());
const o1 = j.orders.find(o => o.orderId === '1');
is(o1.items.length === 2 && o1.items[0].quantity === 2 && o1.items[0].sku === 'A / Black / 45' && o1.items[0].barcode === '111', 'بنود #1 بالـ SKU والباركود والكمية');
is(o1.items[1].sku === '' && o1.items[1].title === 'T-x', 'الصنف بلا SKU راجع بـ sku فاضي وعنوانه');
is(o1.isRepeatAttempt === true, 'S1 + FULFILLED ← isRepeatAttempt = true');
const o4 = j.orders.find(o => o.orderId === '4');
is(o4.orderType === 'S2' && o4.items.length === 1 && o4.items[0].sku === 'NEW / Red / 40', 'S2 ← بند الاستبدال بس (مش OLD)');
is(o4.isRepeatAttempt === null, 'S2 ← isRepeatAttempt = null');
const sk = Object.fromEntries(j.skipped.map(s => [s.orderNumber, s.code]));
is(sk['#2'] === 'cancelled', 'ملغي ← skipped:cancelled');
is(sk['#3'] === 'already_packed', 'متغلّف ← skipped:already_packed');
is(sk['#5'] === 'status_changed', 'الحالة بقت Shipped ← skipped:status_changed');
is(sk['#7'] === 'no_items', 'مفيش بنود نشطة ← skipped:no_items');
is(sk['#8'] === 'not_printed', 'ما اتطبعش ← skipped:not_printed');
is(j.skipped.every(s => s.reason), 'كل skipped معاه سبب مكتوب');
is(j.failed.length === 1 && j.failed[0].orderId === '6' && j.failed[0].reason, 'أوردر مش موجود ← failed (مايتبلعش)');
is(Array.isArray(j.truncated) && j.truncated.length === 0, 'truncated فاضية');

console.log('\n② قراءة بحتة + الاستعلام');
is(gqlCalls.every(c => !c.mutation), '🔴 صفر ميوتيشن');
const wr = Object.fromEntries(gqlCalls.map(c => [c.id, c.withReturns]));
is(wr['4'] === true && wr['1'] === false && wr['5'] === false, '`returns` بتتجاب للـ S2 بس (@include)');

console.log('\n③ التحقق من الجسم');
is((await call('GET')).status === 405, 'GET ← 405');
is((await (await call('POST', { orders: [] })).json()).error === 'orders فاضية', 'orders فاضية ← 400');
is((await call('POST', { orders: [{ id: '1', type: 'X' }] })).status === 400, 'type غلط ← 400');
is((await call('POST', { orders: [{ id: 'abc', type: 'S1' }] })).status === 400, 'id مش رقمي ← 400');
is((await call('POST', { orders: Array.from({ length: 41 }, (_, i) => ({ id: String(i + 10), type: 'S1' })) })).status === 400, 'أكتر من ٤٠ ← 400');
const noAuth = await worker.fetch(new Request('https://w/?action=get_pick_manifest', { method: 'POST', body: '{}' }), env);
is(noAuth.status === 401, 'من غير السر ← 401');

console.log(`\n${fail ? '❌' : '✅'} النتيجة: ${pass} عدّى · ${fail} فشل`);
process.exit(fail ? 1 : 0);
