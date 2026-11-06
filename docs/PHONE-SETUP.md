# إعداد MEGO Nutrition Hub من الهاتف فقط — Phone-only setup (free)

> **مجاني بالكامل:** GitHub Pages + Google Apps Script + Google Sheets + الفئة المجانية من Gemini API. لا بطاقة دفع، لا اشتراك، لا فوترة.
> **Completely free:** GitHub Pages + Google Apps Script + Google Sheets + the Gemini API free tier. No card, no subscription, no billing.
>
> كل ما يلي يحتاج حسابك في Google (**ahmedmego967@gmail.com**) لذلك لا يمكنني فعله نيابةً عنك. كل الباقي يحدث تلقائيًا:
> تحويل ملف Excel إلى Google Sheet، التحقق من الـ 160 طعامًا، الترحيل، الاستيراد والرفع.
> Everything below needs your Google account, so only you can do it. Everything else is automatic.

## ⚡ الطريقة التلقائية من اللابتوب (موصى بها) · Automatic laptop setup (recommended)

على لابتوب عليه Node.js 18+ وحسابك في Google مفتوح في المتصفح: / On a laptop with Node.js 18+:

```bash
git clone -b claude/nutrition-tracking-app-989rku https://github.com/Mego2012/Mego.git && cd Mego
node scripts/laptop-setup.mjs
```

يقوم بكل شيء: إنشاء مشروع Apps Script في Drive الخاص بك، رفع الكود، النشر، تحويل ملف Excel إلى Google Sheet (الأصل لا يُمس)،
التحقق من كل الأطعمة، اختبار حي للمزامنة في الاتجاهين، مفتاح Gemini المجاني (اختياري) مع اختبار صورة حقيقي، ثم رمز QR يربط هاتفك.
أنت تضغط فقط على شاشات Google الخاصة بالسماح: «Allow» لتسجيل الدخول، مفتاح «Google Apps Script API» (مرة واحدة)، وأذونات السكربت (مرة واحدة).
It does everything; you only click Google's own permission screens. Re-run any time with `--test` for the live checks.

## 1) إنشاء الخادم المجاني (≈ 5 دقائق، مرة واحدة) · Create the free backend (once)

1. في **Chrome**: افتح `script.google.com` ← ⋮ ← فعّل **Desktop site / موقع لسطح المكتب** ← سجّل الدخول بـ **ahmedmego967@gmail.com** ← **New project / مشروع جديد**.
2. في تطبيق **MEGO**: الإعدادات ← قسم **إعداد الخادم** ← اضغط **📋 Code.gs** ← ارجع لـ Chrome ← احذف كل النص في `Code.gs` ← الصق.
3. في Apps Script: ⚙️ **Project Settings** ← فعّل **Show "appsscript.json"** ← ارجع للمحرر ← افتح `appsscript.json` ← احذف محتواه ← في MEGO اضغط **📋 appsscript.json** ← الصق ← 💾 **Save**.
4. **Deploy ← New deployment** ← ⚙️ النوع **Web app** ← Execute as: **Me** ← Who has access: **Anyone** ← **Deploy** ←
   **Authorize access** ← اختر حسابك ← **Advanced / متقدم** ← **Go to project (unsafe)** ← **Allow / السماح**.
   (التحذير طبيعي: السكربت خاص بك ولم يُنشر للعامة.)
5. أعلى المحرر اختر الدالة **installMego** ← **Run ▶**. تقوم تلقائيًا بـ:
   - إنشاء رمز سري خاص بك.
   - **تحويل ملف Excel إلى Google Sheet أصلي** في نفس المجلد (ملف Excel الأصلي **لا يُعدَّل ولا يُعاد تسميته ولا يُحذف** — يبقى نسخة احتياطية).
   - **التحقق** من الملف الجديد (تبويب الأطعمة وعدد الأطعمة والأرقام) — لا يتم التبديل إليه إلا بعد نجاح التحقق.
   - نسخة احتياطية في Drive ثم إضافة التبويبات المنظمة ولوحة التحكم. لا تتغير أي قيمة طعام.
