# أداة تشييك تغليف الأوردرات — Pack Checker (`Orders-Packing-Checker`)

**بتعمل إيه:** الموظف بيسكن باركود الأوردر، الأداة بتجيب منتجاته من Shopify،
بيشيّك عليها قطعة قطعة، وبتسجّل التغليف على الأوردر (ميتافيلد + tag + D1).
**مين بيستخدمها:** المخزن (التغليف)
**الإصدار:** Worker `v1.5.0` · الواجهة `v1.7.1`   ← الاتنين مستقلين، طبيعي يختلفوا

## الروابط

```
الواجهة    : https://ecommoda-dev.github.io/Orders-Packing-Checker/
الـ Worker : https://orders-packing-checker-worker.ecommoda-dev.workers.dev
اسم الـ Worker في الداشبورد: orders-packing-checker-worker   ← مطابق لـ name في wrangler.toml
```

## الـ Endpoints

| `?action=` | بيعمل إيه |
|---|---|
| `get_order` | يجيب الأوردر (بالـ id أو الـ name)، يحدّد المرحلة S1/S2، ويصنّف المنتجات |
| `complete_pack` | يكتب `s1/s2_packed_by` + `s1/s2_packing_date_time`، يضيف tag `S1=Packed`/`S2=Packed`، ويسجّل في D1 |
| `check_employee` · `register_pin` · `verify_employee` · `log_logout` · `get_employees` | البلوك المشترك للدخول |
| `get_logs` · `get_logs_count` · `get_logs_export` | سجل العمليات |

## D1

```
tool  : pack_checker
type  : packed · login · logout
```

> `logout` مسجّلة في `ecommoda-constants` §7 وموجودة في الكود، بس **صفر صف
> في D1** لحد 03-09-2026 — يعني الواجهة ما بتناديش `log_logout` عمليًا، مش
> إن القيمة غلط.

**أعمدة إضافية في `logs` بتتكتب من الأداة دي** (مش جداول زيادة — نفس جدول
`logs` المشترك): `stage` · `item_count` · `items` · `edit_reason`.
بتتكتب في `UPDATE` منفصل **بعد** `writeLog` مباشرةً، والمطابقة بتحصل بـ
`(tool, type, order_name, timestamp)`. عمود `items` هو مصدر كشف التغيير
(fingerprint) في `get_order` — لو اتكسر، الأداة هتقول "اتغلّف قبل كده" غلط.

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
| **var بيفشل بصوت عالي لو غاب** | `SHOP_DOMAIN` — كل نداء Shopify بيروح على `https://undefined/...` → `Shopify OAuth failed` |
| **var ليه fallback (الخطر الصامت)** | ✅ **لا شيء** — مفيش أي `env.X \|\| ...` في الكود |

> يعني الأداة دي **مالهاش** الفخ السادس بشكله الكلاسيكي (قيمة ضايعة بترجّع
> صفر نتايج بصمت). أي متغيّر ناقص هنا بيطلّع رسالة خطأ صريحة.

## CORS

`ALLOWED_ORIGINS` **صارمة** (مش wildcard) — لأن الأداة **أداة كتابة**
(بتكتب ميتافيلدات وtags على أوردرات حية).

## خط الأساس قبل النقل

> مستنتج من D1 (ما اتداش يدويًا) — قراءة يوم 03-09-2026:

```
tool = 'pack_checker'
  packed : 7,534 صف   (18-05-2026 → 02-09-2026)
  login  :   277 صف   (17-05-2026 → 02-09-2026)
  logout :     0 صف
```

استعلام المقارنة بعد النقل (سطر واحد للّصق في D1 Console):

```sql
SELECT type, COUNT(*) AS n, MAX(timestamp) AS last_ts FROM logs WHERE tool = 'pack_checker' GROUP BY type;
```

## فخاخ الأداة دي

- **الـ `UPDATE` بعد `writeLog` بيطابق بالـ `timestamp` بالظبط.** لو حد غيّر
  `writeLog` بحيث يحط timestamp من عنده بدل الممرَّر، الأعمدة الأربعة
  (`stage` · `item_count` · `items` · `edit_reason`) هتفضل `NULL` **من غير أي
  خطأ** — والسجل هيبان ناجح. وقتها كشف التغيير بيقع كله.
