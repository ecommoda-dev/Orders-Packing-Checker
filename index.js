// ══════════════════════════════════════════════════════════════
// §CONSTANTS
// Pack Checker Worker — EcomModa  v2.1.0
// Tool: pack_checker | Endpoints: get_order, complete_pack, diag, get_config
// skills: worker-builder v2.0.0 · constants v1.4.3 · order-lifecycle v1.2.0 · shopify-graphql-helper v1.0.0 — 03-09-2026
//
// CHANGELOG v2.1.0:
//   - 🟠 R6 — حارس `WORKER_SECRET` الغايب قبل فحص المصادقة. من غيره
//     `Bearer ${env.WORKER_SECRET}` بيتقيّم للنص الحرفي "Bearer undefined"
//     لو السيكرت اتنسي أو النسخة اتنشرت بدون Promote — فأي طلب بالرأس ده
//     كان بيعدّي المصادقة. الرد بقى 500 برسالة صريحة + step:'env'.
//     (مراجعة 03-09-2026 · R6 · نفس حارس logistics-control-center-worker)
//
// CHANGELOG v2.0.0:
//   - shopifyGQL استُبدلت بالنسخة القياسية الكاملة (worker-builder Step 5A ①):
//     كانت `return res.json()` — بترجّع 401/429/5xx كأنها رد سليم
//   - getAccessToken: فحص resp.ok + جسم JSON بدل urlencoded
//   - كل ميوتيشن بتعدّي التلات فحوصات: top-level → userErrors → تأكيد الـ payload
//     (tagsAdd بقت بتطلب node.tags وبتتأكد إن الـ tag موجود فعلاً بعد الكتابة)
//   - assertEnv() قبل أي نداء شوبيفاي — متغيّر ناقص بيوقف العملية باسمه
//   - فشل D1 بقى logged:false مش 500 كذّاب على عملية تمّت فعلاً (Step 5A ⑦)
//   - الـ UPDATE بعد writeLog بقى بيتحقق من meta.changes — الأعمدة الأربعة
//     ماعادش ممكن تفضل NULL في السكوت
//   - نتيجة complete_pack بقت تلات حالات: success / warning / error + actions[]
//   - كشف التغيير بقى على extra.fingerprint المخزّن (مصدر ماشين-ريدابل)،
//     وتحليل نص `items` بقى fallback للصفوف القديمة بس
//   - pagination حقيقي لـ lineItems و returns — والقصّ المتبقّي بيترجع
//     كـ truncated بدل ما يعدّي بصمت
//   - حذف 'Printed' من S1_VALUES/S2_VALUES — مش قيمة موجودة في choice list
//     (ecommoda-order-lifecycle §S1/§S2)
//   - كميات الاستبدال بقت من نفس مصدر الحقيقة (fulfillableQuantity) لما
//     القطعة موجودة في lineItems — كانت بتختلف حسب أنهي حلقة سبقت
//   - endpointان إلزاميان: ?action=diag و ?action=get_config (Step 5A ⑨)
//   - فلاتر السجل بقت قوايم (employees/types) + dateFrom/dateTo عبر
//     buildLogFilterSQL، وget_logs_export بيرجّع cap/total/truncated
//   - ALLOWED_ORIGINS: حذف الدومين المهجور ecommoda24.github.io
//     (كان ALLOWED_ORIGINS[0] يعني قيمة الـ fallback نفسها)
//
// CHANGELOG v1.5.0:
//   - BUGFIX: حذف refundedIds بالكامل من classifyOrderItems
//   - الاعتماد بالكامل على fulfillableQuantity كمصدر الحقيقة الوحيد
// CHANGELOG v1.4.0:
//   - BUGFIX: storedItems + packingDateTime في responses الـ alreadyPacked
// CHANGELOG v1.3.0:
//   - استبدال منطق كشف التغيير: بدل editCount → items fingerprint
// ══════════════════════════════════════════════════════════════

const TOOL_NAME      = 'pack_checker';
const WORKER_VERSION = '2.1.0';