6. افتح **Execution log / سجل التنفيذ** وانسخ السطر الذي يبدأ بـ **`MEGO1|`** (اضغط مطولًا ← نسخ). **لا تشاركه مع أحد.**
7. في MEGO: الإعدادات ← **رمز الاتصال** ← الصق. التطبيق تلقائيًا:
   يتصل ← يقارن أطعمة الـ Hub مع الـ 160 طعامًا على هاتفك ← (إذا لم يوجد اختلاف) يستورد معرّفات الأطعمة ويرفع كل سجلاتك.
   إذا وُجد أي اختلاف في القيم **يتوقف** ويعرضه عليك — لا يُستبدل شيء دون موافقتك. بيانات هاتفك لا تُحذف أبدًا؛ والأحدث يبقى دائمًا.

## 2) تفعيل ماسح الوجبات المجاني (اختياري، دقيقتان) · Free AI meal scanner (optional)

1. في Chrome افتح `aistudio.google.com/apikey` ← سجّل الدخول ← **Create API key** ← انسخ المفتاح (يبدأ بـ `AIza`).
   **لا تضغط «Set up billing» أبدًا.** المفتاح بدون فوترة يعمل على الفئة المجانية فقط ولا يمكن أن يُحاسَب. الانتقال للمدفوع يتطلب ربط حساب فوترة **ودفعًا مسبقًا** يدويًا.
2. في MEGO: الإعدادات ← **ماسح الوجبات الذكي — مجاني** ← الصق المفتاح ← **تحقق واحفظ المفتاح في خادمي**.
   يتحقق خادمك من المفتاح لدى Google ثم يحفظه في **Script Properties** فقط — لا يبقى على الهاتف ولا في GitHub.
3. جرّب: الرئيسية ← **📷 التقط صورة** ← **حلّل الصورة** ← راجع ← **تأكيد وإضافة لليوميات**.

**ملاحظات الفئة المجانية:** النموذج `gemini-3.8-flash` (أقوى نموذج Flash مجاني). عند نفاد الحصة اليومية تظهر رسالة بموعد التجدد
(منتصف الليل بتوقيت المحيط الهادئ = 11:00 صباحًا بتوقيت السعودية شتاءً، 10:00 صيفًا). لا يوجد نموذج بديل مدفوع إطلاقًا.
**الخصوصية:** في الفئة المجانية قد تستخدم Google الطلبات لتحسين منتجاتها وقد يراها مراجعون بشريون (بعد فصلها عن حسابك). لذلك يُرسل
فقط صورة الوجبة (بدون الموقع/EXIF) وأسماء أطعمتك — لا وزن ولا يوميات ولا ملف شخصي. تجنّب ظهور أشخاص أو مستندات في الصورة.

## إذا حدث خطأ · Troubleshooting

| الرسالة | الحل |
| --- | --- |
| `unauthorized` | الرمز غير صحيح — شغّل **installMego** مرة أخرى وانسخ السطر `MEGO1|` من جديد |
| `WRONG_SPREADSHEET` | السكربت ليس سكربت MEGO — الصق Code.gs من زر النسخ في التطبيق |
| `VERIFY_FAILED` | التحويل لم ينجح في التحقق؛ لم يتم التبديل وملفك الأصلي كما هو — أرسل لي نص السجل |
| السطر `MEGO1|` غير موجود | لم يُنشر الـ Web app بعد — نفّذ الخطوة 4 ثم شغّل installMego مجددًا (لن يُحوِّل الملف مرة ثانية) |
| «خادمك إصدار قديم» | الصق Code.gs الجديد ← Deploy ← Manage deployments ← ✏️ ← Version: **New version** ← Deploy |
| «انتهت الحصة اليومية المجانية» | انتظر موعد التجدد المعروض — لا توجد أي رسوم |
| «رفضت Google مفتاح Gemini» | أنشئ مفتاحًا جديدًا في aistudio.google.com/apikey |
| لا تظهر دالة installMego | احفظ (💾) أولًا ثم حدّث الصفحة |
