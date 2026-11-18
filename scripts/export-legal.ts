/**
 * Writes the privacy policy and terms (Arabic + English) as Markdown from the SAME texts the app shows
 * (src/lib/i18n*.ts), so the documents can never drift from the app.  Run: npx vite-node scripts/export-legal.ts
 */
import { writeFileSync } from 'node:fs';
import { DICTS } from '../src/lib/i18n';

const PRIVACY = ['pp_0', 'pp_1', 'pp_9', 'pp_2', 'pp_11', 'pp_3', 'pp_10', 'pp_4', 'pp_12', 'pp_5', 'pp_13', 'pp_6', 'pp_7', 'pp_8', 'pp_14'];
const TERMS = ['tos_1', 'tos_2', 'tos_3', 'tos_4', 'tos_7', 'tos_8', 'tos_5', 'tos_9', 'tos_10', 'tos_11', 'tos_6'];
const BANNER = {
  en: '> **DRAFT. Requires review by a qualified lawyer before public launch.** Every statement was checked against what the app actually does (code, security rules, live tests on 17–18 November 2026). Items in [square brackets] are decisions or facts only the owner can provide. MEGO makes no claim of legal compliance.',
  ar: '> **مسودة. تتطلب مراجعة محامٍ مؤهل قبل الإطلاق العام.** تم التحقق من كل عبارة مقابل ما يفعله التطبيق فعلياً (الشيفرة وقواعد الأمان والاختبارات المباشرة في 17–18 نوفمبر 2026). العناصر بين [أقواس مربعة] قرارات أو معلومات لا يقدمها إلا المالك. لا يدّعي MEGO الامتثال القانوني.'
};
for (const lang of ['en', 'ar'] as const) {
  const t = (k: string) => DICTS[lang][k] ?? DICTS.en[k];
  for (const [kind, keys, file] of [['privacy', PRIVACY, 'PRIVACY_POLICY'], ['terms', TERMS, 'TERMS']] as const) {
    const head = lang === 'ar' ? '<div dir="rtl" lang="ar">\n\n' : '';
    const md = `${head}# MEGO — ${t(kind)}\n\n${BANNER[lang]}\n\n*${t('legal_version')} · ${t('legal_draft')}*\n\n` +
      keys.map((k) => `## ${t(k + '_h')}\n\n${t(k)}\n`).join('\n') +
      `\n---\n${lang === 'ar' ? 'النص نفسه يظهر داخل التطبيق: ' : 'The same text is shown in the app: '}https://mego2012.github.io/Mego/#/${kind}\n` + (lang === 'ar' ? '\n</div>\n' : '');
    writeFileSync(`docs/launch/MEGO_${file}_${lang.toUpperCase()}.md`, md);
    console.log(`docs/launch/MEGO_${file}_${lang.toUpperCase()}.md`, md.length, 'chars');
  }
}