// ══════════════════════════════════════════════════════════════
// §CORS
// أداة كتابة (ميتافيلدات + tags على أوردرات حية) → Option B صارمة
// ══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://ecommoda-dev.github.io',
];
function getCORS(request) {
  const origin  = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// ══════════════════════════════════════════════════════════════
// §HELPERS
// ══════════════════════════════════════════════════════════════
function json(data, status = 200, request = null) {
  const headers = { 'Content-Type': 'application/json' };
  Object.assign(headers, request ? getCORS(request) : { 'Access-Control-Allow-Origin': '*' });
  return new Response(JSON.stringify(data), { status, headers });
}

// ─── §HELPERS::assertEnv ───
// متغير ناقص لازم يوقف العملية برسالة باسمه.
const ENV_REQUIRED = {
  shopify: ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET'],
  bosta:   ['BOSTA_API_KEY'],
  stock:   ['LOCATION_ID'],
};

function assertEnv(env, ...groups) {
  const missing = [];
  for (const g of groups) {
    for (const key of (ENV_REQUIRED[g] || [])) {
      if (env[key] === undefined || env[key] === null || String(env[key]).trim() === '') missing.push(key);
    }
  }
  if (!env.DB) missing.push('DB (D1 binding)');
  if (missing.length) {
    throw new Error(
      `متغيرات ناقصة في الـ Worker: ${missing.join('، ')} — ضِفها من ` +
      `Dashboard → Settings → Variables ثم Promote النسخة. (شغّل ?action=diag)`
    );
  }
}

// ══════════════════════════════════════════════════════════════
// §SHARED — copy verbatim — never modify
// EcomModa D1 Pattern v1.3.0
// ══════════════════════════════════════════════════════════════

async function verifyEmployee(db, username, pin) {
  const row = await db.prepare(
    'SELECT display_name, is_active FROM employees WHERE username = ? AND pin = ?'
  ).bind(username, pin).first();

  if (!row) return null;

  if (!row.is_active) {
    throw new Error('الحساب موقوف — تواصل مع المسؤول');
  }

  db.prepare('UPDATE employees SET last_login = ? WHERE username = ?')
    .bind(new Date().toISOString(), username)
    .run()
    .catch(() => {});

  return row.display_name;
}

async function checkEmployee(db, username) {
  const row = await db.prepare(
    'SELECT is_active, pin FROM employees WHERE username = ?'
  ).bind(username).first();

  if (!row) return { exists: false, hasPin: false, isActive: false };
  return {
    exists:   true,
    hasPin:   !!row.pin,
    isActive: !!row.is_active,
  };
}

async function registerPin(db, username, pin) {
  const row = await db.prepare(
    'SELECT pin, is_active FROM employees WHERE username = ?'
  ).bind(username).first();

  if (!row)           throw new Error('اسم المستخدم غير موجود');
  if (!row.is_active) throw new Error('الحساب موقوف — تواصل مع المسؤول');
  if (row.pin)        throw new Error('هذا المستخدم مسجّل بالفعل — تواصل مع المسؤول لإعادة الضبط');

  await db.prepare('UPDATE employees SET pin = ? WHERE username = ?')
    .bind(pin, username)
    .run();

  return true;
}

async function writeLog(db, entry) {
  await db.prepare(`
    INSERT INTO logs
      (timestamp, tool, type, employee, order_id, order_name,
       sku, product_title, delta, value_before, value_after, notes, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    entry.timestamp    ?? new Date().toISOString(),
    entry.tool,
    entry.type,
    entry.employee     ?? null,
    entry.orderId      ?? null,
    entry.orderName    ?? null,
    entry.sku          ?? null,
    entry.productTitle ?? null,
    entry.delta        ?? null,
    entry.valueBefore  ?? null,
    entry.valueAfter   ?? null,
    entry.notes        ?? null,
    entry.extra ? JSON.stringify(entry.extra) : null
  ).run();
}

const LOG_EXPORT_MAX = 2000;   // سقف التصدير — بيرجع للواجهة كـ `cap`

function buildLogFilterSQL(select, {
  tool      = null,
  employee  = null, employees = null,
  type      = null, types     = null,
  search    = null,
  dateFrom  = null, dateTo    = null,
} = {}) {
  let sql = `${select} FROM logs WHERE type NOT IN ('login','logout')`;
  const b = [];

  const emps = Array.isArray(employees) && employees.length ? employees : (employee ? [employee] : []);
  const typs = Array.isArray(types)     && types.length     ? types     : (type     ? [type]     : []);

  if (tool) { sql += ' AND tool = ?'; b.push(tool); }
  if (emps.length) {
    sql += ` AND employee IN (${emps.map(() => '?').join(',')})`; b.push(...emps);
  }
  if (typs.length) {
    sql += ` AND type IN (${typs.map(() => '?').join(',')})`; b.push(...typs);
  }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }
  if (dateFrom) { sql += ' AND substr(timestamp, 1, 10) >= ?'; b.push(dateFrom); }
  if (dateTo)   { sql += ' AND substr(timestamp, 1, 10) <= ?'; b.push(dateTo); }

  return { sql, b };
}

async function getLogs(db, { limit = 100, offset = 0, ...filters } = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT *', filters);
  const q = sql + ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  return (await db.prepare(q)
    .bind(...b, Math.min(limit, 100), Math.max(offset, 0)).all()).results;
}

async function getLogsCount(db, filters = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT COUNT(*) as total', filters);
  const row = await db.prepare(sql).bind(...b).first();
  return row?.total ?? 0;
}

async function getLogsExport(db, filters = {}) {
  const { sql, b } = buildLogFilterSQL('SELECT *', filters);
  const q = sql + ' ORDER BY timestamp DESC LIMIT ?';
  return (await db.prepare(q).bind(...b, LOG_EXPORT_MAX).all()).results;
}

function logParamsFrom(url, tool) {
  const csv = (k) => (url.searchParams.get(k) || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const employees = csv('employees'), types = csv('types');
  return {
    tool,
    employees: employees.length ? employees : null,
    employee:  url.searchParams.get('employee') || null,
    types:     types.length ? types : null,
    type:      url.searchParams.get('type')     || null,
    search:    url.searchParams.get('search')   || null,
    dateFrom:  url.searchParams.get('dateFrom') || null,
    dateTo:    url.searchParams.get('dateTo')   || null,
  };
}

// ══════════════════════════════════════════════════════════════
// END SHARED BLOCK
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// §SHOPIFY
// ══════════════════════════════════════════════════════════════

async function getAccessToken(env) {
  const resp = await fetch(
    `https://${env.SHOP_DOMAIN}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        grant_type:    'client_credentials',
      }),
    }
  );
  if (!resp.ok) throw new Error(`OAuth failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error('No access_token in response');
  return data.access_token;
}

// ─── §SHOPIFY::shopifyGQL — العقد الإلزامي، منسوخة كما هي ───
// أي فشل بيترمي. مفيش رد بيعدّي وهو فاشل:
//   ① فشل شبكة  ② HTTP status  ③ رد مش JSON  ④ data.errors  ⑤ data فاضية
async function shopifyGQL(env, token, query, variables = {}, opName = 'shopify') {
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let resp, text;
    try {
      resp = await fetch(`https://${env.SHOP_DOMAIN}/admin/api/2026-01/graphql.json`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body:    JSON.stringify({ query, variables }),
      });
      text = await resp.text();
    } catch (e) {
      lastErr = new Error(`${opName}: فشل الاتصال بشوبيفاي — ${e.message}`);
      if (attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
      throw lastErr;
    }

    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      lastErr = new Error(`${opName}: شوبيفاي ردّت HTTP ${resp.status} — ${text.slice(0, 180)}`);
      if (retriable && attempt < MAX_ATTEMPTS) { await new Promise(r => setTimeout(r, 700 * attempt)); continue; }
      throw lastErr;
    }

    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`${opName}: رد شوبيفاي مش JSON صالح — ${text.slice(0, 180)}`); }

    if (Array.isArray(data.errors) && data.errors.length) {
      const codes = data.errors.map(e => e?.extensions?.code).filter(Boolean);
      lastErr = new Error(
        `${opName}: ${data.errors.map(e => e.message).join(' | ')}` +
        (codes.length ? ` [${codes.join(',')}]` : '')
      );
      if (codes.includes('THROTTLED') && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200 * attempt)); continue;
      }
      throw lastErr;
    }

    if (!data.data) throw new Error(`${opName}: رد شوبيفاي بدون data — ${text.slice(0, 180)}`);
    return data;
  }
  throw lastErr || new Error(`${opName}: فشل غير معروف`);
}

