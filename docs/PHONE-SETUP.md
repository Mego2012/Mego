# إعداد MEGO Nutrition Hub من الهاتف فقط — Phone-only setup

> لا تحتاج كمبيوتر. ستحتاج تطبيق **Google Sheets** ومتصفح **Chrome** على هاتف Samsung.
> No computer needed — only the Google Sheets app and Chrome on your Samsung phone.

## الخطوة 1 — تحويل الملف (دقيقتان) · Step 1 — Convert the file

1. افتح تطبيق **Google Sheets** وسجّل الدخول بحساب **ahmedmego967@gmail.com** (مالك الملف).
2. افتح الملف **MEGO Nutrition Hub** (يظهر بجانبه وسم **XLSX**).
3. اضغط **⋮** (أعلى اليمين/اليسار) ← **حفظ بتنسيق جداول بيانات Google / Save as Google Sheets**.
4. سيُفتح ملف جديد بنفس الاسم **بدون** وسم XLSX — هذا هو الـ Hub الجديد. **لا تحذف الملف الأصلي ولا تعدّله**؛ يبقى نسخة احتياطية.
5. أرسل لي: **"تم التحويل"** — سأجد الملف الجديد بنفسي، وأتحقق من الـ 160 طعاماً، وأحدّث التطبيق والسكربت بالمعرّف الجديد.

*إذا لم يظهر الخيار في التطبيق:* افتح **Chrome** ← drive.google.com ← ⋮ في Chrome ← فعّل **موقع لسطح المكتب (Desktop site)** ← افتح الملف ← **ملف ← حفظ بتنسيق جداول بيانات Google**.

## الخطوة 2 — إنشاء الخادم (حوالي 7 دقائق، مرة واحدة) · Step 2 — Create the backend (once)

افعلها **بعد** أن أؤكد لك أنني حدّثت التطبيق بالمعرّف الجديد.

1. في تطبيق **MEGO**: الإعدادات ← **MEGO Nutrition Hub** ← قسم **إعداد الخادم**.
2. في **Chrome** افتح `script.google.com` ← ⋮ ← فعّل **Desktop site** ← سجّل بحساب ahmedmego967@gmail.com ← **مشروع جديد / New project**.
3. ارجع لتطبيق MEGO واضغط **📋 Code.gs** ← ارجع لـ Chrome ← احذف النص الموجود في `Code.gs` ← الصق.
4. في Apps Script: ⚙️ **إعدادات المشروع / Project Settings** ← فعّل **Show "appsscript.json"** ← افتح `appsscript.json` ← احذف محتواه ← في MEGO اضغط **📋 appsscript.json** ← الصق ← 💾 حفظ.
5. من القائمة أعلى المحرر اختر الدالة **setup** ← **تشغيل / Run** ← **مراجعة الأذونات** ← اختر الحساب ← **Advanced / متقدم** ← **Go to project (unsafe)** ← **السماح / Allow**.
   (التحذير طبيعي لأن السكربت خاص بك ولم يُنشر للعامة.)
6. افتح **سجل التنفيذ / Execution log** وانسخ **APP TOKEN** (سلسلة طويلة). **لا تشاركه مع أحد.**
7. اختر الدالة **migrateHub** ← **Run**. تنشئ نسخة احتياطية أولاً ثم تضيف التبويبات ولوحة التحكم وتقرير الترحيل. لا تغيّر أي قيمة طعام.
8. **Deploy / نشر** ← **New deployment / نشر جديد** ← ⚙️ النوع **Web app** ← Execute as: **Me** ← Who has access: **Anyone** ← **Deploy** ← انسخ **Web app URL** (ينتهي بـ `/exec`).
9. في MEGO: الإعدادات ← الصق **الرابط** و**الرمز** ← **حفظ + اختبار الاتصال**. يجب أن ترى «MEGO Nutrition Hub — المزامنة الكاملة في الاتجاهين مفعّلة».
10. اضغط **استيراد الأطعمة من الشيت** ثم **رفع كل البيانات**. بياناتك على الهاتف لا تُحذف؛ والقاعدة: السجل الأحدث يبقى دائماً.


## الخطوة 2ب — تفعيل ماسح الوجبات الذكي (اختياري، 3 دقائق) · Step 2b — Enable the AI meal scanner (optional)

المفتاح يبقى **فقط** داخل خادمك الخاص (Script Properties) — لا يوجد في التطبيق ولا في GitHub.
The key lives **only** in your private backend (Script Properties) — never in the app or on GitHub.

1. في Chrome افتح `console.anthropic.com` ← سجّل الدخول ← **Billing** أضف رصيدًا صغيرًا ← **API Keys** ← **Create Key** ← انسخ المفتاح (يبدأ بـ `sk-ant-`).
2. في Apps Script: ⚙️ **Project Settings / إعدادات المشروع** ← انزل إلى **Script Properties** ← **Add script property**
   - Property: `ANTHROPIC_API_KEY` — Value: المفتاح ← **Save script properties**.
3. (اختياري) `AI_DAILY_LIMIT` = عدد التحليلات المسموح يوميًا (الافتراضي 40) لحماية ميزانيتك.
4. إذا كنت نشرت الخادم قبل هذه الخطوة: شغّل **setup** مرة واحدة واقبل الإذن الجديد (الاتصال بخدمة خارجية)، ثم **Deploy ← Manage deployments ← ✏️ ← Version: New version ← Deploy** (يبقى الرابط نفسه).
5. في MEGO: الإعدادات ← **حفظ + اختبار الاتصال** ← يجب أن ترى «ماسح الوجبات الذكي: جاهز».
6. جرّب: الرئيسية ← **📷 التقط صورة** ← **حلّل الصورة** ← راجع العناصر والأوزان ← **تأكيد وإضافة لليوميات**. لا يُحفظ شيء قبل التأكيد.

## الخطوة 3 — الاختبار الحقيقي · Step 3 — Real test

أرسل لي **رابط الـ Web app** و**الرمز** إذا أردت أن أختبر الاتصال الحقيقي بنفسي (سأستخدم سجلات اختبار واضحة باسم `MEGO-TEST` ثم أحذفها حذفاً ناعماً إلى Deleted_Records). بعد الاختبار شغّل **rotateToken** واكتب الرمز الجديد في التطبيق إن أردت.

## إذا حدث خطأ · Troubleshooting

| الرسالة | الحل |
| --- | --- |
| `unauthorized` | الرمز غير صحيح — انسخه من سجل التنفيذ مرة أخرى |
| `WRONG_SPREADSHEET` | السكربت يستخدم ملفاً آخر — استخدم Code.gs من زر النسخ في التطبيق |
| `HUB_IS_XLSX` | الـ Hub ما زال Excel — أكمل الخطوة 1 |
| لا تظهر دالة setup | احفظ (💾) أولاً ثم حدّث الصفحة |
| «لم يُفعّل الذكاء الاصطناعي بعد» | أضف `ANTHROPIC_API_KEY` في Script Properties (الخطوة 2ب) |
| «رُفض مفتاح الذكاء الاصطناعي» | المفتاح خاطئ أو بلا رصيد — أنشئ مفتاحًا جديدًا في console.anthropic.com |
| «خادمك إصدار قديم» | الصق Code.gs الجديد من زر النسخ ثم انشر نسخة جديدة (New version) |
