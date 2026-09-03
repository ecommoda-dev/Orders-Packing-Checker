<div dir="rtl" style="text-align: right;">

# Orders Packing Checker — EcomModa

![version](https://img.shields.io/badge/version-v2.0.0-blue)

أداة تشييك تغليف الأوردرات: الموظف بيسكن باركود الأوردر، الأداة بتجيب منتجاته
من Shopify، بيشيّك عليها قطعة قطعة، وبتسجّل التغليف على الأوردر
(ميتافيلد + tag + سجل D1).

| | |
|---|---|
| الواجهة | https://ecommoda-dev.github.io/Orders-Packing-Checker/ |
| الـ Worker | `orders-packing-checker-worker` |
| النسخ | Worker `v2.0.0` · الواجهة `v2.0.0` |

## الملفات

| الملف | إيه ده |
|---|---|
| `index.js` | كود الـ Cloudflare Worker |
| `wrangler.toml` | اسم الـ Worker + الـ bindings + الـ vars |
| `index.html` | واجهة الأداة (GitHub Pages) |
| `CLAUDE.md` | قواعد الأداة وفخاخها وبصمة المهارات |

## النشر

النشر أوتوماتيك عبر **Cloudflare Workers Builds** على أي push لـ `main`،
والواجهة عبر **GitHub Pages** من نفس الفرع.

> ⛔ **ممنوع لصق كود في داشبورد Cloudflare بعد الربط** — أول push جاي بيمسحه.
> الريبو هو المصدر الوحيد.

بعد أي تعديل على `index.js`: **Deployments → Version History → ⋯ → Promote version**.
لو نسيت الـ Promote، الواجهة هتطلّع تحذير **⚠️ الـ Worker نسخة قديمة** في الهيدر
(حارس `MIN_WORKER_VERSION`)، وزرار **🩺 افحص الأداة والاتصالات** في الإعدادات
بيقولك أنهي متغيّر أو صلاحية ناقصة.

التفاصيل الكاملة (الأسرار · الـ Promote · فخاخ النشر) في `CLAUDE.md`
وفي مهارة `ecommoda-tool-migration-playbook`.

</div>