// ══════════════════════════════════════════════════════════════
// §PACK
// ══════════════════════════════════════════════════════════════

// ─── §PACK::queries ───
// v2.0.0: الاتصالات كلها بقت مصفّحة (paginated). أي بقايا قصّ بترجع
// كـ truncated في الرد بدل ما تعدّي بصمت — الـ fingerprint نفسه بيتحسب
// على القايمة، فالقصّ الصامت كان معناه كشف تغيير غلط.
// ⚠️ fulfillableQuantity · ProductVariant.image · Product.featuredImage كلهم
// معلَّمين deprecated في schema شوبيفاي (2026-01) — لسه شغّالين، وfulfillableQuantity
// تحديدًا هو مصدر الحقيقة المعتمد للأداة (راجع CLAUDE.md). أي استبدال ليهم
// (remainingQuantity / media / featuredMedia) تغيير سلوك مش تنضيف — يتعمل لوحده.
const LI_FIELDS = `
  id
  title
  sku
  quantity
  currentQuantity
  fulfillableQuantity
  variant {
    id
    barcode
    image { url }
    product { featuredImage { url } }
    selectedOptions { name value }
  }
`;

const RETURN_FIELDS = `
  id
  status
  exchangeLineItems(first: 50) {
    pageInfo { hasNextPage }
    nodes {
      id
      quantity
      lineItems {
        id
        title
        sku
        quantity
        variant {
          id
          barcode
          image { url }
          product { featuredImage { url } }
          selectedOptions { name value }
        }
      }
    }
  }
`;

const ORDER_CORE_QUERY = `
query GetOrderForPack($id: ID!) {
  order(id: $id) {
    id
    legacyResourceId
    name
    note
    displayFulfillmentStatus
    edited

    # Stage detection metafields
    manual_status: metafield(namespace: "custom", key: "manual_status") { value }
    status_2_r_e:  metafield(namespace: "custom", key: "status_2_r_e")  { value }

    # Already-packed guards
    s1_packed_by: metafield(namespace: "custom", key: "s1_packed_by") { value }
    s2_packed_by: metafield(namespace: "custom", key: "s2_packed_by") { value }

    lineItems(first: 100) {
      pageInfo { hasNextPage endCursor }
      nodes { ${LI_FIELDS} }
    }

    returns(first: 10) {
      pageInfo { hasNextPage endCursor }
      nodes { ${RETURN_FIELDS} }
    }
  }
}
`;

const LINE_ITEMS_PAGE_QUERY = `
query PackLineItemsPage($id: ID!, $after: String!) {
  order(id: $id) {
    lineItems(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { ${LI_FIELDS} }
    }
  }
}
`;

const RETURNS_PAGE_QUERY = `
query PackReturnsPage($id: ID!, $after: String!) {
  order(id: $id) {
    returns(first: 10, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { ${RETURN_FIELDS} }
    }
  }
}
`;

// ─── §PACK::fetchOrderForPack ───
// بترجّع { order, truncated } — و`truncated` بتتحوّل لبانر في الواجهة.
// الحد الأقصى للصفحات موجود عشان أوردر شاذ ما يستهلكش الطلب كله.
const MAX_PAGES = 10;

