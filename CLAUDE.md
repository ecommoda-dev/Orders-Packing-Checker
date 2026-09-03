<div dir="rtl" style="text-align: right;">

# أداة تشييك تغليف الأوردرات — Pack Checker (`Orders-Packing-Checker`)

![version](https://img.shields.io/badge/version-v2.0.0-blue)

**بتعمل إيه:** الموظف بيسكن باركود الأوردر، الأداة بتجيب منتجاته من Shopify،
بيشيّك عليها قطعة قطعة، وبتسجّل التغليف على الأوردر (ميتافيلد + tag + D1).
**مين بيستخدمها:** المخزن (التغليف)
**الإصدار:** Worker `v2.0.0` · الواجهة `v2.0.0`   ← الاتنين مستقلين، طبيعي يختلفوا

## الروابط

```
الواجهة    : https://ecommoda-dev.github.io/Orders-Packing-Checker/
الـ Worker : https://orders-packing-checker-worker.ecommoda-dev.workers.dev
اسم الـ Worker في الداشبورد: orders-packing-checker-worker   ← مطابق لـ name في wrangler.toml
```

## الـ Endpoints

| `?action=` | بيعمل إيه |
|---|---|
| `get_order` | يجيب الأوردر (بالـ id أو الـ name)، يحدّد المرحلة S1/S2، ويصنّف المنتجات. بيرجّع `truncated` لو الأوردر أكبر من اللي اتجاب |
| `complete_pack` | يكتب `s1/s2_packed_by` + `s1/s2_packing_date_time`، يضيف tag `S1=Packed`/`S2=Packed`، ويسجّل في D1. بيرجّع `status` (`success`/`warning`/`error`) + `actions[]` + `logged` |
| `diag` | فحص ذاتي بدون أي كتابة (متغيّرات · Origin · D1 · صلاحيات تطبيق شوبيفاي) — **مابيرجّعش قيمة أي سر** |
| `get_config` | `WORKER_VERSION` — الواجهة بتقارنه بـ `MIN_WORKER_VERSION` |
| `check_employee` · `register_pin` · `verify_employee` · `log_logout` · `get_employees` | البلوك المشترك للدخول |
| `get_logs` · `get_logs_count` · `get_logs_export` | سجل العمليات — فلترة server-side بقوايم + `dateFrom`/`dateTo` |

## D1

```
tool  : pack_checker
type  : packed · login · logout
```

**أعمدة إضافية في `logs` بتتكتب من الأداة دي** (مش جداول زيادة — نفس جدول
`logs` المشترك): `stage` · `item_count` · `items` · `edit_reason`.
بتتكتب في `UPDATE` منفصل **بعد** `writeLog` مباشرةً، والمطابقة بتحصل بـ
`(tool, type, order_name, timestamp)`.

> **من v2.0.0 الـ `UPDATE` ده بقى متحقَّق منه** (`meta.changes > 0`) — لو ما طابقش
> صف، الرد بيرجع `columnsWritten:false` و`status:'warning'` والواجهة بتعرض تحذير.
> وكمان: **كشف التغيير ماعادش معتمد على الأعمدة دي** — البصمة نفسها اتخزّنت في
> `extra.fingerprint` جوّه الـ `INSERT` الأصلي، فحتى لو الـ `UPDATE` فشل الكشف
> بيفضل شغّال.

`extra` بيتخزّن فيه: `stage` · `packedBy` · `packingDate` · `itemCount` · `items`
· `fingerprint` · `editReason` · **`result`** (`success`/`warning`) · `actions` ·
`warnings`. عمود «النتيجة» في تاب السجل بيقرا `extra.result`، والصفوف القديمة
اللي مفيهاش الحقل ده بتتعرض **"—" مش "✓"** — إحنا فعليًا مش عارفين.

> `edit_count` لسه في الـ schema للتوافق بس — **مابيتكتبش** من v1.3.0+.

## المضبوط فعليًا في الداشبورد

> اللي **متظبط بالفعل** — مش اللي المفروض يكون.

```
Bindings : DB → ecommoda-dev-logs
Secrets  : WORKER_SECRET · CLIENT_ID · CLIENT_SECRET
Vars     : SHOP_DOMAIN                       ← من [vars] في wrangler.toml
Build watch paths : * (الافتراضي) — لسه ما اتضيّقتش (راجع «مسائل مفتوحة»)
```

**تصنيف الـ `env.*` (إجراء §4-أ-٢ في `ecommoda-tool-migration-playbook`):**

| النوع | المتغيّرات |
|---|---|
| **سر** (قيمته مستحيلة القراءة) | `WORKER_SECRET` · `CLIENT_ID` · `CLIENT_SECRET` |
| **var بيفشل بصوت عالي لو غاب** | `SHOP_DOMAIN` |
| **var ليه fallback (الخطر الصامت)** | ✅ **لا شيء** — مفيش أي `env.X \|\| ...` في الكود |

> ومن v2.0.0 فيه `assertEnv(env, 'shopify')` قبل أي نداء شوبيفاي: أي متغيّر ناقص
> بيوقف العملية **برسالة باسمه**، و`?action=diag` بيعرض الأسماء والأطوال (مش القيم).

## CORS

`ALLOWED_ORIGINS` **صارمة** (مش wildcard) — لأن الأداة **أداة كتابة**
(بتكتب ميتافيلدات وtags على أوردرات حية).

```
https://ecommoda-dev.github.io   ← الوحيد
```

> الدومين المهجور `https://ecommoda24.github.io` **اتشال في v2.0.0**. كان
> `ALLOWED_ORIGINS[0]` يعني **قيمة الـ fallback** في `getCORS()`، فأي origin غير
> معروف كان بياخد ترويسة CORS بدومين مهجور. (`ecommoda-constants` §5 و§11 بند 10.)

## خط الأساس قبل النقل

> مستنتج من D1 (ما اتداش يدويًا) — قراءة يوم 03-09-2026:

```
tool = 'pack_checker'
  packed : 7,534 صف   (18-05-2026 → 02-09-2026)
  login  :   277 صف   (17-05-2026 → 02-09-2026)
  logout :     0 صف
```

> **سبب الصفر اتحدّد في v2.0.0:** مكانش فيه **زرار خروج في الواجهة خالص** —
> `log_logout` موجود في الـ Worker من الأول وما كانش بيتنادى. الزرار اتضاف
> (`doLogout()` في `§AUTH-JS`)، فالمتوقع الصف ده يبدأ يتملّي من دلوقتي.

استعلام المقارنة بعد النقل (سطر واحد للّصق في D1 Console):

```sql
SELECT type, COUNT(*) AS n, MAX(timestamp) AS last_ts FROM logs WHERE tool = 'pack_checker' GROUP BY type;
```

## فخاخ الأداة دي

- **الـ `UPDATE` بعد `writeLog` بيطابق بالـ `timestamp` بالظبط.** لو حد غيّر
  `writeLog` بحيث يحط timestamp من عنده بدل الممرَّر، المطابقة بتفشل. الفشل ده
  **بقى مسموع** من v2.0.0 (`columnsWritten:false` + `warning`)، وكشف التغيير
  محميّ منه لأنه بيقرا `extra.fingerprint` — بس عرض السجل هيبان ناقص.
- **صيغة `items` (`SKU ×qty` مفصولة بفاصلة) لسه مشتركة** بين `complete_pack`
  و`parseSavedItemsString` في `get_order` — **الملفّين لازم يتغيّروا مع بعض**.
  دلوقتي هي **fallback للصفوف القديمة بس**؛ الصفوف الجديدة بتتقارن بـ
  `extra.fingerprint`. ولو التحليل النصي فشل (منتج من غير SKU واسمه فيه فاصلة)
  النتيجة بقت "معرفناش" → `changeDetected = true` (الافتراضي الآمن).
- **`fulfillableQuantity` هو مصدر الحقيقة الوحيد** لتصنيف المنتجات من v1.5.0.
  متضفش فلترة يدوية على الـ refunds تاني. ومن v2.0.0 قطعة الاستبدال اللي ليها
  نظير في `lineItems` بتاخد كميتها من نفس المصدر — قبل كده الكمية كانت بتختلف
  حسب أنهي حلقة سبقت، فالبصمة كانت بتتغيّر من غير تغيير حقيقي.
- **الاتصالات مصفّحة، والقصّ بيتبلّغ.** `lineItems` و`returns` بيتصفّحوا لحد
  10 صفحات؛ أي بقايا (أو `exchangeLineItems` أكتر من 50) بترجع `truncated:true`
  والواجهة بتعرض بانر. **ممنوع** الرجوع لـ `first: 50` بلا تصفيح — البصمة
  بتتحسب على القايمة، فالقصّ الصامت = كشف تغيير غلط.
- **حقول مهجورة في الاستعلام (متحقَّق منها على schema 2026-01 يوم 03-09-2026):**
  `LineItem.fulfillableQuantity` · `ProductVariant.image` · `Product.featuredImage`
  كلهم `deprecated` بس شغّالين. **متستبدلهمش كتنضيف** — البدائل
  (`FulfillmentOrderLineItem.remainingQuantity` · `media` · `featuredMedia`) بتغيّر
  السلوك والدلالة، و`fulfillableQuantity` تحديدًا هو مصدر الحقيقة المعتمد للأداة.
- **الصلاحيات المطلوبة فعليًا:** `read_orders` · `write_orders` · `read_returns` ·
  `read_products` — و`?action=diag` بيفحصهم على `currentAppInstallation`.
- **الأداة بتقرا `custom.manual_status` و`custom.status_2_r_e`** — أي تعديل على
  نصوص الحالات مكانه `ecommoda-order-lifecycle`، والقيم هنا (`S1_VALUES` ·
  `S2_VALUES`) لازم تتطابق معاها. **`'Printed'` اتشالت في v2.0.0** — مش موجودة
  في أي من الـ choice lists.
- **الترتيب في تاب السجل بيشتغل على صفوف الصفحة المحمّلة بس** — الفلترة
  والتصفيح server-side. ده مقصود وموثّق في مودال الـ About.

## استرجاع النسخ القديمة

> ده بديل الـ tags — دفع الـ tags ممنوع من جلسات Claude Code السحابية.

```
النسخ المرقّمة الخمسة (3.html · 4.html · 5.html · Index-v1.1.2.html · Index-v1.1.3.html)
محفوظة كلها في commit: de523364b8d06f42c4ba8984a0b711603b308dcd

git show de52336:3.html
git show de52336:Index-v1.1.3.html
```

`5.html` (نسخة الواجهة قبل النقل) محفوظة كمان في آخر commit قبل النقل:
`d2a5dd8b22a180e7be3eee951e35263677b54787`.

نسخة الواجهة والـ Worker قبل مراجعة v2.0.0 محفوظة في: `f422be1`.

## بصمة المهارات

| المهارة | الإصدار وقت آخر تعديل |
|---|---|
| ecommoda-worker-builder | v2.0.0 |
| ecommoda-html-builder | v6.3.0 |
| ecommoda-constants | v1.4.3 |
| ecommoda-order-lifecycle | v1.2.0 |
| shopify-graphql-helper | v1.0.0 |

آخر مطابقة: 03-09-2026 · `index.js` v2.0.0 · `index.html` v2.0.0

## مسائل مفتوحة

- **Build watch paths لسه `*` (الافتراضي)** — يعني أي تعديل على `index.html`
  بينشر الـ Worker تاني بنفس الكود. التضييق لـ `index.js` + `wrangler.toml`
  (`ecommoda-tool-migration-playbook` §13-ب) لسه ما اتعملش. لو اتعمل، **لازم**
  يتوثّق هنا — وأي ملف جديد يعتمد عليه الـ Worker يتضاف للقايمة، وإلا هيتجمّد بصمت.
- **الترتيب في تاب السجل client-side على الصفحة** — لو احتجنا ترتيب على كل
  النتيجة، محتاج باراميتر `orderBy` في `getLogs` وده تعديل على البلوك المشترك
  `§SHARED` (يتعمل في المهارة الأول، مش في أداة واحدة).

### ✅ اتقفلت في v2.0.0

- ~~الدومين المهجور في `ALLOWED_ORIGINS`~~ — اتشال.
- ~~`ADMIN_WORKER_URL` بيتقري من `localStorage`~~ — بقى ثابت في `§CONFIG`، ومعاه
  `WORKER_URL`؛ الاتنين اتشالوا من شاشة الإعدادات (`ecommoda-constants` §5b ·
  Standards #28). السر بس هو اللي لسه في `localStorage`.
- ~~مفيش حارس توافق في الواجهة~~ — `MIN_WORKER_VERSION` + `cmpVersion()` +
  `checkWorkerVersion()` (حد أدنى رقمي، مش تطابق حرفي) + زرار `⚠️ الـ Worker نسخة قديمة`.
- ~~مفيش زرار خروج~~ — اتضاف، وبينادي `log_logout`.

</div>
