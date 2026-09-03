// ══════════════════════════════════════════════════════════════
// §CONSTANTS
// Pack Checker Worker — EcomModa  v1.5.0
// Tool: pack_checker | Endpoints: get_order, complete_pack
//
// CHANGELOG v1.5.0:
//   - BUGFIX: حذف refundedIds بالكامل من classifyOrderItems
//     (كان بيستبعد line item كامل لمجرد وجود أي refund عليه،
//      حتى لو فيه كمية لسه نشطة فعليًا بعد partial refund
//      → أدى لظهور "لا توجد منتجات نشطة" رغم وجود منتج قابل للشحن فعليًا)
//   - تنظيف: حذف حقل refunds{refundLineItems{...}} من GET_ORDER_QUERY
//     (كان بيتجاب من Shopify من غير أي استخدام بعد حذف refundedIds)
//   - الاعتماد الآن بالكامل على fulfillableQuantity من Shopify وحده
//     كمصدر الحقيقة الوحيد لتصنيف active/exchange items
//
// CHANGELOG v1.4.0:
//   - BUGFIX: إضافة storedItems إلى response الـ !changeDetected
//     (كان غائباً → الجدول يظهر "لا توجد بيانات منتجات" خطأً)
//   - BUGFIX: إضافة packingDateTime (lastLog.timestamp) إلى كلا responses الـ alreadyPacked
//     (كان غائباً → وقت التغليف السابق يظهر "غير محدد" خطأً)
//
// CHANGELOG v1.3.0:
//   - BUGFIX: حذف lineItemsEditCount من الـ GraphQL query
//   - استبدال منطق كشف التغيير: بدل editCount → items fingerprint (SKU:qty)
//   - complete_pack: لا يُرسل/يُخزّن editCount
//   - get_order: changeDetected يقارن fingerprint حالي بالمخزون في D1
// ══════════════════════════════════════════════════════════════

const TOOL_NAME = 'pack_checker';

// ══════════════════════════════════════════════════════════════
// §CORS
// ══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://ecommoda24.github.io',
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

async function getLogs(db, {
  tool     = null,
  employee = null,
  type     = null,
  search   = null,
  limit    = 100,
  offset   = 0,
} = {}) {
  let sql = "SELECT * FROM logs WHERE type NOT IN ('login','logout')";
  const b = [];

  if (tool)     { sql += ' AND tool = ?';     b.push(tool); }
  if (employee) { sql += ' AND employee = ?'; b.push(employee); }
  if (type)     { sql += ' AND type = ?';     b.push(type); }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  b.push(Math.min(limit, 100), offset);

  return (await db.prepare(sql).bind(...b).all()).results;
}

async function getLogsCount(db, {
  tool     = null,
  employee = null,
  search   = null,
} = {}) {
  let sql = "SELECT COUNT(*) as total FROM logs WHERE type NOT IN ('login','logout')";
  const b = [];

  if (tool)     { sql += ' AND tool = ?';     b.push(tool); }
  if (employee) { sql += ' AND employee = ?'; b.push(employee); }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }

  const row = await db.prepare(sql).bind(...b).first();
  return row?.total ?? 0;
}

async function getLogsExport(db, {
  tool     = null,
  employee = null,
  search   = null,
} = {}) {
  let sql = "SELECT * FROM logs WHERE type NOT IN ('login','logout')";
  const b = [];

  if (tool)     { sql += ' AND tool = ?';     b.push(tool); }
  if (employee) { sql += ' AND employee = ?'; b.push(employee); }
  if (search) {
    sql += ' AND (order_name LIKE ? OR notes LIKE ?)';
    b.push(`%${search}%`, `%${search}%`);
  }

  sql += ' ORDER BY timestamp DESC LIMIT 2000';

  return (await db.prepare(sql).bind(...b).all()).results;
}

// ══════════════════════════════════════════════════════════════
// END SHARED BLOCK
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// §SHOPIFY
// ══════════════════════════════════════════════════════════════

async function getAccessToken(env) {
  const res = await fetch(
    `https://${env.SHOP_DOMAIN}/admin/oauth/access_token`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `grant_type=client_credentials&client_id=${env.CLIENT_ID}&client_secret=${env.CLIENT_SECRET}`,
    }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error('Shopify OAuth failed');
  return data.access_token;
}