async function fetchOrderForPack(env, token, gid) {
  const core  = await shopifyGQL(env, token, ORDER_CORE_QUERY, { id: gid }, 'getOrder');
  const order = core?.data?.order;
  if (!order) return { order: null, truncated: false };

  let truncated = false;

  // lineItems
  let liPage = order.lineItems?.pageInfo;
  let pages  = 0;
  while (liPage?.hasNextPage && pages < MAX_PAGES) {
    const next = await shopifyGQL(env, token, LINE_ITEMS_PAGE_QUERY,
      { id: gid, after: liPage.endCursor }, 'getOrderLineItemsPage');
    const conn = next?.data?.order?.lineItems;
    if (!conn) break;
    order.lineItems.nodes.push(...(conn.nodes || []));
    liPage = conn.pageInfo;
    pages++;
  }
  if (liPage?.hasNextPage) truncated = true;

  // returns
  let retPage = order.returns?.pageInfo;
  pages = 0;
  while (retPage?.hasNextPage && pages < MAX_PAGES) {
    const next = await shopifyGQL(env, token, RETURNS_PAGE_QUERY,
      { id: gid, after: retPage.endCursor }, 'getOrderReturnsPage');
    const conn = next?.data?.order?.returns;
    if (!conn) break;
    order.returns.nodes.push(...(conn.nodes || []));
    retPage = conn.pageInfo;
    pages++;
  }
  if (retPage?.hasNextPage) truncated = true;

  // exchangeLineItems متداخلة — مش قابلة للتصفيح من هنا، فالقصّ بيتبلّغ
  for (const ret of (order.returns?.nodes || [])) {
    if (ret.exchangeLineItems?.pageInfo?.hasNextPage) truncated = true;
  }

  return { order, truncated };
}

// ══════════════════════════════════════════════════════════════
// STAGE ANALYSIS
// ══════════════════════════════════════════════════════════════

// ⚠️ القيم منسوخة حرفيًا من `ecommoda-order-lifecycle` §S1/§S2 — الكابيتال
// محمول للمعنى، وأي حرف مختلف بيرجّع صفر مطابقات من غير أي error.
// v2.0.0: 'Printed' اتشالت — مش موجودة في أي من الـ choice lists.
const S1_VALUES = ['Confirmed', 'Confirmed + Edit', 'Ready'];
const S2_VALUES = ['Confirmed + RETURN', 'Confirmed + EXCHANGE', 'Ready'];
const ACTIVE_RETURN_STATUSES = ['OPEN', 'IN_PROGRESS', 'REQUESTED'];

// ─── §PACK::analyzeStage ───
function analyzeStage(order) {
  const manualVal = order.manual_status?.value || null;
  const s2reVal   = order.status_2_r_e?.value  || null;

  const activeReturns = (order.returns?.nodes || []).filter(r =>
    ACTIVE_RETURN_STATUSES.includes(r.status)
  );
  const hasActiveReturn = activeReturns.length > 0;
  const s1Signal        = !!(manualVal && S1_VALUES.includes(manualVal));
  const s2MetaSignal    = !!(s2reVal   && S2_VALUES.includes(s2reVal));
  const s2Signal        = s2MetaSignal || hasActiveReturn;

  const signals = {
    hasActiveReturn,
    activeReturnCount: activeReturns.length,
    manualStatus:      manualVal,
    status2re:         s2reVal,
    s1Signal,
    s2MetaSignal,
    s2Signal,
  };

  if (s2Signal && !s1Signal) {
    return { stage: 'S2', conflict: false, unclear: false, conflictType: null, signals };
  }

  if (s1Signal && !s2Signal) {
    return { stage: 'S1', conflict: false, unclear: false, conflictType: null, signals };
  }

  if (s1Signal && s2Signal) {
    let conflictType;
    if (hasActiveReturn && s2MetaSignal) {
      conflictType = 'يوجد return نشط و status_2_r_e محدد، ولكن manual_status لا يزال محدداً أيضاً — يرجى مسح manual_status';
    } else if (hasActiveReturn) {
      conflictType = 'يوجد return نشط (S2) ولكن manual_status لا يزال محدداً — يرجى مسح manual_status أو إضافة status_2_r_e';
    } else {
      conflictType = 'كلا الميتافيلدين محددان: manual_status=' + manualVal + ' وstatus_2_r_e=' + s2reVal + ' — يرجى مسح الميتافيلد غير الصحيح';
    }
    return { stage: 'S2', conflict: true, unclear: false, conflictType, signals };
  }

  return {
    stage:        'S1',
    conflict:     false,
    unclear:      true,
    conflictType: null,
    signals,
  };
}

// ─── §PACK::classifyOrderItems ───
// fulfillableQuantity هو مصدر الحقيقة الوحيد لتصنيف المنتجات (من v1.5.0).
// متضفش فلترة يدوية على الـ refunds تاني.
// v2.0.0: قطعة الاستبدال اللي ليها نظير في lineItems بتاخد كميتها من
// fulfillableQuantity — قبل كده الكمية كانت بتختلف حسب أنهي حلقة سبقت،
// فالـ fingerprint كان بيتغيّر من غير أي تغيير حقيقي في الأوردر.
function classifyOrderItems(order) {
  const lineItems = order.lineItems?.nodes || [];

  const fulfillableById = new Map();
  for (const li of lineItems) fulfillableById.set(li.id, li.fulfillableQuantity);

  const mapItem = (li, quantity) => ({
    id:       li.id,
    title:    li.title,
    sku:      li.sku || '',
    barcode:  li.variant?.barcode || '',
    quantity,
    image:    li.variant?.image?.url || li.variant?.product?.featuredImage?.url || null,
    options:  li.variant?.selectedOptions || [],
  });

  const activeItems = [];
  for (const li of lineItems) {
    if (li.fulfillableQuantity > 0) activeItems.push(mapItem(li, li.fulfillableQuantity));
  }

  const exchangeIds   = new Set();
  const exchangeItems = [];

  for (const ret of (order.returns?.nodes || [])) {
    for (const ex of (ret.exchangeLineItems?.nodes || [])) {
      for (const li of (ex.lineItems || [])) {
        if (exchangeIds.has(li.id)) continue;
        exchangeIds.add(li.id);
        const qty = fulfillableById.has(li.id) ? fulfillableById.get(li.id) : li.quantity;
        if (qty > 0) exchangeItems.push(mapItem(li, qty));
      }
    }
  }

  for (const li of lineItems) {
    if (li.fulfillableQuantity > 0 && !exchangeIds.has(li.id)) {
      exchangeIds.add(li.id);
      exchangeItems.push(mapItem(li, li.fulfillableQuantity));
    }
  }

  return { activeItems, exchangeItems };
}