- **كشف التغيير معتمد على نص `items` المخزَّن** بصيغة `SKU ×qty` مفصولة بفاصلة،
  وبيتقري بـ regex في `parseSavedItemsString`. أي تغيير في صيغة `itemSummary`
  في `complete_pack` بيكسر المقارنة في `get_order` — **الملفّين لازم يتغيّروا مع بعض.**
- **`fulfillableQuantity` هو مصدر الحقيقة الوحيد** لتصنيف المنتجات من v1.5.0.
  متضفش فلترة يدوية على الـ refunds تاني — ده بالظبط اللي اتشال في v1.5.0
  لأنه كان بيستبعد قطع لسه قابلة للشحن بعد partial refund.
- **الأداة بتقرا `custom.manual_status` و`custom.status_2_r_e`** — أي تعديل على
  نصوص الحالات مكانه `ecommoda-order-lifecycle`، والقيم هنا (`S1_VALUES` ·
  `S2_VALUES`) لازم تتطابق معاها.

## استرجاع النسخ القديمة

> ده بديل الـ tags — دفع الـ tags ممنوع من جلسات Claude Code السحابية.

```
النسخ المرقّمة الخمسة (3.html · 4.html · 5.html · Index-v1.1.2.html · Index-v1.1.3.html)
محفوظة كلها في commit: de523364b8d06f42c4ba8984a0b711603b308dcd

git show de52336:3.html
git show de52336:Index-v1.1.3.html
```

`5.html` (نسخة الواجهة الحالية) محفوظة كمان في آخر commit قبل النقل:
`d2a5dd8b22a180e7be3eee951e35263677b54787`.

## بصمة المهارات

| المهارة | الإصدار وقت آخر تعديل |
|---|---|
| ecommoda-worker-builder | v2.0.0 |
| ecommoda-html-builder | v6.2.0 |
| ecommoda-constants | v1.4.3 |
| ecommoda-order-lifecycle | v1.2.0 |
| shopify-graphql-helper | v1.0.0 |

آخر مطابقة: 03-09-2026 · `index.js` v1.5.0 · `index.html` v1.7.1

🔴 معلّقة:
- **الدومين المهجور `https://ecommoda24.github.io` لسه في `ALLOWED_ORIGINS`**
  — وهو كمان `ALLOWED_ORIGINS[0]`، يعني **قيمة الـ fallback** في `getCORS()`:
  أي origin غير معروف بياخد ترويسة CORS بدومين مهجور.
  (`ecommoda-constants` §5 و§11 بند 10 — الأداة دي مذكورة بالاسم هناك.)
  **اتأجّل بوعي:** النقل بينقل `index.js` بايت ببايت من كلاودفلير، وأي تعديل
  كود في نفس الـ PR بيبطّل إثبات إن النقل نضيف. يتعمل في PR منفصل بعد ما
  البناء يثبت.

## مسائل مفتوحة

- **Build watch paths لسه `*` (الافتراضي)** — يعني أي تعديل على `index.html`
  بينشر الـ Worker تاني بنفس الكود. التضييق لـ `index.js` + `wrangler.toml`
  (`ecommoda-tool-migration-playbook` §13-ب) لسه ما اتعملش. لو اتعمل، **لازم**
  يتوثّق هنا — وأي ملف جديد يعتمد عليه الـ Worker يتضاف للقايمة، وإلا هيتجمّد بصمت.
- **`ADMIN_WORKER_URL` لسه بيتقري من `localStorage`** (مفتاح `admin_worker_url`)
  بدل ما يبقى ثابت في `§CONFIG` — `ecommoda-constants` §5b. مؤجَّل لأول مرة
  الواجهة تتفتح لسبب حقيقي.
- **الواجهة فيها `MIN_WORKER_VERSION`؟** لسه ما اتفحصتش. لو المقارنة حرفية بين
  نسخة الـ Worker ونسخة الـ HTML، دي بتولّع تحذير كاذب دايم
  (`ecommoda-html-builder` Step 3C).

---

آخر تحديث: 03-09-2026 — إنشاء الملف مع نقل الأداة لـ Git.