async function shopifyGQL(env, token, query, variables = {}) {
  const res = await fetch(
    `https://${env.SHOP_DOMAIN}/admin/api/2026-01/graphql.json`,
    {
      method:  'POST',
      headers: {
        'Content-Type':           'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  return res.json();
}

// ── GraphQL Query ───────────────────────────────────────────────
// v1.5.0: تم حذف بلوك refunds{refundLineItems{...}} — مش مستخدم بعد
// حذف refundedIds من classifyOrderItems (راجع CHANGELOG أعلى الملف)
const GET_ORDER_QUERY = `
query GetOrderForPack($id: ID!) {
  order(id: $id) {
    id
    name
    note
    displayFulfillmentStatus
    edited

    # Stage detection metafields
    manual_status: metafield(namespace: "custom", key: "manual_status")   { value }
    status_2_r_e:  metafield(namespace: "custom", key: "status_2_r_e")   { value }

    # Already-packed guards
    s1_packed_by: metafield(namespace: "custom", key: "s1_packed_by") { value }
    s2_packed_by: metafield(namespace: "custom", key: "s2_packed_by") { value }

    # Active + Removed items
    lineItems(first: 50) {
      nodes {
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
      }
    }

    # Returns — for both exchange items AND return-status detection
    returns(first: 3) {
      nodes {
        id
        status
        exchangeLineItems(first: 10) {
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
      }
    }
  }
}
`;

// ══════════════════════════════════════════════════════════════
// STAGE ANALYSIS
// ══════════════════════════════════════════════════════════════

const S1_VALUES = ['Confirmed', 'Confirmed + Edit', 'Printed', 'Ready'];
const S2_VALUES = ['Confirmed + RETURN', 'Confirmed + EXCHANGE', 'Printed', 'Ready'];
const ACTIVE_RETURN_STATUSES = ['OPEN', 'IN_PROGRESS', 'REQUESTED'];

function analyzeStage(order) {
  const manualVal = order.manual_status?.value || null;
  const s2reVal   = order.status_2_r_e?.value  || null;

  const activeReturns = (order.returns?.nodes || []).filter(r =>
    ACTIVE_RETURN_STATUSES.includes(r.status)
  );
  const hasActiveReturn  = activeReturns.length > 0;
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

// ── Item Classification ──────────────────────────────────────────
// v1.5.0: refundedIds محذوفة بالكامل.
// fulfillableQuantity من Shopify يعكس بالفعل أي كمية اتعملها refund
// أو edit — استبعاد يدوي إضافي بناءً على وجود refund كان بيسبب
// استبعاد قطع لسه نشطة فعليًا (partial refund على line item عنده
// كمية متبقية قابلة للشحن). راجع CHANGELOG v1.5.0 أعلى الملف.

function classifyOrderItems(order) {

  const activeItems = [];
  for (const li of (order.lineItems?.nodes || [])) {
    if (li.fulfillableQuantity > 0) {
      activeItems.push({
        id:       li.id,
        title:    li.title,
        sku:      li.sku || '',
        barcode:  li.variant?.barcode || '',
        quantity: li.fulfillableQuantity,
        image: li.variant?.image?.url || li.variant?.product?.featuredImage?.url || null,
        options:  li.variant?.selectedOptions || [],
      });
    }
  }

  const exchangeIds   = new Set();
  const exchangeItems = [];

  for (const ret of (order.returns?.nodes || [])) {
    for (const ex of (ret.exchangeLineItems?.nodes || [])) {
      for (const li of (ex.lineItems || [])) {
        if (exchangeIds.has(li.id)) continue;
        exchangeIds.add(li.id);
        exchangeItems.push({
          id:       li.id,
          title:    li.title,
          sku:      li.sku || '',
          barcode:  li.variant?.barcode || '',
          quantity: li.quantity,
          image: li.variant?.image?.url || li.variant?.product?.featuredImage?.url || null,
          options:  li.variant?.selectedOptions || [],
        });
      }
    }
  }

  for (const li of (order.lineItems?.nodes || [])) {
    if (li.fulfillableQuantity > 0 && !exchangeIds.has(li.id)) {
      exchangeIds.add(li.id);
      exchangeItems.push({
        id:       li.id,
        title:    li.title,
        sku:      li.sku || '',
        barcode:  li.variant?.barcode || '',
        quantity: li.fulfillableQuantity,
        image: li.variant?.image?.url || li.variant?.product?.featuredImage?.url || null,
        options:  li.variant?.selectedOptions || [],
      });
    }
  }

  return { activeItems, exchangeItems };
}

// ── Items Fingerprint ────────────────────────────────────────────
function buildFingerprint(items) {
  return JSON.stringify(
    (items || [])
      .map(i => `${(i.sku || i.title || '').trim().toLowerCase()}:${i.quantity || 0}`)
      .sort()
  );
}

function parseSavedItemsString(storedStr) {
  if (!storedStr) return null;
  try {
    return storedStr.split(',').map(part => {
      const match = part.trim().match(/^(.+)\s×(\d+)$/);
      if (!match) return null;
      return { sku: match[1].trim(), quantity: parseInt(match[2], 10) };
    }).filter(Boolean);
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// §HANDLER
// ══════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: getCORS(request) });

    const auth = request.headers.get('Authorization');
    if (!auth || auth !== `Bearer ${env.WORKER_SECRET}`)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: getCORS(request),
      });

    const url    = new URL(request.url);
    const action = url.searchParams.get('action');

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

        await writeLog(env.DB, {
          tool:     TOOL_NAME,
          type:     'login',
          employee: username,
          notes:    `دخول: ${displayName}`,
        });
        return json({ ok: true, displayName }, 200, request);
      }

      if (action === 'log_logout') {
        const username = url.searchParams.get('username');
        if (username) {
          await writeLog(env.DB, {
            tool:     TOOL_NAME,
            type:     'logout',
            employee: username,
            notes:    `خروج: ${username.replace(/_/g, ' ')}`,
          });
        }
        return json({ ok: true }, 200, request);
      }

      if (action === 'get_employees') {
        const { results } = await env.DB.prepare(
          'SELECT username, display_name FROM employees WHERE is_active = 1 ORDER BY display_name'
        ).all();
        return json({ ok: true, employees: results }, 200, request);
      }

      // ─── §PACK ────────────────────────────────────────────

      // ── get_order ─────────────────────────────────────────
      if (action === 'get_order') {
        const token = await getAccessToken(env);

        let orderId = url.searchParams.get('id')   || null;
        let name    = url.searchParams.get('name') || null;

        if (!orderId && name) {
          const normalized = name.replace(/^#/, '');
          const searchRes  = await shopifyGQL(env, token,
            `query FindOrder($q: String!) {
               orders(first: 1, query: $q) {
                 nodes { id name }
               }
             }`,
            { q: `name:#${normalized}` }
          );

          if (searchRes.errors?.length) {
            return json({ ok: false, error: searchRes.errors[0].message }, 400, request);
          }

          const found = searchRes?.data?.orders?.nodes?.[0];
          if (!found) return json({ ok: false, error: `الأوردر #${normalized} غير موجود` }, 404, request);
          orderId = found.id.replace('gid://shopify/Order/', '');
        }

        if (!orderId) return json({ ok: false, error: 'id أو name مطلوب' }, 400, request);

        const gid    = `gid://shopify/Order/${orderId}`;
        const result = await shopifyGQL(env, token, GET_ORDER_QUERY, { id: gid });

        if (result.errors?.length) {
          return json({ ok: false, error: result.errors[0].message }, 400, request);
        }

        const order = result?.data?.order;
        if (!order) return json({ ok: false, error: 'الأوردر غير موجود' }, 404, request);

        // ── Stage analysis
        const stageAnalysis = analyzeStage(order);
        const { stage } = stageAnalysis;

        // ── Already-packed guard
        const s1PackedBy = order.s1_packed_by?.value || null;
        const s2PackedBy = order.s2_packed_by?.value || null;
        const relevantPackedBy = stage === 'S1' ? s1PackedBy : s2PackedBy;

        if (relevantPackedBy) {
          // Classify current items (needed for fingerprint comparison)
          const { activeItems, exchangeItems } = classifyOrderItems(order);
          const currentItems = stage === 'S1' ? activeItems : exchangeItems;

          // Build current fingerprint
          const currentFingerprint = buildFingerprint(currentItems);

          // Fetch last packed log for this order
          const lastLog = await env.DB.prepare(
            `SELECT items, timestamp FROM logs
             WHERE tool = ? AND type = 'packed' AND order_name = ?
             ORDER BY timestamp DESC LIMIT 1`
          ).bind(TOOL_NAME, order.name).first();

          // Compare fingerprints
          let changeDetected = true;
          if (lastLog?.items) {
            const parsedStored = parseSavedItemsString(lastLog.items);
            if (parsedStored && parsedStored.length > 0) {
              const storedFingerprint = buildFingerprint(parsedStored);
              changeDetected = currentFingerprint !== storedFingerprint;
            }
          }

          const packingDateTime = lastLog?.timestamp || null;
          const storedItems     = lastLog?.items     || null;

          if (!changeDetected) {
            return json({
              ok:              false,
              alreadyPacked:   true,
              changeDetected:  false,
              stage,
              packedBy:        relevantPackedBy,
              storedItems,
              packingDateTime,
              error: `هذا الأوردر تم تغليفه مسبقاً (${stage}) بواسطة ${relevantPackedBy}`,
            }, 200, request);
          }

          return json({
            ok:              false,
            alreadyPacked:   true,
            changeDetected:  true,
            stage,
            packedBy:        relevantPackedBy,
            storedItems,
            packingDateTime,
            stageAnalysis,
            order: {
              id:                orderId,
              gid:               order.id,
              name:              order.name,
              note:              order.note || '',
              fulfillmentStatus: order.displayFulfillmentStatus,
            },
            items: currentItems.length > 0 ? currentItems : activeItems,
          }, 200, request);
        }

        // ── Normal flow: classify items
        const { activeItems, exchangeItems } = classifyOrderItems(order);
        const items = stage === 'S1' ? activeItems : exchangeItems;

        if (items.length === 0) {
          return json({
            ok:    false,
            error: `لا توجد منتجات ${stage === 'S1' ? 'نشطة' : 'استبدال'} في هذا الأوردر`,
          }, 200, request);
        }

        return json({
          ok:            true,
          stageAnalysis,
          stage,
          order: {
            id:                orderId,
            gid:               order.id,
            name:              order.name,
            note:              order.note || '',
            fulfillmentStatus: order.displayFulfillmentStatus,
          },
          items,
        }, 200, request);
      }

      // ── complete_pack ──────────────────────────────────────
      if (action === 'complete_pack') {
        if (request.method !== 'POST') return json({ error: 'POST required' }, 405, request);

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

        // ── 1. Write metafields ──
        const metaResult = await shopifyGQL(env, token,
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
          }
        );

        if (metaResult.errors?.length) {
          return json({ ok: false, error: `Metafields error: ${metaResult.errors[0].message}` }, 400, request);
        }
        const metaErrors = metaResult?.data?.metafieldsSet?.userErrors || [];
        if (metaErrors.length > 0) {
          return json({ ok: false, error: metaErrors[0].message }, 400, request);
        }

        // ── 2. Add tag ──
        const tagResult = await shopifyGQL(env, token,
          `mutation AddTag($id: ID!, $tags: [String!]!) {
             tagsAdd(id: $id, tags: $tags) {
               userErrors { field message }
             }
           }`,
          { id: gid, tags: [tag] }
        );

        if (tagResult.errors?.length) {
          return json({ ok: false, error: `Tag error: ${tagResult.errors[0].message}` }, 400, request);
        }
        const tagErrors = tagResult?.data?.tagsAdd?.userErrors || [];
        if (tagErrors.length > 0) {
          return json({ ok: false, error: `Tag error: ${tagErrors[0].message}` }, 400, request);
        }

        // ── 3. Build items summary string ──
        const itemCount   = (items || []).reduce((s, i) => s + (i.quantity || 1), 0);
        const itemSummary = (items || []).map(i => `${i.sku || i.title} ×${i.quantity}`).join(', ');
        const editNote    = editReason ? ` (سبب الإعادة: ${editReason})` : '';

        // ── 4. Write D1 log ──
        await writeLog(env.DB, {
          tool:      TOOL_NAME,
          type:      'packed',
          employee,
          orderId,
          orderName,
          notes:     `${stage} — ${itemCount} قطعة — ${packedBy}${editNote}`,
          extra:     { stage, packedBy, packingDate: nowISO, itemCount, items: itemSummary },
          timestamp: nowISO,
        });

        // ── 5. Update new D1 columns ──
        await env.DB.prepare(
          `UPDATE logs
           SET stage = ?, item_count = ?, items = ?, edit_reason = ?
           WHERE tool = ? AND type = 'packed' AND order_name = ? AND timestamp = ?`
        ).bind(
          stage,
          itemCount,
          itemSummary,
          editReason || null,
          TOOL_NAME,
          orderName,
          nowISO
        ).run();

        return json({ ok: true, stage, tag, packedBy, packingDate: nowISO }, 200, request);
      }

      // ─── §LOG-ENDPOINTS ───────────────────────────────────

      if (action === 'get_logs') {
        const employee = url.searchParams.get('employee') || null;
        const search   = url.searchParams.get('search')   || null;
        const limit    = Math.min(parseInt(url.searchParams.get('limit')  || '100'), 100);
        const offset   = Math.max(parseInt(url.searchParams.get('offset') || '0'),    0);
        const entries  = await getLogs(env.DB, { tool: TOOL_NAME, employee, search, limit, offset });
        return json({ ok: true, entries }, 200, request);
      }

      if (action === 'get_logs_count') {
        const employee = url.searchParams.get('employee') || null;
        const search   = url.searchParams.get('search')   || null;
        const total    = await getLogsCount(env.DB, { tool: TOOL_NAME, employee, search });
        return json({ ok: true, total }, 200, request);
      }

      if (action === 'get_logs_export') {
        const employee = url.searchParams.get('employee') || null;
        const search   = url.searchParams.get('search')   || null;
        const entries  = await getLogsExport(env.DB, { tool: TOOL_NAME, employee, search });
        return json({ ok: true, entries }, 200, request);
      }

      return json({ error: `action غير معروف: ${action}` }, 400, request);

    } catch (err) {
      return json({ ok: false, error: err.message }, 500, request);
    }
  }
};