// ─── §PACK::buildFingerprint ───
// ⚠️ الصيغة دي مرتبطة بـ itemSummary في complete_pack وبـ
// parseSavedItemsString تحت — الملفات الثلاثة بيتغيّروا مع بعض.
function buildFingerprint(items) {
  return JSON.stringify(
    (items || [])
      .map(i => `${(i.sku || i.title || '').trim().toLowerCase()}:${i.quantity || 0}`)
      .sort()
  );
}

// ─── §PACK::parseSavedItemsString ───
// fallback للصفوف القديمة بس. من v2.0.0 الـ fingerprint نفسه متخزّن في
// extra.fingerprint، فالتحليل النصي ماعادش المصدر الأساسي — وده مهم لأن
// أي منتج من غير SKU بيتخزّن بالـ title، وأي title فيه فاصلة بيكسر التقسيم.
function parseSavedItemsString(storedStr) {
  if (!storedStr) return null;
  try {
    const parts = storedStr.split(',').map(p => p.trim()).filter(Boolean);
    const items = [];
    for (const part of parts) {
      const match = part.match(/^(.+)\s×(\d+)$/);
      if (!match) return null;          // تقسيم مشكوك فيه → ماننتجش fingerprint كاذب
      items.push({ sku: match[1].trim(), quantity: parseInt(match[2], 10) });
    }
    return items.length ? items : null;
  } catch {
    return null;
  }
}

// ─── §PACK::readStoredFingerprint ───
// بترجّع { fingerprint, source } — أو fingerprint = null لو معرفناش،
// و"معرفناش" معناها changeDetected = true (الافتراضي الآمن).
function readStoredFingerprint(lastLog) {
  if (!lastLog) return { fingerprint: null, source: 'none' };

  if (lastLog.extra) {
    try {
      const extra = JSON.parse(lastLog.extra);
      if (extra && typeof extra.fingerprint === 'string' && extra.fingerprint) {
        return { fingerprint: extra.fingerprint, source: 'extra' };
      }
    } catch { /* extra مش JSON صالح — بنكمّل على الـ fallback */ }
  }

  const parsed = parseSavedItemsString(lastLog.items);
  if (parsed && parsed.length) {
    return { fingerprint: buildFingerprint(parsed), source: 'items_string' };
  }

  return { fingerprint: null, source: 'unreadable' };
}

