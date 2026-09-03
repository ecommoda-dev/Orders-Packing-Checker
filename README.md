# Orders Packing Checker — EcomModa

أداة تشييك تغليف الأوردرات: الموظف بيسكن باركود الأوردر، الأداة بتجيب منتجاته
من Shopify، بيشيّك عليها قطعة قطعة، وبتسجّل التغليف على الأوردر
(ميتافيلد + tag + سجل D1).

| | |
|---|---|
| الواجهة | https://ecommoda-dev.github.io/Orders-Packing-Checker/ |
| الـ Worker | `orders-packing-checker-worker` |
| النسخ | Worker `v1.5.0` · الواجهة `v1.7.1` |

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

التفاصيل الكاملة (الأسرار · الـ Promote · فخاخ النشر) في `CLAUDE.md`
وفي مهارة `ecommoda-tool-migration-playbook`.
