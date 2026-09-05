<div dir="rtl" style="text-align: right;">

# `Warehouse-Operations-Center` — ملف البناء الكامل

> **الغرض:** بناء الهب بالكامل في جلسة واحدة، جاهز لتجربة حية.
> **الشرط:** المرحلة ٠ + ٠ب **خلصت** (سر موحّد لمجموعة `warehouse_ops` ·
> `warehouse_ops_center` مسجّل في §7 · `Order-Item-Remover` v1.3.0).
> **اتكتب:** 05-09-2026 — بعد فحص كامل لكود الأدوات التلاتة و`ecommoda-html-builder`
> (بنود Step 2 · Standards #1→#39 · Step 9).
> **الفرع:** `claude/warehouse-operations-center-dlrcnw`

---

## ⓪ الهوية والثوابت

```
الريبو              : ecommoda-dev/Warehouse-Operations-Center
الواجهة             : https://ecommoda-dev.github.io/Warehouse-Operations-Center/
tool في D1          : warehouse_ops_center      ← login · logout بس
TOOL_VERSION        : v1.0.0                    ← واحد للهب كله
مجموعة السر         : warehouse_ops
مفتاح localStorage  : warehouse_ops_worker_secret   ← Standards #39
Container Tier      : L (1400px) افتراضي · remove.html بتنزل M (1200px)
CORS                : ✅ صفر تعديل — التلات Workers بيسمحوا بالدومين أصلاً
Workers جديدة       : ❌ ولا واحد — الهب واجهة بس
```

**الأدوات جوّه الهب (الإصدار الأول):**

| الصفحة | الأداة | الـ Worker |
|---|---|---|
| `index.html` | الدخول + الشاشة الرئيسية | — (بينادي الطابعة والتغليف للأعداد) |
| `print.html` | طباعة الفواتير | `order-printer-worker` |
| `pack.html` | تشييك التغليف | `orders-packing-checker-worker` |
| `remove.html` | حذف منتج من الأوردر | `order-item-remover-worker` |
| `journey.html` | رحلة الأوردر (**جديدة**) | التلاتة (قراءة سجل) |

> 🔴 **الأدوات القديمة ماتتلمسش خالص في الجلسة دي.** بتفضل منشورة وشغّالة
> كنقطة رجوع طول التجربة الحية. تحويلها لصفحات تحويل = قرار منفصل بعد نجاح
> التجربة.

---

## ⓪ب 🔴 شرط ناقص — لازم يتعمل **قبل** أي حاجة تانية

> **سهو في «المرحلة ٠ نسخة ٢»:** الملف ده علّم §0.2 على إنه خلص لأن تسجيل
> `warehouse_ops_center` في §7 اتعمل — بس **تعديل الكود** اللي بيخلّي الـ Worker
> يقبل الاسم ده وقع من النسخة التانية. اتأكدت من `origin/main` بتاع
> `Orders-Packing-Checker` (commit `46311a5`, Worker v2.4.1): بصمة السر موجودة،
> و**`appId` مش موجود**.

**الأثر لو ما اتعملش:** `verify_employee` بيكتب `tool: TOOL_NAME` المثبّت، يعني
كل دخول على الهب هيتسجّل **`pack_checker`**. السجل بيكدب، والصف اللي سجّلته في
§7 بيفضل فاضي للأبد.

### التعديل — `Orders-Packing-Checker/index.js`

**① بعد `const TOOL_NAME = 'pack_checker';` (سطر ١١٩):**

```js
// ─── §CONSTANTS::authApps — مين مسموح له يسجّل دخوله على الـ Worker ده ───
//
// الـ Worker ده هو نقطة الدخول الموحّدة لمحطة المخزن: الأداة المستقلة بتسجّل
// تحت اسمها، و`Warehouse-Operations-Center` بيسجّل تحت اسمه هو
// (`ecommoda-constants` §7). الأفعال التشغيلية (`packed`) بتفضل تحت
// `pack_checker` دايمًا — ده الدخول بس.
//
// 🔴 **قايمة بيضاء مقفولة، مش قبول لأي نص.** `appId` جاي من العميل، وجدول
//    `logs` **مشترك بين الـ ٣٠ أداة**. من غير القايمة دي أي طلب معاه السر
//    يقدر يكتب صفوف بأي قيمة `tool` — وده بالظبط اللي عمله `write_external_log`
//    في `cod-payment-center-worker` (اتشال في v3.3.0 بعد ما سمح بصفوف يتيمة).
const AUTH_APPS = new Set([TOOL_NAME, 'warehouse_ops_center']);

// قيمة مش في القايمة بترجع للاسم الافتراضي **بدون خطأ** — الواجهة القديمة
// مابتبعتش `appId` أصلاً، ورمي خطأ هنا كان هيكسر الدخول عليها.
function resolveAuthTool(appId) {
  return AUTH_APPS.has(appId) ? appId : TOOL_NAME;
}
```

**② في `verify_employee` (سطر ~١٣١٥):**

```js
const { username, pin, appId } = await request.json().catch(() => ({}));
```

وفي الـ `writeLog` جوّاها:

```js
            tool:     resolveAuthTool(appId),
```

**③ في `log_logout`:**

```js
        const username = url.searchParams.get('username');
        const appId    = url.searchParams.get('appId');
```

وفي الـ `writeLog` جوّاها:

```js
              tool:     resolveAuthTool(appId),
```

**④ النسخة:** `WORKER_VERSION` من `2.4.1` لـ **`2.5.0`** (باراميتر مقبول جديد).

**⑤ `WOC_WORKERS.pack.min = '2.5.0'`** في `shared/shell.js`.

> ⚠️ **الرفع ده مشروع** (Standards #29): الهب **بيعتمد فعلاً** على السلوك
> الجديد. Worker أقدم **مش هيرجّع خطأ** — هيسجّل الدخول تحت `pack_checker`
> في صمت، وده بالظبط نوع الفشل اللي الحارس اتكتب عشانه.

**⑥ Promote** بعد الـ build.

### التحقق

```bash
curl -s -X POST -H "Authorization: Bearer <السر>" -H "Content-Type: application/json" \
  -d '{"username":"<اسم>","pin":"<PIN>","appId":"warehouse_ops_center"}' \
  "https://orders-packing-checker-worker.ecommoda-dev.workers.dev/?action=verify_employee"
```

```sql
SELECT tool, type, employee, timestamp FROM logs WHERE type = 'login' ORDER BY timestamp DESC LIMIT 3;
```

**المطلوب:** أحدث صف `tool = 'warehouse_ops_center'`.
ولو طلع `pack_checker` → الـ Promote ما تمّش، أو `appId` مش بيتقرا.

> ⚠️ **جرّب كمان الأداة القديمة** (من غير `appId`) → لازم تسجّل `pack_checker`
> زي ما هي. لو كسرت، `resolveAuthTool` بترمي بدل ما ترجّع الافتراضي.

---

## ① الاستثناءان المعتمدان من `ecommoda-html-builder`

الهب بيكسر بندين من Step 2 (**Non-Negotiable UI Rules**) **بقرار صريح**.
لازم يتوثّقوا في `CLAUDE.md` بتاع الريبو الجديد **وفي المهارة** — استثناء غير
موثّق بيتقرا غلطة في أول مراجعة.

### الاستثناء ١ — بند ١: «ONE HTML file per tool»

```
1. **ONE HTML file per tool** — never split into multiple pages or imports.
```

**الهب متعدد الصفحات + ملفين مشتركين.** الأرقام اللي بنى عليها القرار:

| | ملف واحد | متعدد الصفحات |
|---|---|---|
| أكبر ملف عند ٣ أدوات | ~٤٢٠ KB | **٢٢٠ KB** |
| أكبر ملف عند ٨ أدوات | **~١.٢ MB** | **٢٢٠ KB** (ثابت) |
| تعارضات CSS تتحل بإيدك | ٤٦ | **صفر** (قاعدة الأسبقية تحت) |
| باج في التغليف يوقّف الطباعة | ✅ | ❌ |
| فوكس السكانر | يتدار مركزيًا (خطر) | زي النهاردة بالظبط |

**البند لسه سليم للأدوات المستقلة** — الاستثناء لأداة **هب** بس.

### الاستثناء ٢ — بند ٥: «`currentEmployee` in JS memory only»

```
5. **`currentEmployee` in JS memory only** — never `localStorage`.
```

الهوية بتعيش في **`sessionStorage`** عشان تعيش عبر التنقل بين الصفحات.

**ليه ده مش خرق للروح:**

| | `localStorage` (الممنوع) | `sessionStorage` (الهب) | الذاكرة (اليوم) |
|---|---|---|---|
| بيعيش بعد قفل التاب | ✅ **خطر** | ❌ | ❌ |
| مشترك بين تابين | ✅ **خطر** | ❌ **لكل تاب لوحده** | ❌ |
| بيعيش عبر التنقل | ✅ | ✅ **المطلوب** | ❌ |
| بيدي صلاحية جديدة | ❌ | ❌ | ❌ |

> ⚠️ **الحقيقة اللي لازم تتكتب صريحة:** `employee` بيتبعت من العميل في كل كتابة
> **النهاردة كمان** — الـ Worker مابيتحققش من هوية الموظف، بيتحقق من السر بس.
> `sessionStorage` **مابيضيفش** أي ضعف؛ هو بيوصل الهوية بين الصفحات وبس.
> المحاسبة على الموظف **شرف مش إثبات** — قبل الهب وبعده. لو اتطلب تتحوّل
> لإثبات، الحل session token موقّع من الـ Worker، وده بند منفصل تمامًا مكانه
> `ecommoda-worker-builder`.

**فرق سلوكي واحد لازم يتقال:** النهاردة أي **ريفريش** بيطلّع الموظف. في الهب
الريفريش بيحافظ على الجلسة (وقفل التاب بيطلّعه). ده **تحسين مقصود** —
`pack_checker` عنده ٣٠٠ صف `login` في ٤ شهور، جزء كبير منهم ريفريش مش دخول جديد.

### تعديل المهارة المطلوب بعد نجاح التجربة

بند ٤٠ في Standards Changelog — النص جاهز في §⑬.

---

## ② شجرة الملفات

```
Warehouse-Operations-Center/
├── index.html            الدخول + الشاشة الرئيسية            ~60 KB
├── print.html            الطباعة (منقولة)                    ~150 KB
├── pack.html             التغليف (منقولة)                    ~215 KB
├── remove.html           حذف منتج (منقولة)                    ~60 KB
├── journey.html          رحلة الأوردر (جديدة)                 ~40 KB
├── shared/
│   ├── shell.css         التوكنز + الهيدر + المودالات + التوست  ~18 KB
│   └── shell.js          الجلسة + الـ API + الأدوات المشتركة    ~22 KB
├── CLAUDE.md
├── README.md
└── .gitignore
```

> ❌ **مفيش `wrangler.toml` ومفيش `index.js`** — الريبو ده **واجهة بحتة**.
> مفيش Worker جديد، فمفيش ربط Cloudflare Builds ومفيش Promote.

> ❌ **مفيش `Index.html`** (بحرف كبير). الملف ده في الريبوهات القديمة صفحة
> تحويل لبوكماركات قديمة — الهب جديد فمالوش بوكماركات قديمة.

---

## ③ 🔴 قاعدة الأسبقية — أهم قاعدة في الملف ده

```html
<!-- في كل صفحة، بالترتيب ده بالظبط -->
<link rel="stylesheet" href="shared/shell.css">
<style>
  /* CSS الصفحة — بيغلب shell.css عند أي تعارض */
</style>
```

**`shell.css` فيه الـ chrome بس. أي CSS خاص بالأداة بيفضل في صفحته.**

ليه ده بيلغي شغل حل الـ ٤٦ تعارض: الصفحة بتيجي بعد الـ shell، فقاعدتها بتغلب
تلقائيًا. يعني **`.act-btn` و`.count-badge` و`.state-box` و`.ms-*` و`.tbl-*`
و`.range-preset-*` كلها تفضل في صفحتها زي ما هي** — صفر مخاطرة انحدار بصري.

### إيه اللي يدخل `shell.css` بالظبط

| ✅ يدخل | ❌ مايدخلش (يفضل في الصفحة) |
|---|---|
| `:root` — كل التوكنز | أي كلاس خاص بجدول أو فلتر |
| reset + `body` + `.container` | `.data-table` · `.tbl-*` · `.col-*` |
| `.app-header` · `.app-icon` · `.app-title` · `.app-header-btns` · `.hbtn` | `.ms-*` · `.flt-*` · `.chips-*` · `.unified-section` |
| `.main-tabs-bar` · `.main-tab-btn` | `.range-preset-*` |
| `.eco-overlay` · `.eco-modal` · `.eco-modal-hdr` · `.eco-modal-body` · `.modal-close-x` | `.act-btn` · `.count-badge` · `.state-box` |
| `.settings-*` · `.about-sec*` · `.cl-*` | أي كلاس اسمه فيه `rdy-` أو `pin-slot` بتاع التشييك |
| `.toast-container` · `.toast` + أنواعه | |
| `.btn-primary` · `.btn-ghost` · `.btn-green` · `.btn-red` · `.btn-outline` | |
| `.order-link` · `.order-num` · `.no-link` | |
| `.woc-home-*` (كروت الشاشة الرئيسية) | |

**المصدر القانوني للـ shell: `Orders-Packing-Checker/index.html`** — أحدث نسخة
(v2.6.1، اتعدّلت النهاردة)، أكتر توكنز (٥١ مقابل ٤٣ و٣٠)، وفيها `.btn-red`
(Standards #38) و`--crit*` و`--orange*` و`--focus-ring*` و`--overlay-scrim`.

**التوكنز المتعارضة — القرار:**

| التوكن | الطابعة | التغليف | الحذف | **القرار** |
|---|---|---|---|---|
| `--text-muted` | `#9ca3af` | `#6b7280` | `#6b7280` | **`#6b7280`** (٢ مقابل ١) |
| `--amber-border` | `#fcd34d` | `#fde68a` | — | **`#fde68a`** (التغليف) |
| `--container-max` | `1400px` | `1400px` | `1200px` | **`1400px`** في الـ shell · `remove.html` تنزّلها لـ `1200px` في ستايلها |
| `--shadow` | مختلف بالمسافات | — | — | **نسخة التغليف** |

> ⚠️ **`--print-ink` و`--print-paper` موجودين في الطابعة بس** — يتنقلوا للـ
> shell برضه (توكنز مش بتضر)، وHTML الفاتورة جوّه الـ iframe **يفضل بألوانه
> الحرفية** — استثناء موثّق من Standards #35 لأن مستند الـ iframe مالوش وصول
> لـ `:root`. **متحاولش تصلّحه.**

> ⚠️ **`--font-mono` لازم يفضل معرّف** بنفس قيمة `--font-body` — كلاسات
> (`.order-link` · `.col-num` · `.settings-input`) بتستخدمه (Standards #16).

---

## ④ عقد الجلسة — `sessionStorage`

### المفاتيح

```js
// ─── shared/shell.js § SESSION ───
const WOC_SESSION_KEY = 'woc_session';       // الهوية
const WOC_CACHE_PRINT = 'woc_queue_print';   // كاش طابور الطباعة
const WOC_CACHE_PACK  = 'woc_queue_pack';    // كاش طابور التغليف
const WOC_CACHE_TTL_MS = 15 * 60 * 1000;     // ١٥ دقيقة
```

### شكل الجلسة

```js
{
  v: 1,                        // نسخة العقد — لو اتغيّر الشكل، القديم بيترفض
  username: 'Ahmed_Ibraheem',
  displayName: 'Ahmed Ibraheem',
  loginAt: '2026-09-05T07:12:44.101Z'
}
```

### الدوال

```js
// ─── shared/shell.js § SESSION ───
//
// ⚠️ sessionStorage مش localStorage — بيموت مع قفل التاب، ولكل تاب لوحده.
//    ده استثناء موثّق من ecommoda-html-builder بند ٥، سببه إن الهب متعدد
//    الصفحات فالذاكرة مابتعيشش عبر التنقل. راجع CLAUDE.md § الاستثناءات.
//
// ⚠️ كل قراءة/كتابة جوّه try/catch — المتصفح في وضع خاص أو بحظر التخزين
//    بيرمي على مجرد الوصول، والرمي ده كان هيمنع فتح الصفحة أصلاً.

function getSession() {
  try {
    const raw = sessionStorage.getItem(WOC_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s?.v !== 1 || !s.username || !s.displayName) return null;
    return s;
  } catch { return null; }
}

function setSession(username, displayName) {
  try {
    sessionStorage.setItem(WOC_SESSION_KEY, JSON.stringify({
      v: 1, username, displayName, loginAt: new Date().toISOString(),
    }));
  } catch {}
}

function clearSession() {
  try {
    sessionStorage.removeItem(WOC_SESSION_KEY);
    sessionStorage.removeItem(WOC_CACHE_PRINT);
    sessionStorage.removeItem(WOC_CACHE_PACK);
  } catch {}
}

// الحارس — بيتنادى في أول سطر في كل صفحة غير index.html.
// بيرجّع الجلسة أو بيحوّل لشاشة الدخول ومعاها وجهة الرجوع.
function requireSession() {
  const s = getSession();
  if (!s) {
    const next = location.pathname.split('/').pop() + location.search;
    location.replace(`index.html?next=${encodeURIComponent(next)}`);
    throw new Error('no session');   // بيوقف باقي سكربت الصفحة
  }
  return s;
}
```

> 🔴 **`requireSession()` بترمي عن قصد** — من غير الرمي، باقي سكربت الصفحة
> بيكمّل تنفيذ وبينادي الـ Worker وبيرسم جدول **أثناء** ما التحويل شغّال.
> النتيجة نداءات ضايعة ووميض شاشة. الرمي بيوقف السكربت فورًا.

> ⚠️ **`location.replace` مش `location.href`** — عشان صفحة محمية مايتسجّلش لها
> مدخل في تاريخ المتصفح. زرار الرجوع بعد الخروج مايرجعش لشاشة فاضية.

### مفيش انتهاء صلاحية بالوقت

الجلسة بتموت بقفل التاب أو بالخروج بس. **مقصود** — ده مطابق لسلوك النهاردة
(لابتوب المخزن مفتوح طول الوردية). أي timeout كان هيطلّع الموظف وهو بيغلّف.

### كاش الطوابير

```js
{ at: '2026-09-05T07:12:44.101Z', data: <رد الـ endpoint كامل> }
```

- بيتكتب بعد **كل جلب ناجح** من أي صفحة.
- `index.html` بتقرا الاتنين للأعداد + ختم «محدّث من كام».
- `print.html` / `pack.html` بيقروا كاشهم عند الفتح فالشاشة **مش بتفضل فاضية**.
- **أقدم من ١٥ دقيقة:** ترسم من الكاش فورًا **و**تجيب تحديث في الخلفية.
  الشاشة الفاضية أسوأ من شاشة قديمة **مختومة بوقتها**.

**الحجم:** صف الطابور ٩ حقول (`shapeReadyOrder`) ≈ ٢٥٠ بايت. ١٢٧ أوردر ≈ ٣٢ KB.
طابور الطباعة أتقل (فيه العميل والسعر والتاجات) لكن أقل عددًا. الحد ~٥ ميجا.

```js
function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c?.at || !c?.data) return null;
    return { ...c, ageMs: Date.now() - new Date(c.at).getTime() };
  } catch { return null; }
}

function cacheSet(key, data) {
  // ⚠️ QuotaExceededError ممكن يحصل — الكاش تحسين مش شرط، فالفشل بيتبلع
  //    بصمت والصفحة بتشتغل عادي بجلب جديد.
  try { sessionStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), data })); }
  catch {}
}
```

---

## ⑤ `shared/shell.js` — المحتوى بالاسم

### §CONFIG — الـ Workers في مكان واحد

```js
// ⚠️ الروابط مش أسرار (Standards #28) — الحماية في السر + CORS allowlist.
// كل Worker ومعاه أقل نسخة الهب بيشتغل معاها. الحد الأدنى **لكل Worker
// لوحده** — مالهمش أي علاقة ببعض ولا بـ TOOL_VERSION.
const WOC_WORKERS = {
  printer: { url: 'https://order-printer-worker.ecommoda-dev.workers.dev',          min: '2.2.0', label: 'الطباعة' },
  pack:    { url: 'https://orders-packing-checker-worker.ecommoda-dev.workers.dev', min: '2.5.0', label: 'التغليف' },
  remover: { url: 'https://order-item-remover-worker.ecommoda-dev.workers.dev',     min: '1.3.0', label: 'حذف منتج' },
};

const TOOL_VERSION = 'v1.0.0';                    // الهب كله — مصدر واحد (#24)
const LS_SECRET    = 'warehouse_ops_worker_secret'; // مفتاح المجموعة (#39)
```

> ⚠️ **`min` لكل Worker على حدة، ومايترفعش إلا لما الهب يعتمد فعلاً على حاجة
> جديدة فيه** (Standards #29). ترفيعه بلا سبب = تحذير كاذب على أي rollback مشروع.

### §API — مصنع بدل دوال عامة

```js
// كل صفحة بتنادي Worker مختلف، فالـ api بيتبني بالـ URL بتاعه.
// ⚠️ apiRequest دي **نسخة Orders-Packing-Checker** — بتعلّق `status`
//    و`payload` على الاستثناء. `pack.html` محتاجاهم لمسار الـ 409
//    (اتغلّف قبل كده). الصفحات التانية مش بتقراهم فمفيش تعارض.
function wocApi(worker) {
  const base = worker.url.replace(/\/$/, '');

  async function apiRequest(url, opts) {
    const secret = getSecret();
    if (!secret) { openSettings(); throw new Error('الإعدادات غير مكتملة — أدخل الـ WORKER SECRET'); }
    let resp;
    try {
      resp = await fetch(url, {
        ...opts,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${secret}`, ...(opts?.headers || {}) },
      });
    } catch (e) {
      throw new Error(`تعذّر الوصول لـ Worker ${worker.label} — راجع الاتصال أو حالة الـ Worker: ${e.message}`);
    }
    const text = await resp.text();
    let data;
    try { data = text ? JSON.parse(text) : null; }
    catch { throw new Error(`رد غير متوقع من Worker ${worker.label} (HTTP ${resp.status}): ${text.slice(0, 160)}`); }
    if (!resp.ok) {
      const err = new Error(data?.error || `HTTP ${resp.status}`);
      err.status = resp.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  return {
    apiGet:  (action, params = {}) => apiRequest(`${base}/?${new URLSearchParams({ action, ...params })}`, { method: 'GET' }),
    apiPost: (action, body = {})   => apiRequest(`${base}/?action=${encodeURIComponent(action)}`, { method: 'POST', body: JSON.stringify(body) }),
    // الطابعة بترّوت بالـ path كمان (/orders · /invoice · /track · /logs) —
    // شكل تاريخي متساب عمدًا، مش غلط يتصلّح.
    apiPath: (path, body = {})     => apiRequest(`${base}${path}`, { method: 'POST', body: JSON.stringify(body) }),
  };
}
```

### باقي محتوى `shell.js`

| القسم | الدوال | المصدر |
|---|---|---|
| §SESSION | `getSession` · `setSession` · `clearSession` · `requireSession` · `cacheGet` · `cacheSet` | **جديد** |
| §CONFIG | `WOC_WORKERS` · `TOOL_VERSION` · `LS_SECRET` · `getSecret` · `setSecret` | جديد + #28 |
| §API | `wocApi` | التغليف |
| §HELPERS | `esc` · `toCairo` · `cairoDayStr` · `formatDate` · `formatDateTime` · `formatTimeOnly` · `formatDateForExport` · `formatTimeForExport` · `cmpVersion` · `orderLink` · `shopifyOrderUrl` · `playBeep` | التغليف |
| §UI | `showToast` · `openSettings` · `closeSettings` · `saveSettings` · `openAbout` · `closeAbout` · `openChangelog` · `closeChangelog` · `renderVersionUI` · `checkWorkerVersion` · `showWorkerStale` · `doLogout` | التغليف |
| §HEADER | `wocHeader(opts)` — بتبني الهيدر الموحّد | جديد |

### 🔴 اللي **ممنوع** يدخل `shell.js`

```
switchMainTab · finishLogin · runDiag · renderLogTable · fetchLog
renderPagination · goPage · lookupOrder · currentOrder · applySort
sortConfig · msState · msToggle · anyFilterActive · clearAllFilters
```

**دول مختلفين فعلاً بين الأدوات** — قستهم: من ٦١ اسم مشترك بين الطابعة
والتغليف، ~١٥ منهم منطقهم مختلف مش مجرد تنسيق. **حطّهم في الـ shell = تكسر
صفحة أو اتنين بصمت.** كل واحد فيهم يفضل في صفحته.

### الهيدر الموحّد — الترتيب

RTL، القراءة من اليمين للشمال:

```
[🏠 الرئيسية] [extras خاصة بالصفحة] [ℹ️ عن الأداة] [vX.Y.Z 📋] [👤 اسم — خروج] [⚙️ الإعدادات]
```

> ⚠️ **`⚙️ الإعدادات` آخر عنصر** في ترتيب القراءة RTL = **أقصى الشمال بصريًا**
> (Step 3 · Header Button Order). الأدوات التلاتة الحالية **مش متطابقة** في
> الترتيب ده — الهب بيوحّده.

> ⚠️ **`🏠 الرئيسية` أول عنصر** (أقصى اليمين، جنب العنوان) — مكان الرجوع
> الطبيعي. في `index.html` الزرار ده **مايتعرضش**.

### حارس النسخة — لازم يسمّي الـ Worker

```js
// ⚠️ الهب بينادي تلات Workers بتلات حدود دنيا مستقلة. رسالة «الـ Worker نسخة
//    قديمة» من غير اسم الأداة بتخلّي الموظف يدوّر في التلاتة.
async function checkWorkerVersion(keys) {
  for (const k of keys) {
    const w = WOC_WORKERS[k];
    try {
      const { apiGet } = wocApi(w);
      const cfg = await apiGet('get_config');
      if (cmpVersion(cfg.version || cfg.WORKER_VERSION, w.min) < 0) {
        showWorkerStale(`⚠️ Worker ${w.label} نسخة قديمة`);
      }
    } catch { /* الفشل هنا مش تحذير نسخة — الأداة نفسها هتبلّغ عند أول نداء */ }
  }
}
```

- `index.html` → `checkWorkerVersion(['printer','pack','remover'])`
- `print.html` → `['printer']` · `pack.html` → `['pack']` · `remove.html` → `['remover']`
- `journey.html` → `[]` (قراءة سجل بس، مفيش عقد جديد)

---

## ⑥ `index.html` — الدخول + الشاشة الرئيسية

### شاشة الدخول

**منقولة كما هي من `Orders-Packing-Checker`** (§AUTH-JS + الـ HTML + الـ CSS)
— ٨٢٢ سطر، أحدث نسخة ومطابقة لـ Standards #7 و#8 و#18 و#34.

**التعديلات الأربعة بس:**

```js
// ① الدخول بيتنادى على Worker التغليف — أكتر الأدوات استخدامًا
const { apiGet, apiPost } = wocApi(WOC_WORKERS.pack);

// ② صف الـ login في D1 بياخد اسم الهب مش اسم أداة
//    (§7: warehouse_ops_center → login · logout)
await apiPost('verify_employee', { username, pin, appId: 'warehouse_ops_center' });

// ③ finishLogin بقت: تكتب الجلسة → تروح للوجهة أو للرئيسية
async function finishLogin(username, displayName, logged) {
  setSession(username, displayName);
  if (logged === false) showToast('الدخول تم بس تسجيله في السجل فشل', 'warn', 5000);
  const next = new URLSearchParams(location.search).get('next');
  if (next && /^[a-z]+\.html(\?.*)?$/.test(next)) { location.replace(next); return; }
  showHome();
}

// ④ الخروج بينادي log_logout بنفس appId قبل ما يمسح الجلسة
```

> 🔴 **`next` بيتفحص بـ regex قبل التحويل.** من غير الفحص، `?next=https://evil…`
> بيحوّل الموظف لبرّه. الـ regex بيسمح باسم ملف محلي + query بس.

> ⚠️ **`appId` لازم يكون Worker التغليف داعمه** (المرحلة ٠ب). لو الجلسة اللي
> نفّذت المرحلة ٠ب ما ضافتش الباراميتر ده، **قف واضفه الأول** — من غيره كل
> دخول هيتسجّل `pack_checker` وده كدب في السجل.

### الشاشة الرئيسية — مستويان

```
┌─── الطوابير ─────────────────────────────────────────┐
│  ┌────────────────────┐   ┌────────────────────┐    │
│  │  🖨  جاهز للطباعة   │   │  📦  جاهز للتغليف   │    │
│  │        21          │   │        127         │    │
│  │  عادي 21 · استبدال 0│   │ عادي 124 · استبدال 3│    │
│  │  محدّث من ٣ دقايق ↻ │   │ محدّث من ٣ دقايق ↻  │    │
│  └────────────────────┘   └────────────────────┘    │
└──────────────────────────────────────────────────────┘

┌─── أدوات ────────────────────────────────────────────┐
│   🗑 حذف منتج          🔎 رحلة الأوردر                │
└──────────────────────────────────────────────────────┘
```

**قواعد الشاشة دي — كل واحدة ليها سبب:**

| # | القاعدة | ليه |
|---|---|---|
| ١ | 🔴 **مفيش polling على الشاشة الرئيسية** | `get_ready_orders` بيصفّح كل الأوردرات ويصنّف S2 لكل واحد. polling هنا = مضاعفة أتقل endpoint × عدد الأجهزة × طول اليوم. |
| ٢ | الأعداد بتتجاب **مرة واحدة بعد الدخول**، والاتنين **بالتوازي** | Workers مختلفين = isolates مختلفين = توازي حقيقي. `Promise.allSettled` مش `Promise.all` — فشل طابور مايخفيش التاني. |
| ٣ | **العدد قبل أول جلب ناجح = `—` مش `0`** | «ما اتحدّثش» ≠ «مفيش شغل». نفس قاعدة `rdySetCounts(null,…)` في أداة التغليف. |
| ٤ | **الفشل بيعرض حالة فشل مش صفر** | «تعذّر الاستعلام» ≠ «مفيش شغل». الكارت بيبقى فيه ⚠️ + زرار «حاول تاني»، والدخول للأداة **لسه شغّال**. |
| ٥ | **ختم الوقت بيتسجّل حتى لو الطابور رجع فاضي** | «اتحدّث ورجع صفر» معلومة. وفي **الفشل الختم مايتغيّرش**. |
| ٦ | أداة جديدة بتدخل **الصف التاني** افتراضيًا | عدّاد حيّ = جلب تقيل عند كل دخول. ماياخدهوش إلا لو عنده طابور حقيقي وجلبه رخيص. |
| ٧ | الضغط على الكارت بيفتح الصفحة **حتى والجلب فشل** | الطابور مش شرط للشغل — الموظف يقدر يسكن باركود عادي. |

### مصدر الأعداد

```js
const [printRes, packRes] = await Promise.allSettled([
  wocApi(WOC_WORKERS.printer).apiPath('/orders', {}),
  wocApi(WOC_WORKERS.pack).apiGet('get_ready_orders'),
]);
// النجاح → cacheSet + رسم العدد + ختم الوقت
// الفشل  → حالة الفشل + الختم القديم زي ما هو
```

**عدّ الطباعة:** طول مصفوفة الأوردرات المرجّعة، مقسّمة `S1`/`S2` بنفس تسميات
`TYPE_LABEL` («عادي» / «استبدال-استرجاع»).
**عدّ التغليف:** `total` من الرد، والتقسيم من `orderType`.

> ⚠️ **التسميات عرض بس.** القيم المخزّنة في D1 وعقد الـ Worker بتفضل `S1`/`S2`
> حرفيًا — أي فلتر أو استعلام يستخدم القيم مش التسميات.

---

## ⑦ `print.html` — إجراء النقل

### الخطوات

```
① cp Order-Printer/index.html  →  Warehouse-Operations-Center/print.html
② امسح: شاشة الدخول (HTML + CSS + §AUTH-JS) · مودال الإعدادات · §CONFIG القديم
③ امسح من الـ CSS: التوكنز · الهيدر · التوست · شِل المودالات · الأزرار
   ⚠️ سيب: .act-btn · .count-badge · .state-box · .ms-* · .flt-* · .tbl-* ·
      .range-preset-* · §RESULTS · CSS الفاتورة
④ ضيف <link shell.css> + <script shell.js> قبل سكربت الصفحة
⑤ الهيدر → wocHeader({ home:true, title:'طباعة الفواتير', extras:[زرار تحديث] })
⑥ §INIT الجديد (تحت)
```

### `§INIT` الجديد

```js
// أول سطر — قبل أي حاجة تانية
const session = requireSession();
const currentEmployee = { username: session.username, displayName: session.displayName };
const { apiGet, apiPost, apiPath } = wocApi(WOC_WORKERS.printer);

document.addEventListener('DOMContentLoaded', () => {
  renderVersionUI();
  checkWorkerVersion(['printer']);

  // كاش الطابور — الشاشة مابتفضلش فاضية
  const cached = cacheGet(WOC_CACHE_PRINT);
  if (cached) { renderOrdersFrom(cached.data); markFreshness(cached.at); }
  if (!cached || cached.ageMs > WOC_CACHE_TTL_MS) loadOrders();

  loadLogs();          // عدّاد «مرات الطباعة» + خريطة آخر طباعة
  applyOrderParam();   // ?order= — تحت
});
```

> ⚠️ **`loadOrders()` لازم تعمل `cacheSet(WOC_CACHE_PRINT, data)`** بعد كل جلب
> ناجح، وإلا الشاشة الرئيسية هتفضل على عدد قديم.

### 🔴 تحذير الطباعة المزدوجة

**قرار أحمد 05-09-2026.** المشكلة: جهازين × «طباعة الكل» = ٤٢ ورقة بدل ٢١.

**البيانات موجودة أصلاً ومترمية.** `/logs` بيرجّع
`{ orderNumber, type, timestamp, employee }`، والواجهة بتعدّ بس وبترمي الوقت
والاسم. **صفر endpoint جديد وصفر تعديل Worker.**

```js
// §CONFIG بتاع الصفحة
const REPRINT_WARN_MINUTES = 30;   // ثابت مسمّى — تغييره قرار مش صدفة
```

**التسلسل جوّه `executePrint(orders)` — قبل أي طباعة:**

```js
// ① جلب طازة ليوم القاهرة الحالي. D1 مش شوبيفاي — رخيص وسريع،
//    وبيستخدم idx_logs_tool_ts.
// ⚠️ الخريطة المبنية وقت الدخول ممكن تكون عمرها ٣ ساعات — تحذير مبني على
//    بيانات قديمة أسوأ من مفيش تحذير، لأنه بيدّي إحساس كاذب بالأمان.
let recent = [];
try {
  const fresh = await apiPath('/logs', { dateFrom: cairoDayStr(new Date()) });
  const last = {};                       // الرد مرتّب DESC — أول ظهور هو الأحدث
  for (const e of (fresh.entries || [])) {
    const num = String(e.orderNumber).replace('#', '');
    if (!last[num]) last[num] = e;
  }
  const cutoff = Date.now() - REPRINT_WARN_MINUTES * 60000;
  recent = orders.filter(o => {
    const e = last[String(o.name).replace('#', '')];
    return e && new Date(e.timestamp).getTime() > cutoff;
  });
} catch (err) {
  // 🔴 التحذير **مايمنعش** الطباعة أبدًا. فشل الفحص = كمّل واقول ليه.
  showToast('تعذّر فحص الطباعة المتكررة — الطباعة مكمّلة', 'warn', 5000);
}

// ② صفر متكرر = مفيش نافذة خالص (الحالة الغالبة في اليوم العادي)
if (recent.length) {
  const choice = await openReprintWarn(recent, orders.length);
  if (choice === 'cancel') return;
  if (choice === 'skip') orders = orders.filter(o => !recent.includes(o));
}

// ③ الطباعة تكمّل بـ mapLimit زي ما هي
```

**النافذة:**

```
⚠️  ٣ من الـ ٢١ أوردر اتطبعوا خلال آخر ٣٠ دقيقة

    #53621   من ١٢ دقيقة   ·  Abo_Selim
    #53615   من ٧ دقايق    ·  Abo_Selim
    #53607   من ٢٥ دقيقة   ·  Ahmed_Ibraheem

  [ اطبع الـ ١٨ الباقيين ]   [ اطبع الـ ٢١ كلهم ]   [ إلغاء ]
       (أساسي · btn-primary)      (btn-ghost)      (btn-red)
```

| القرار | ليه |
|---|---|
| **نافذة واحدة للدفعة كلها** مش سؤال لكل أوردر | سؤال ×٢١ = الموظف بيدوس Enter من غير ما يقرا، والحارس يبقى ديكور |
| **«اطبع الباقيين» هو الأساسي** | بيحل المشكلة الفعلية، وإعادة الطباعة المشروعة لسه بضغطة |
| **`btn-red` على «إلغاء»** | Standards #38 — الزرار الرئيسي في نافذة بحالة سلبية |
| **مفيش نافذة لو `recent.length === 0`** | اليوم العادي مايتغيّرش فيه حاجة خالص |
| **الفشل مايمنعش** | حارس بيمنع الشغل بيتشال بعد أسبوع |
| **الأوردر بيتحدد بالاسم** | «٣ اتطبعوا» من غير أسماء = الموظف مايقدرش يقرر |

> ⚠️ **z-index النافذة = 600** زي كل المودالات (Standards #17). Step 9 بيفحصها.

### `?order=` — الجاي من طابور التغليف

```js
function applyOrderParam() {
  const num = new URLSearchParams(location.search).get('order');
  if (!num) return;
  document.getElementById('searchInput').value = num;   // فلتر البحث السريع
  onSearchInput();
  showToast(`الجدول مفلتر على الأوردر ${num}`, 'info', 4000);
  if (new URLSearchParams(location.search).get('from') === 'pack') showBackToQueue();
}
```

> 🔴 **الباراميتر بيفلتر ويحدّد — مايطبعش.** طباعة تلقائية من رابط = ورق
> بيطلع من غير ما حد يضغط. الموظف بيراجع ويضغط بنفسه.

---

## ⑧ `pack.html` — إجراء النقل

نفس خطوات §⑦، مع الفروق دي:

### اللي **يتساب زي ما هو بالحرف**

```
§SCAN                    التلات مداخل + lastEntryMode + focusEntryInput
§READY-JS كامل           الطابور · النبضة · التحديث التلقائي ١٥ دقيقة · rdyDirty
§TOOL-JS                 شاشة التشييك · حارس «اتغلّف قبل كده» · نافذة الـ 409
§LOG-JS                  السجل server-side
كل CSS الطابور والتشييك  .rdy-* · .zone-badge · .courier-cell · .entry-grid · sinceScale
```

> 🔴 **`.entry-grid` = `repeat(3, 1fr)` والألوان التلاتة** — اللون هو التمييز
> الوحيد بين المداخل. أي توحيد بيرجّع «سكنت في المربع الغلط».

> 🔴 **`mapLimit` و`PRINT_CONCURRENCY` في صفحة الطباعة — ممنوع الرجوع لـ
> `Promise.all`** (R15). ده في `print.html` مش هنا، بس بيتحط في `CLAUDE.md`.

### التعديلات

```js
// ① الجلسة بدل شاشة الدخول
const session = requireSession();
const currentEmployee = { username: session.username, displayName: session.displayName };
const { apiGet, apiPost } = wocApi(WOC_WORKERS.pack);

// ② finishLogin → initPage
document.addEventListener('DOMContentLoaded', () => {
  renderVersionUI();
  checkWorkerVersion(['pack']);
  document.getElementById('packedByName').textContent = session.displayName;

  const cached = cacheGet(WOC_CACHE_PACK);
  if (cached) { rdyRenderFrom(cached.data); rdyStampFreshness(cached.at); }
  if (!cached || cached.ageMs > WOC_CACHE_TTL_MS) rdyLoadOrders();

  rdyArmAutoRefresh();
  setTimeout(() => focusEntryInput(), 100);
});

// ③ rdyLoadOrders بتعمل cacheSet(WOC_CACHE_PACK, data) بعد كل جلب ناجح
```

### زراري «خيارات» في الجدول

```js
// كانوا لينكات خارجية للأدوات القديمة — بقوا صفحات جوّه الهب.
const RDY_OPT_LINKS = {
  broken: (num) => `remove.html?order=${encodeURIComponent(num)}&from=pack`,
  print:  (num) => `print.html?order=${encodeURIComponent(num)}&from=pack`,
};
```

> ⚠️ **`target="_blank"` يتشال.** كانوا بيفتحوا أدوات تانية فالتاب الجديدة كانت
> منطقية. دلوقتي هما جوّه الهب — تاب جديدة معناها جلسة تانية في
> `sessionStorage`… **لأ، معناها نفس الجلسة** (`sessionStorage` بينتقل للتاب
> الجديدة عند فتحها بلينك من نفس الأصل)، بس الموظف بيتوه بين تابات. التنقل
> في نفس التاب + زرار «↩ رجوع للطابور».

> ⚠️ **الزراري لسه بلا أي أكشن على الأوردر** — بتفتح صفحة وبس. لو حد ضاف
> أكشن هناك بعدين، لازم يعدّي على حارس التغليف زي أي كتابة تانية.

---

## ⑨ `remove.html` — إجراء النقل

### التعديلات

```js
const session = requireSession();
const currentEmployee = { username: session.username, displayName: session.displayName };
const { apiGet, apiPost } = wocApi(WOC_WORKERS.remover);

document.addEventListener('DOMContentLoaded', () => {
  renderVersionUI();
  checkWorkerVersion(['remover']);
  const p = new URLSearchParams(location.search);
  const num = p.get('order');
  if (num) {
    document.getElementById('orderInput').value = num;
    lookupOrder();                                  // فتح تلقائي
    if (p.get('from') === 'pack') showBackToQueue();
  }
});
```

**`--container-max: 1200px`** في ستايل الصفحة (Tier M — مفيش جدول كثيف).

### 🔴 اللي **ممنوع** يتلمس

الأداة دي **هدّامة** — بتحذف بند من أوردر حي. قربها بضغطة من جدول التغليف
معناه إنها هتتستخدم أكتر، يعني حراسها بقت **أهم** مش أقل:

- نافذة التأكيد **بالتأكيدين الإلزاميين** (مراجعة المخزون + قطع الفاتورة)
- شرط `displayFinancialStatus = PENDING` (COD غير مسدد)
- `restock: false` **مفروضة من الواجهة والـ Worker** (دفاع مزدوج)
- الرجوع للوضع الافتراضي بعد أي حذف ناجح
- انتقال `custom.manual_status → Pending Edit` بشرطه، و`cancel_manual_reason → عطلان`

> ⚠️ **الفتح التلقائي بيوصل لقايمة المنتجات بس** — مش بيحذف ومش بيختار بند.

---

## ⑩ `journey.html` — رحلة الأوردر (جديدة)

**المكسب اللي الدمج بيفتحه.** أوردر واحد، كل اللي حصل له عبر التلات أدوات.

### مصدر البيانات — صفر تعديل Worker

كل Worker عنده `?action=get_logs` وبيفلتر على `tool` بتاعه **مثبّت في الكود**،
فمفيش endpoint واحد بيرجّع التلاتة. الحل: **تلات نداءات متوازية ودمج في الواجهة.**

```js
const num = orderNumber.replace('#', '');
const [pr, pk, rm] = await Promise.allSettled([
  wocApi(WOC_WORKERS.printer).apiGet('get_logs', { search: num, limit: 100 }),
  wocApi(WOC_WORKERS.pack).apiGet('get_logs',    { search: num, limit: 100 }),
  wocApi(WOC_WORKERS.remover).apiGet('get_logs', { search: num, limit: 100 }),
]);
// دمج + ترتيب بالـ timestamp تصاعديًا
```

> ⚠️ **`allSettled` مش `all`** — أداة واقعة مالهاش تخفي تاريخ الأداتين
> التانيين. والمصدر الفاشل بيتعرض **بالاسم** في بانر: «تعذّر جلب سجل
> التغليف» — «مفيش تغليف» و«معرفناش نجيب التغليف» حاجتين مختلفتين تمامًا.

> ⚠️ **`getLogs` بيستبعد `login`/`logout` في SQL** — ده صح هنا، إحنا عايزين
> الأفعال.

> ⚠️ **`search` بيقارن `order_name LIKE %x%`** — يعني `#5362` هيطابق `#53621`
> كمان. اعرض رقم الأوردر في كل صف، وفلتر بالمطابقة التامة في الواجهة.

### العرض

```
🔎  #53621

  12:11 مساءً   🖨  طباعة S1        Ahmed_Ibraheem
  12:40 مساءً   📦  تغليف S1        Abo_Selim        ٤ قطع
  01:02 صباحاً  🗑  حذف منتج        Saif             "عطلان" — قميص أزرق M
```

**الحدود المعروفة — تتكتب في About الصفحة:**

- بيعرض التلات أدوات بس. صفوف `metafields_change` (اللي الطابعة والحذف
  بيكتبوها تحتها بـ `extra.source`) **مش معروضة** — محتاجة مصدر رابع.
- سقف ١٠٠ صف لكل أداة — كافي لأوردر واحد بفارق كبير.

**Tier: M (1200px)** — جدول واحد بسيط.

---

## ⑪ النشر

```
① اعمل الريبو: ecommoda-dev/Warehouse-Operations-Center (Public — قرار #4)
② Settings → Pages → Source: Deploy from a branch → main / (root)
③ استنى أول build → افتح الرابط واتأكد إنه بيفتح شاشة الدخول
④ الصق WORKER SECRET (سر مجموعة warehouse_ops) مرة واحدة على كل جهاز
```

**صفر شغل على Cloudflare:**

| | مطلوب؟ |
|---|---|
| Worker جديد | ❌ |
| `wrangler.toml` | ❌ |
| ربط Builds | ❌ |
| Promote | ❌ |
| تعديل CORS | ❌ — التلاتة بيسمحوا `https://ecommoda-dev.github.io` **على مستوى الدومين**، والمسار مش جزء من الـ Origin |

> ✅ **الحاجة الوحيدة اللي بتتعمل مرة واحدة لكل جهاز:** لصق السر. ولو الجهاز
> اتعمل عليه المرحلة ٠ خلاص، ممكن تنسخه من مفتاح قديم على نفس الـ origin:
> ```js
> localStorage.setItem('warehouse_ops_worker_secret',
>                      localStorage.getItem('pack_checker_worker_secret'));
> ```

---

## ⑫ فحص Step 9 — إلزامي على كل صفحة

`ecommoda-html-builder` Step 9 **أمر بيتنفّذ مش checklist بيتقرا**. نفّذه على
الخمس صفحات:

```bash
for F in index.html print.html pack.html remove.html journey.html; do
  echo "═══════════ $F ═══════════"
  grep -n "z-index" "$F"                      # login 500 · modals 600 · toast 9999 · محتوى ≤200
  grep -c "ar-EG" "$F"                        # = 0
  grep -c 'class="container"' "$F"            # ≥ 1
  grep -n "container-max:" "$F"               # 1040 أو 1200 أو 1400 بس
  grep -c "class=\"main-seg" "$F"             # = 0
  grep -c "settingsModal" "$F"                # = 0  (الاسم الصح settingsOverlay)
  grep -c "TOOL_VERSION" "$F"                 # ≥ 1
  grep -c "MIN_WORKER_VERSION\|WOC_WORKERS" "$F"  # ≥ 1
  grep -c "cmpVersion" "$F"                   # ≥ 1
  grep -n "!== TOOL_VERSION" "$F"             # فاضي
  grep -c "document.contains(e.target)" "$F"  # ≥1 لو فيه multi-select
  grep -c "ms-ftr-top" "$F"                   # ≥1 لو فيه multi-select
  grep -c "class=\"ms-ftr\"" "$F"             # = 0
  grep -n "rangeFrom !== null\|rangeTo !== null" "$F"   # فاضي
  grep -c "نتائج الفلتر" "$F"                 # = 0
  grep -c "log-entry\"" "$F"                  # = 0
  grep -o ">⇅<" "$F" | wc -l                  # = 0
  grep -c "IBM Plex" "$F"                     # = 0
  grep -nE 'var\(--(font|mono|text|text-sub|accent-bg|accent-b)\)' "$F"   # فاضي
  grep -n "rows.sort(\|entries.sort(" "$F"    # فاضي — [...rows].sort()
  grep -n "createdAt\.slice(" "$F"            # فاضي — cairoDayStr(toCairo(...))
  grep -c "<!-- skills:" "$F"                 # = 1
  # صفر hex حرفي خارج :root
  awk '/:root[[:space:]]*\{/{r=1} r&&/\}/{r=0;next} \
       !r && /(color|background|border|fill|stroke|shadow|outline)[^;{]*#[0-9a-fA-F]{3}/ \
       {print FILENAME":"FNR": "$0}' "$F"
done

echo "═══════════ shared/ ═══════════"
grep -n "z-index" shared/shell.css
grep -c -- "--on-accent:"     shared/shell.css   # = 1
grep -c -- "--accent-border:" shared/shell.css   # = 1
grep -c -- "--font-mono:"     shared/shell.css   # = 1
grep -c "IBM Plex"            shared/shell.css   # = 0
```

### فحوصات إضافية خاصة بالهب

```bash
echo "── الاستثناءان: sessionStorage للجلسة بس، ومفيش localStorage للهوية ──"
grep -rn "localStorage" --include="*.html" --include="*.js" . | grep -iv "LS_SECRET\|warehouse_ops_worker_secret\|removeItem"
# لازم يرجّع فاضي — السر هو الوحيد في localStorage

grep -rc "currentEmployee" --include="*.html" . | grep -v ":0"
grep -rn "localStorage.*currentEmployee\|currentEmployee.*localStorage" .
# لازم فاضي — الهوية في sessionStorage مش localStorage

echo "── حارس الجلسة في كل صفحة محمية ──"
for F in print.html pack.html remove.html journey.html; do
  printf '%-14s requireSession=%s\n' "$F" "$(grep -c 'requireSession()' $F)"   # لازم ≥1
done
grep -c "requireSession()" index.html    # لازم = 0 — دي شاشة الدخول نفسها

echo "── التوكنز مش متكرّرة: :root في الـ shell بس ──"
grep -c ":root" shared/shell.css                        # = 1
grep -c ":root" index.html print.html pack.html remove.html journey.html
# كل واحدة = 0، إلا remove.html ممكن = 1 لو بتعرّف --container-max بس

echo "── مفيش Promise.all على دفعة الطباعة (R15) ──"
grep -n "Promise.all" print.html | grep -i "invoice\|track\|print"   # لازم فاضي
grep -c "mapLimit" print.html                                        # ≥1
grep -c "PRINT_CONCURRENCY" print.html                               # ≥1

echo "── next= مفحوص قبل التحويل ──"
grep -n "next" index.html | grep -c "test(\|/\^\["                   # ≥1
```

**قاعدة القرار:** أي نتيجة مخالفة → **قف. أصلح. أعد التنفيذ.** ممنوع تسليم
والـ audit فاشل.

---

## ⑬ التوثيق

### `CLAUDE.md` للريبو الجديد — الأقسام الإلزامية

```
# مركز عمليات المخزن (Warehouse-Operations-Center)
  الهوية والثوابت · الروابط · جدول الصفحات والـ Workers
  🔴 الاستثناءان المعتمدان (بند ١ وبند ٥) — بالنص والمبرر
  عقد sessionStorage (المفاتيح والشكل والـ TTL)
  🔴 قاعدة الأسبقية: shell.css أولاً، ستايل الصفحة بيغلب
  🔴 shared/shell.js نسخة واحدة — ممنوع تتنسخ في صفحة
  🔴 القايمة السودا: الدوال اللي ممنوع تدخل الـ shell (١٥ دالة)
  مجموعة السر warehouse_ops
  ثلاث MIN_WORKER_VERSION مستقلة
  فخاخ كل صفحة (منقولة من CLAUDE.md بتاع كل أداة)
  بصمة المهارات
```

### الفخاخ اللي **لازم** تتنقل من الأدوات القديمة

| من | الفخ |
|---|---|
| الطابعة | ⛔ `Promise.all` على دفعة الطباعة · `mapLimit` هو اللي بيمنع فشل الدفعة (R15) |
| الطابعة | `getAccessToken` متكاش — متلغيهوش، الفرع الصح `invalidateAccessToken()` على 401 |
| الطابعة | `ZONE_FILTER` بيفلتر — والأوردر اللي مالوش `zone` **بيتستبعد هو كمان** |
| الطابعة | `Delivered` حالة نهائية · `/track` بيرجّع ٣ حالات، الأصفر **مش نجاح** |
| الطابعة | ألوان الفاتورة حرفية — استثناء موثّق من #35، مستند الـ iframe مالوش `:root` |
| التغليف | `evaluatePackGuard` المصدر الوحيد لكشف «اتغلّف قبل كده» |
| التغليف | `classifyS2Subtype` و§BOSTA في مكانين — راجع الخطر المفتوح |
| التغليف | «الوقت منذ الطباعة» بيتحسب بأيام تقويمية بتوقيت القاهرة مش ٢٤ ساعة |
| التغليف | النبضة مالهاش أي نداء شبكة · إعادة رسم الجدول فيها بتصفّر التمرير |
| التغليف | `rdyZoneInfo` بتتنادى مرة واحدة وقت بناء الصف |
| التغليف | أيقونة الطابعة SVG مش إيموجي — `🖨` مابيترسمش على أجهزة المخزن |
| الحذف | `restock: false` دفاع مزدوج · التأكيدان إلزاميان · `PENDING` بس |

### تحديث `ecommoda-html-builder` — بند ٤٠

```markdown
| 40 | أداة **هب** بتجمّع أكتر من أداة تحت رابط واحد | بند ١ (ملف واحد لكل أداة) وبند ٥ (`currentEmployee` في الذاكرة بس) مطبّقين حرفيًا — يعني الهب لازم يبقى ملف واحد، وده بيوصل ~١.٢ ميجا عند ٨ أدوات، وبيخلّي الهوية تضيع مع كل تنقّل | **استثناء للهب بس:** (أ) **متعدد الصفحات** — صفحة لكل أداة + `shared/shell.css` و`shared/shell.js` نسخة واحدة، وقاعدة الأسبقية «الـ shell أولاً وستايل الصفحة بيغلب» بتلغي الحاجة لحل تعارضات CSS. (ب) **الهوية في `sessionStorage`** — بتموت مع قفل التاب، لكل تاب لوحده، ومابتديش أي صلاحية جديدة (`employee` بيتبعت من العميل في كل كتابة أصلاً). البندان لسه ساريان بالكامل على الأدوات المستقلة. الحارس `requireSession()` في أول كل صفحة محمية، و**بيرمي** عشان يوقف باقي السكربت أثناء التحويل |
```

> ⚠️ **راجع `ecommoda-skill-versioning`** لتصنيف البند ورفع نسخة المهارة.

### `ecommoda-constants` §6

ضيف تحت مجموعة `warehouse_ops`: الواجهة بقت منشورة، ومفتاح `localStorage`
الفعلي `warehouse_ops_worker_secret`.

---

## ⑭ خطة الاختبار الحية

### أ) قبل ما المخزن يشوفها

| # | الاختبار | المطلوب |
|---|---|---|
| ١ | افتح الرابط بلا سر | شاشة الدخول + زرار الإعدادات جوّه الكارت (Standards #4) |
| ٢ | الصق السر → دخول بـ PIN | صف `warehouse_ops_center` / `login` في D1 **باسم الهب** — لو طلع `pack_checker` يبقى §⓪ب ما اتعملش |
| ٣ | الشاشة الرئيسية | العددين بأرقام حقيقية + ختم الوقت |
| ٤ | ريفريش الصفحة | **فاضل داخل** (فرق مقصود عن الأدوات القديمة) |
| ٥ | اقفل التاب وافتح الرابط | شاشة الدخول تاني |
| ٦ | افتح `pack.html` مباشرة بلا جلسة | تحويل لـ `index.html?next=pack.html`، وبعد الدخول بيروح للتغليف |
| ٧ | `index.html?next=https://example.com` | **مايحوّلش** — بيروح للرئيسية |
| ٨ | خروج | صف `logout` + الجلسة والكاش اتمسحوا |

### ب) المسارات التشغيلية

| # | الاختبار | المطلوب |
|---|---|---|
| ٩ | طباعة أوردر واحد | صف `order_printer`/`S1` بالموظف الصح · الحالة `Ready` |
| ١٠ | اطبع نفس الأوردر تاني فورًا | **نافذة التحذير** بالاسم والوقت والموظف |
| ١١ | «اطبع الباقيين» على دفعة فيها متكرر | المتكرر **ما اتطبعش**، الباقي اتطبع |
| ١٢ | دفعة ٢٠+ أوردر | `mapLimit` شغّال · فشل واحد مايلغيش الدفعة · نافذة النتايج بالتفاصيل |
| ١٣ | سكانر شوبيفاي في التغليف | شاشة التشييك بتفتح · الفوكس صح |
| ١٤ | سكانر بوسطة | شريط المصدر الأحمر بالتراكينج الصح |
| ١٥ | تغليف كامل | صف `pack_checker`/`packed` + `stage`/`items` · الأوردر خرج من الطابور |
| ١٦ | غلّف نفس الأوردر تاني | `409` + النافذة الحمرا (`btn-red`) |
| ١٧ | «عطلان» من الطابور | `remove.html` بتفتح **على الأوردر** + زرار الرجوع |
| ١٨ | «إعادة 🖨» من الطابور | `print.html` مفلترة على الأوردر · **ماطبعتش لوحدها** |
| ١٩ | حذف بند فعلي | التأكيدان مطلوبان · صف `remove_item` + صف `metafields_change` |
| ٢٠ | رحلة الأوردر لأوردر عدّى بالتلاتة | التلات صفوف بالترتيب الزمني الصح |
| ٢١ | رحلة أوردر وWorker واحد واقع | البانر بيسمّي المصدر الفاشل · الباقي بيتعرض |

### ج) 🔴 اختبار الجهازين — ده اللي التجربة كلها عشانه

| # | الاختبار | المطلوب |
|---|---|---|
| ٢٢ | جهازين · موظفين مختلفين · دخول متزامن | كل جهاز شايف اسمه هو |
| ٢٣ | الاتنين يغلّفوا نفس الأوردر | التاني ياخد `409` + النافذة — **مفيش تغليف مزدوج في D1** |
| ٢٤ | A يحذف بند و B بيغلّف نفس الأوردر | B ياخد تحذير «الأوردر اتعدّل بين ما فتحته وما ضغطت تم» |
| ٢٥ | الاتنين «طباعة الكل» في نفس الوقت | التاني يشوف نافذة التحذير بأوردرات الأول |
| ٢٦ | A غلّف · B بيرجع لشاشة الطابور | طابور B اتحدّث (`rdyDirty` + `rdyRefreshIfDirty`) |

> 🔴 **اختبار ٢٣ هو المحك.** لو التغليف المزدوج عدّى، `evaluatePackGuard`
> مكسور — **وقف التجربة الحية فورًا**، ده الحارس اللي اتكتب عشان ٣ حالات
> تغليف مزدوج حقيقية حصلت (#43277 · #45227 · #47507).

### التحقق من D1 بعد التجربة

```sql
SELECT tool, type, COUNT(*) AS n, MAX(timestamp) AS last_ts FROM logs WHERE tool IN ('warehouse_ops_center','order_printer','pack_checker','order_item_remover') GROUP BY tool, type ORDER BY tool, n DESC;
```

**المتوقع:** `warehouse_ops_center`/`login` بيزيد · `order_printer`/`login` و
`pack_checker`/`login` **واقفين عند رقمهم** · صفوف الأفعال بتزيد تحت أسمائها
التاريخية.

**خط الأساس (05-09-2026 ~١٠:٠٠ UTC):**

```
order_printer      | S1 4293 | S2 191 | login 16
pack_checker       | packed 7727 | login 300
order_item_remover | remove_item 29 | login 12
```

---

## ⑮ ترتيب التنفيذ في الجلسة

الجلسة كبيرة — **اعمل commit بعد كل مرحلة** عشان مفيش شغل يضيع.

```
① الريبو + .gitignore + هيكل المجلدات + shared/shell.css
        ↓ commit: "shell: tokens + chrome CSS"
② shared/shell.js (الجلسة + API + helpers + الهيدر)
        ↓ commit: "shell: session, api factory, shared helpers"
③ index.html — الدخول + الشاشة الرئيسية + الأعداد
        ↓ commit  ·  🔴 نقطة تحقق: اختبارات ١ → ٨ لازم تعدّي هنا
④ print.html + تحذير الطباعة المزدوجة + ?order=
        ↓ commit  ·  اختبارات ٩ → ١٢ · ١٨
⑤ pack.html + زراري «خيارات» الداخلية
        ↓ commit  ·  اختبارات ١٣ → ١٧ · ٢٦     ← أكبر صفحة، خدها لوحدها
⑥ remove.html + الفتح التلقائي
        ↓ commit  ·  اختبار ١٩
⑦ journey.html
        ↓ commit  ·  اختبارات ٢٠ → ٢١
⑧ فحص Step 9 على الخمس صفحات + الفحوصات الخاصة بالهب
        ↓ 🔴 أي مخالفة → قف وأصلح
⑨ CLAUDE.md + README.md + بصمة المهارات
        ↓ commit + push
⑩ GitHub Pages + لصق السر + اختبار الجهازين (٢٢ → ٢٦)
```

> 🔴 **نقطة التحقق في ③ مش اختيارية.** لو الجلسة والحارس والأعداد مش شغّالين
> صح، الأربع صفحات اللي بعدها كلها هتتبني على أساس مكسور.

> ⚠️ **⑤ أكبر خطوة** (٢١٥ KB ونقل `§READY-JS` كامل). لو الجلسة قرّبت تخلص،
> اقفل عند ④ واعمل push — الهب بصفحتين شغّال وقابل للتجربة، والباقي يكمّل في
> جلسة تانية على نفس الفرع.

---

## ⑯ المخاطر — واللي بيقللها

| # | الخطر | التقليل |
|---|---|---|
| 🔴 ١ | `shell.js` يتنسخ في صفحة بدل ما يتضمّن → يتفرّق | قاعدة في `CLAUDE.md` + فحص `grep -c ":root"` في الصفحات = 0 |
| 🔴 ٢ | دالة من القايمة السودا تدخل الـ shell → تكسر صفحة تانية بصمت | القايمة مكتوبة بالاسم في `CLAUDE.md` + §⑤ |
| 🟡 ٣ | فوكس السكانر يتكسر في النقل | صفحة مستقلة = نفس سلوك النهاردة · اختبار ١٣ و١٤ |
| 🟡 ٤ | كاش الطابور يعرض قديم من غير ما يبان | ختم وقت **إلزامي** مع كل رسم من الكاش + جلب خلفي فوق ١٥ دقيقة |
| 🟡 ٥ | `?order=` يوصل لطباعة تلقائية | الباراميتر بيفلتر ويحدد بس — مكتوب كقاعدة |
| 🟡 ٦ | تحذير الطباعة يمنع الشغل عند فشل الفحص | `catch` بيكمّل الطباعة + توست |
| 🟢 ٧ | `classifyS2Subtype` و§BOSTA لسه في مكانين | **الهب مابيحلهوش** — في الـ Workers مش الواجهة. بند مفتوح موروث |

---

## ⑰ اللي **مش** في الإصدار الأول — بقرار

- ❌ **الأدوات القديمة ماتتحولش لصفحات تحويل** — نقطة الرجوع لازم تفضل شغّالة طول التجربة.
- ❌ **باقي أدوات المخزن ما تتنقلش** (سكانرات بوسطة · AWB · الجرد) — ولا حتى كلينكات خارجية: لينك خارج الهب بيكسر «رابط واحد ميطلعش منه».
- ❌ **مفيش «وضع محطة»** ولا فلتر منطقة افتراضي — قرارك الصريح: كل موظف يدخل ويشتغل في أي حاجة.
- ❌ **مفيش توحيد لـ CSS الجداول** بين الصفحات — قاعدة الأسبقية بتخلّي كل صفحة بجدولها. توحيدها تمريرة منفصلة لو التكرار كبر.
- ❌ **مفيش session token موقّع** — الهوية لسه من العميل، زي النهاردة بالظبط.
- ❌ **مفيش `metafields_change` في رحلة الأوردر** — محتاج مصدر رابع.

---

**آخر تحديث:** 05-09-2026

</div>