// ══════════════════════════════════════════════════════════════
// §HANDLER
// ══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {

    // OPTIONS preflight — always first
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: getCORS(request) });

    // ── R6: حارس WORKER_SECRET الغايب — **قبل** أي مقارنة ─────────
    // من غير السطور دي: لو السيكرت اتنسي أو النسخة اتنشرت بدون Promote،
    // يبقى env.WORKER_SECRET === undefined، والقالب بيتقيّم للنص الحرفي
    // "Bearer undefined" — فأي طلب بالرأس ده **بيعدّي المصادقة**.
    // (مراجعة 03-09-2026 · R6 · نفس حارس logistics-control-center-worker)
    if (!env.WORKER_SECRET) {
      return json({
        error: 'WORKER_SECRET غير مضبوط على الـ Worker — أضفه من Settings → Variables ثم اعمل Promote',
        step:  'env',
      }, 500, request);
    }

    // WORKER_SECRET check — always second
    // ⚠️ `json()` مش `new Response` — `getCORS` مابيرجّعش 'Content-Type'.
    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`)
      return json({ error: 'Unauthorized' }, 401, request);

    const url    = new URL(request.url);
    const action = url.searchParams.get('action') || '';

    try {

      // ─── §AUTH ────────────────────────────────────────────

      if (action === 'check_employee') {
        const username = url.searchParams.get('username');
        if (!username) return json({ ok: false, error: 'username مطلوب' }, 400, request);
        const result = await checkEmployee(env.DB, username);
        return json({ ok: true, ...result }, 200, request);
      }

      if (action === 'register_pin') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        const { username, pin } = await request.json().catch(() => ({}));
        if (!username || !pin) return json({ ok: false, error: 'username و pin مطلوبان' }, 400, request);
        await registerPin(env.DB, username, pin);
        return json({ ok: true }, 200, request);
      }

      if (action === 'verify_employee') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        const { username, pin } = await request.json().catch(() => ({}));
        if (!username || !pin) return json({ ok: false, error: 'username و pin مطلوبان' }, 400, request);

        const displayName = await verifyEmployee(env.DB, username, pin);
        if (!displayName) return json({ ok: false, error: 'PIN خطأ أو المستخدم غير موجود' }, 401, request);

        // الدخول نفسه نجح فعلاً — فشل D1 بعد كده logged:false مش 500
        let logged = true;
        try {
          await writeLog(env.DB, {
            tool:     TOOL_NAME,
            type:     'login',
            employee: username,
            notes:    `دخول: ${displayName}`,
          });
        } catch (e) {
          logged = false;
        }
        return json({ ok: true, displayName, logged }, 200, request);
      }

      if (action === 'log_logout') {
        const username = url.searchParams.get('username');
        let logged = true;
        if (username) {
          try {
            await writeLog(env.DB, {
              tool:     TOOL_NAME,
              type:     'logout',
              employee: username,
              notes:    `خروج: ${username.replace(/_/g, ' ')}`,
            });
          } catch (e) {
            logged = false;
          }
        }
        return json({ ok: true, logged }, 200, request);
      }

      if (action === 'get_employees') {
        const { results } = await env.DB.prepare(
          'SELECT username, display_name FROM employees WHERE is_active = 1 ORDER BY display_name'
        ).all();
        return json({ ok: true, employees: results }, 200, request);
      }

      // ─── §DIAG ────────────────────────────────────────────
      // فحص ذاتي بدون أي كتابة. ⚠️ ممنوع يرجّع قيمة أي سر — الأسماء
      // والأطوال بس (الطول بيكشف المسافة المخفية في القيمة).

      if (action === 'get_config') {
        return json({ ok: true, version: WORKER_VERSION, tool: TOOL_NAME }, 200, request);
      }

      if (action === 'diag') {
        const checks = [];
        const origin = request.headers.get('Origin') || '';

        // ① متغيّرات البيئة — الأسماء والأطوال فقط
        const envKeys = Object.keys(env)
          .filter(k => typeof env[k] === 'string')
          .sort()
          .map(k => ({ name: k, length: String(env[k]).length }));
        const required = ['SHOP_DOMAIN', 'CLIENT_ID', 'CLIENT_SECRET', 'WORKER_SECRET'];
        const missing  = required.filter(k => !env[k] || !String(env[k]).trim());
        checks.push({
          key:   'env',
          ok:    missing.length === 0,
          label: 'متغيّرات الـ Worker',
          detail: missing.length
            ? `ناقص: ${missing.join('، ')} — ضِفها من Settings → Variables ثم Promote`
            : envKeys.map(k => `${k.name} (${k.length})`).join(' · '),
        });

        // ② الـ Origin
        checks.push({
          key:   'origin',
          ok:    !origin || ALLOWED_ORIGINS.includes(origin),
          label: 'الـ Origin',
          detail: origin
            ? (ALLOWED_ORIGINS.includes(origin) ? `${origin} — مسموح` : `${origin} — غير مسموح، بياخد ${ALLOWED_ORIGINS[0]}`)
            : 'بدون Origin (نداء مباشر)',
        });

        // ③ D1
        try {
          const row = await env.DB.prepare(
            'SELECT COUNT(*) AS n FROM employees WHERE is_active = 1'
          ).first();
          checks.push({ key: 'd1', ok: true, label: 'قاعدة D1 (binding: DB)', detail: `متصلة — ${row?.n ?? 0} موظف نشط` });
        } catch (e) {
          checks.push({ key: 'd1', ok: false, label: 'قاعدة D1 (binding: DB)', detail: e.message });
        }

        // ④ صلاحيات تطبيق شوبيفاي
        try {
          assertEnv(env, 'shopify');
          const token = await getAccessToken(env);
          const data  = await shopifyGQL(env, token,
            `query DiagScopes { currentAppInstallation { accessScopes { handle } } }`,
            {}, 'diagScopes');
          const scopes = (data?.data?.currentAppInstallation?.accessScopes || []).map(s => s.handle);
          // الصلاحيات دي مستخرجة من التحقق الفعلي للاستعلامات على الـ schema
          const needed = ['read_orders', 'write_orders', 'read_returns', 'read_products'];
          const lack   = needed.filter(s => !scopes.includes(s));
          checks.push({
            key:   'shopify',
            ok:    lack.length === 0,
            label: 'صلاحيات تطبيق شوبيفاي',
            detail: lack.length ? `ناقص: ${lack.join('، ')} — الموجود: ${scopes.join('، ')}` : scopes.join('، '),
          });
        } catch (e) {
          checks.push({ key: 'shopify', ok: false, label: 'صلاحيات تطبيق شوبيفاي', detail: e.message });
        }

        return json({ ok: checks.every(c => c.ok), version: WORKER_VERSION, tool: TOOL_NAME, checks }, 200, request);
      }

      // ─── §PACK ────────────────────────────────────────────

      // ── get_order ─────────────────────────────────────────
      if (action === 'get_order') {
        assertEnv(env, 'shopify');
        const token = await getAccessToken(env);

        let orderId = url.searchParams.get('id')   || null;
        let name    = url.searchParams.get('name') || null;

        if (!orderId && name) {
          const normalized = name.replace(/^#/, '');
          const searchRes  = await shopifyGQL(env, token,
            `query FindOrder($q: String!) {
               orders(first: 1, query: $q) {
                 nodes { id legacyResourceId name }
               }
             }`,
            { q: `name:#${normalized}` }, 'findOrder'
          );

          const found = searchRes?.data?.orders?.nodes?.[0];
          if (!found) return json({ ok: false, error: `الأوردر #${normalized} غير موجود` }, 404, request);
          orderId = found.legacyResourceId || found.id.replace('gid://shopify/Order/', '');
        }

        if (!orderId) return json({ ok: false, error: 'id أو name مطلوب' }, 400, request);

        const gid = `gid://shopify/Order/${orderId}`;
        const { order, truncated } = await fetchOrderForPack(env, token, gid);
        if (!order) return json({ ok: false, error: 'الأوردر غير موجود' }, 404, request);

        const numericId = order.legacyResourceId || String(orderId);

        // ── Stage analysis
        const stageAnalysis = analyzeStage(order);
        const { stage } = stageAnalysis;

        const orderPayload = {
          id:                numericId,
          orderId:           numericId,   // المفتاح الموحّد للهايبر لينك في الواجهة
          gid:               order.id,
          name:              order.name,
          note:              order.note || '',
          fulfillmentStatus: order.displayFulfillmentStatus,
        };

        // ── Already-packed guard
        const s1PackedBy = order.s1_packed_by?.value || null;
        const s2PackedBy = order.s2_packed_by?.value || null;
        const relevantPackedBy = stage === 'S1' ? s1PackedBy : s2PackedBy;

        const { activeItems, exchangeItems } = classifyOrderItems(order);
        const items = stage === 'S1' ? activeItems : exchangeItems;

        if (relevantPackedBy) {
          const currentFingerprint = buildFingerprint(items);

          const lastLog = await env.DB.prepare(
            `SELECT items, extra, timestamp FROM logs
             WHERE tool = ? AND type = 'packed' AND order_name = ?
             ORDER BY timestamp DESC LIMIT 1`
          ).bind(TOOL_NAME, order.name).first();

          const { fingerprint: storedFingerprint, source: fingerprintSource } = readStoredFingerprint(lastLog);

          // "معرفناش" = تغيير مكتشف (الافتراضي الآمن)
          const changeDetected = storedFingerprint === null
            ? true
            : currentFingerprint !== storedFingerprint;

          const packingDateTime = lastLog?.timestamp || null;
          const storedItems     = lastLog?.items     || null;

          if (!changeDetected) {
            return json({
              ok:             false,
              alreadyPacked:  true,
              changeDetected: false,
              truncated,
              stage,
              packedBy:       relevantPackedBy,
              storedItems,
              packingDateTime,
              fingerprintSource,
              order: orderPayload,
              error: `هذا الأوردر تم تغليفه مسبقاً (${stage}) بواسطة ${relevantPackedBy}`,
            }, 200, request);
          }

          return json({
            ok:             false,
            alreadyPacked:  true,
            changeDetected: true,
            truncated,
            stage,
            packedBy:       relevantPackedBy,
            storedItems,
            packingDateTime,
            fingerprintSource,
            stageAnalysis,
            order: orderPayload,
            items: items.length > 0 ? items : activeItems,
          }, 200, request);
        }

        if (items.length === 0) {
          return json({
            ok:    false,
            truncated,
            error: `لا توجد منتجات ${stage === 'S1' ? 'نشطة' : 'استبدال'} في هذا الأوردر`,
          }, 200, request);
        }

        return json({
          ok:        true,
          truncated,
          stageAnalysis,
          stage,
          order:     orderPayload,
          items,
        }, 200, request);
      }

      // ── complete_pack ──────────────────────────────────────
      if (action === 'complete_pack') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);
        assertEnv(env, 'shopify');

        const body = await request.json().catch(() => ({}));
        const { orderId, orderName, stage, employee, packedBy, items, editReason } = body;

        if (!orderId || !stage || !employee || !packedBy) {
          return json({ ok: false, error: 'بيانات ناقصة: orderId, stage, employee, packedBy مطلوبة' }, 400, request);
        }

        if (!['S1', 'S2'].includes(stage)) {
          return json({ ok: false, error: 'stage يجب أن يكون S1 أو S2' }, 400, request);
        }

        const token = await getAccessToken(env);

        const packedByKey    = stage === 'S1' ? 's1_packed_by'         : 's2_packed_by';
        const packingDateKey = stage === 'S1' ? 's1_packing_date_time' : 's2_packing_date_time';
        const tag            = stage === 'S1' ? 'S1=Packed'            : 'S2=Packed';
        const gid            = `gid://shopify/Order/${orderId}`;
        const nowISO         = new Date().toISOString();

        // الأكشنز بتتملي أول بأول — مش بترجع من الدالة في الآخر (Step 5A ⑤)
        const actions  = [];
        const warnings = [];

        // ── 1. Write metafields — التلات فحوصات ──
        const metaData = await shopifyGQL(env, token,
          `mutation SetPackMetafields($metafields: [MetafieldsSetInput!]!) {
             metafieldsSet(metafields: $metafields) {
               metafields { key value }
               userErrors  { field message }
             }
           }`,
          {
            metafields: [
              {
                ownerId:   gid,
                namespace: 'custom',
                key:       packedByKey,
                value:     packedBy,
                type:      'single_line_text_field',
              },
              {
                ownerId:   gid,
                namespace: 'custom',
                key:       packingDateKey,
                value:     nowISO,
                type:      'date_time',
              },
            ],
          }, 'metafieldsSet'
        );

        const metaResult = metaData?.data?.metafieldsSet;
        const metaErrors = metaResult?.userErrors || [];
        if (metaErrors.length) {
          return json({ ok: false, status: 'error', actions,
            error: `Metafields: ${metaErrors.map(e => e.message).join(' | ')}` }, 400, request);
        }
        const writtenKeys = (metaResult?.metafields || []).map(m => m.key);
        if (!writtenKeys.includes(packedByKey) || !writtenKeys.includes(packingDateKey)) {
          return json({ ok: false, status: 'error', actions,
            error: 'metafieldsSet: شوبيفاي ما أكدتش كتابة الميتافيلدين' }, 400, request);
        }
        actions.push(`كتابة ${packedByKey} و${packingDateKey}`);

        // ── 2. Add tag — التلات فحوصات ──
        const tagData = await shopifyGQL(env, token,
          `mutation AddTag($id: ID!, $tags: [String!]!) {
             tagsAdd(id: $id, tags: $tags) {
               node { id ... on Order { tags } }
               userErrors { field message }
             }
           }`,
          { id: gid, tags: [tag] }, 'tagsAdd'
        );

        const tagResult = tagData?.data?.tagsAdd;
        const tagErrors = tagResult?.userErrors || [];
        if (tagErrors.length) {
          return json({ ok: false, status: 'error', actions,
            error: `Tag: ${tagErrors.map(e => e.message).join(' | ')}` }, 400, request);
        }
        const finalTags = tagResult?.node?.tags || null;
        if (!Array.isArray(finalTags)) {
          warnings.push(`الـ tag ${tag} اتبعت لشوبيفاي بس ما رجعتش قائمة الـ tags للتأكيد`);
        } else if (!finalTags.includes(tag)) {
          warnings.push(`الـ tag ${tag} مش موجود في الأوردر بعد الكتابة — راجع الأوردر يدويًا`);
        } else {
          actions.push(`إضافة tag ${tag}`);
        }

        // ── 3. Build items summary + fingerprint ──
        // ⚠️ itemSummary مرتبط بـ parseSavedItemsString في get_order.
        // الـ fingerprint اتخزّن مستقل في extra عشان الكشف ما يبقاش
        // معتمد على تحليل نصي هشّ.
        const itemCount   = (items || []).reduce((s, i) => s + (i.quantity || 1), 0);
        const itemSummary = (items || []).map(i => `${i.sku || i.title} ×${i.quantity}`).join(', ');
        const fingerprint = buildFingerprint(items || []);
        const editNote    = editReason ? ` (سبب الإعادة: ${editReason})` : '';
        const result      = warnings.length ? 'warning' : 'success';

        // ── 4. Write D1 log — الفشل بيبان، مش بيسقّط عملية تمّت فعلاً ──
        let logged = true, logError = null;
        try {
          await writeLog(env.DB, {
            tool:      TOOL_NAME,
            type:      'packed',
            employee,
            orderId,
            orderName,
            notes:     `${stage} — ${itemCount} قطعة — ${packedBy}${editNote}`,
            extra:     { stage, packedBy, packingDate: nowISO, itemCount,
                         items: itemSummary, fingerprint, editReason: editReason || null,
                         result, actions, warnings },
            timestamp: nowISO,
          });
        } catch (e) {
          logged   = false;
          logError = e.message;
          warnings.push('العملية تمت على شوبيفاي بس ما اتسجلتش في D1');
        }

        // ── 5. Update D1 columns — بيتحقق من عدد الصفوف المتأثرة ──
        // من غير الفحص ده الأعمدة الأربعة ممكن تفضل NULL من غير أي خطأ.
        let columnsWritten = logged ? null : false;
        if (logged) {
          try {
            const upd = await env.DB.prepare(
              `UPDATE logs
               SET stage = ?, item_count = ?, items = ?, edit_reason = ?
               WHERE tool = ? AND type = 'packed' AND order_name = ? AND timestamp = ?`
            ).bind(
              stage, itemCount, itemSummary, editReason || null,
              TOOL_NAME, orderName, nowISO
            ).run();

            columnsWritten = (upd?.meta?.changes ?? 0) > 0;
            if (!columnsWritten) {
              warnings.push('أعمدة السجل الإضافية (stage · item_count · items) ما اتكتبتش — العرض في تاب السجل هيبان ناقص');
            }
          } catch (e) {
            columnsWritten = false;
            warnings.push(`أعمدة السجل الإضافية ما اتكتبتش: ${e.message}`);
          }
        }

        const status = warnings.length ? 'warning' : 'success';

        return json({
          ok: true, status, actions, warnings,
          logged, logError, columnsWritten,
          stage, tag, packedBy, packingDate: nowISO, itemCount,
        }, 200, request);
      }

      // ─── §LOG-ENDPOINTS ───────────────────────────────────

      if (action === 'get_logs') {
        const p       = logParamsFrom(url, TOOL_NAME);
        const limit   = Math.min(parseInt(url.searchParams.get('limit')  || '100'), 100);
        const offset  = Math.max(parseInt(url.searchParams.get('offset') || '0'),    0);
        const entries = await getLogs(env.DB, { ...p, limit, offset });
        return json({ ok: true, entries }, 200, request);
      }

      if (action === 'get_logs_count') {
        const total = await getLogsCount(env.DB, logParamsFrom(url, TOOL_NAME));
        return json({ ok: true, total }, 200, request);
      }

      if (action === 'get_logs_export') {
        const p = logParamsFrom(url, TOOL_NAME);
        const [entries, total] = await Promise.all([
          getLogsExport(env.DB, p),
          getLogsCount(env.DB, p),
        ]);
        return json({ ok: true, entries, cap: LOG_EXPORT_MAX, total,
                      truncated: total > LOG_EXPORT_MAX }, 200, request);
      }

      return json({ error: `action غير معروف: ${action}` }, 400, request);

    } catch (err) {
      console.error(err);
      return json({ ok: false, status: 'error', error: err.message }, 500, request);
    }
  }
};
