/**
 * Bilingual food search: Arabic (MSA + Egyptian/Gulf/Levantine words), English, transliterations, partial words
 * and small typos. Arabic query words are translated to the English vocabulary of the reference database
 * (USDA names are English), English words to Arabic for the user's own Arabic-named foods.
 * Only WORDS are translated — nutrition values always come from the source records.
 */
import { normalizeText } from './normalize';

/** Arabic word (any spelling) → English search tokens. Keys are normalized at load time. */
const AR_EN: Record<string, string[]> = {
  // proteins
  'دجاج': ['chicken'], 'دجاجه': ['chicken'], 'فراخ': ['chicken'], 'فرخه': ['chicken'], 'فروج': ['chicken'], 'جاج': ['chicken'],
  'صدر': ['breast'], 'صدور': ['breast'], 'فخذ': ['thigh'], 'افخاذ': ['thigh'], 'ورك': ['thigh'], 'وراك': ['thigh'],
  'جناح': ['wing'], 'اجنحه': ['wing'], 'جوانح': ['wing'], 'دبوس': ['drumstick'], 'دبابيس': ['drumstick'], 'ساق': ['drumstick', 'leg'],
  'كبد': ['liver'], 'كبده': ['liver'], 'قوانص': ['gizzard'], 'ديك': ['turkey'], 'رومي': ['turkey'], 'تركي': ['turkey'],
  'لحم': ['beef', 'meat'], 'لحمه': ['beef', 'meat'], 'بقري': ['beef'], 'بقر': ['beef'], 'عجل': ['veal'], 'كندوز': ['beef'],
  'ضاني': ['lamb'], 'ضان': ['lamb'], 'خروف': ['lamb'], 'غنم': ['lamb'], 'جمل': ['camel'], 'ماعز': ['goat'],
  'مفروم': ['ground'], 'مفرومه': ['ground'], 'ستيك': ['steak'], 'كفته': ['ground'], 'برجر': ['burger', 'hamburger'], 'همبرجر': ['hamburger'],
  'سجق': ['sausage'], 'نقانق': ['sausage'], 'لانشون': ['luncheon'], 'بسطرمه': ['pastrami'], 'مرتديلا': ['bologna'],
  'سمك': ['fish'], 'سمكه': ['fish'], 'اسماك': ['fish'], 'تونه': ['tuna'], 'سلمون': ['salmon'], 'سردين': ['sardine'], 'ماكريل': ['mackerel'],
  'بلطي': ['tilapia'], 'هامور': ['grouper'], 'قاروص': ['bass'], 'قاروس': ['bass'], 'بوري': ['mullet'], 'جمبري': ['shrimp'], 'روبيان': ['shrimp'],
  'كابوريا': ['crab'], 'سلطعون': ['crab'], 'كاليماري': ['squid'], 'حبار': ['squid'], 'محار': ['oyster', 'mussel'], 'استاكوزا': ['lobster'],
  'بيض': ['egg'], 'بيضه': ['egg'], 'بياض': ['white'], 'صفار': ['yolk'], 'اومليت': ['omelet'],
  'بروتين': ['protein'], 'واي': ['whey'], 'كازين': ['casein'], 'صويا': ['soy'], 'توفو': ['tofu'],
  // dairy
  'حليب': ['milk'], 'لبن': ['milk', 'buttermilk'], 'زبادي': ['yogurt'], 'روب': ['yogurt'], 'يوناني': ['greek'], 'لبنه': ['cream cheese'],
  'جبن': ['cheese'], 'جبنه': ['cheese'], 'قريش': ['cottage'], 'شيدر': ['cheddar'], 'موتزاريلا': ['mozzarella'], 'موزاريلا': ['mozzarella'],
  'فيتا': ['feta'], 'بارميزان': ['parmesan'], 'حلوم': ['halloumi'], 'زبده': ['butter'], 'سمن': ['ghee', 'butter oil'],
  'قشطه': ['cream'], 'كريمه': ['cream'], 'ايس': ['ice'], 'ايسكريم': ['ice cream'], 'بوظه': ['ice cream'],
  // grains & carbs
  'رز': ['rice'], 'ارز': ['rice'], 'بسمتي': ['basmati'], 'مصري': ['medium-grain'], 'بني': ['brown'], 'ابيض': ['white'],
  'بطاطس': ['potato'], 'بطاطا': ['potato', 'sweet potato'], 'حلوه': ['sweet'], 'شوفان': ['oat'], 'خبز': ['bread'], 'عيش': ['bread'],
  'توست': ['toast', 'bread'], 'صامولي': ['roll'], 'شامي': ['pita'], 'عربي': ['pita'], 'فينو': ['roll'], 'بلدي': ['whole-wheat'], 'تورتيلا': ['tortilla'], 'صاج': ['pita'],
  'مكرونه': ['pasta', 'macaroni', 'spaghetti'], 'معكرونه': ['pasta', 'macaroni', 'spaghetti'], 'باستا': ['pasta'], 'اسباجتي': ['spaghetti'],
  'نودلز': ['noodles'], 'اندومي': ['ramen', 'noodles'], 'كينوا': ['quinoa'], 'برغل': ['bulgur'], 'كسكس': ['couscous'], 'فريكه': ['freekeh'],
  'شعير': ['barley'], 'دقيق': ['flour'], 'طحين': ['flour'], 'قمح': ['wheat'], 'ذره': ['corn'], 'كورن': ['corn'], 'فليكس': ['flakes'],
  'حبوب': ['cereal'], 'جرانولا': ['granola'], 'مويسلي': ['muesli'], 'كيك': ['cake'], 'كعك': ['cake', 'cookie'], 'بسكويت': ['cookie', 'biscuit'],
  'فطير': ['pastry'], 'كرواسون': ['croissant'], 'بان': ['pancake'], 'فطائر': ['pastry'], 'بيتزا': ['pizza'],
  // legumes
  'فول': ['fava', 'broad bean', 'broadbeans'], 'مدمس': ['fava'], 'عدس': ['lentil'], 'حمص': ['chickpea', 'garbanzo', 'hummus'],
  'فاصوليا': ['bean'], 'فاصوليه': ['bean'], 'لوبيا': ['cowpea', 'black-eyed'], 'بازلاء': ['pea'], 'بسله': ['pea'], 'ترمس': ['lupin'],
  'فلافل': ['falafel'], 'طعميه': ['falafel'], 'حمراء': ['red', 'kidney'], 'سوداء': ['black'], 'بيضاء': ['white'],
  // vegetables
  'خضار': ['vegetable'], 'خضروات': ['vegetable'], 'طماطم': ['tomato'], 'قوطه': ['tomato'], 'بندوره': ['tomato'], 'خيار': ['cucumber'],
  'خس': ['lettuce'], 'جزر': ['carrot'], 'بصل': ['onion'], 'ثوم': ['garlic'], 'فلفل': ['pepper'],
  'باذنجان': ['eggplant'], 'بتنجان': ['eggplant'], 'كوسه': ['squash', 'zucchini'], 'كوسا': ['squash', 'zucchini'], 'بروكلي': ['broccoli'],
  'قرنبيط': ['cauliflower'], 'زهره': ['cauliflower'], 'سبانخ': ['spinach'], 'ملفوف': ['cabbage'], 'كرنب': ['cabbage'], 'بامي': ['okra'],
  'بامية': ['okra'], 'ملوخيه': ['jute'], 'فطر': ['mushroom'], 'مشروم': ['mushroom'], 'كرفس': ['celery'], 'بقدونس': ['parsley'],
  'كزبره': ['coriander', 'cilantro'], 'نعناع': ['mint'], 'جرجير': ['arugula'], 'شمندر': ['beet'], 'بنجر': ['beet'], 'لفت': ['turnip'],
  'فجل': ['radish'], 'قرع': ['pumpkin', 'squash'], 'يقطين': ['pumpkin'], 'خرشوف': ['artichoke'], 'هليون': ['asparagus'], 'افوكادو': ['avocado'],
  'زيتون': ['olive'], 'مخلل': ['pickle'], 'سلطه': ['salad'],
  // fruits
  'فاكهه': ['fruit'], 'تفاح': ['apple'], 'تفاحه': ['apple'], 'موز': ['banana'], 'موزه': ['banana'], 'برتقال': ['orange'], 'برتقاله': ['orange'],
  'يوسفي': ['tangerine', 'mandarin'], 'عنب': ['grape'], 'تمر': ['date'], 'تمور': ['date'], 'بلح': ['date'], 'رطب': ['date'],
  'مانجو': ['mango'], 'منجا': ['mango'], 'فراوله': ['strawberr'], 'بطيخ': ['watermelon'], 'شمام': ['melon', 'cantaloupe'], 'كنتالوب': ['cantaloupe'],
  'اناناس': ['pineapple'], 'خوخ': ['peach'], 'مشمش': ['apricot'], 'كمثرى': ['pear'], 'كمثري': ['pear'], 'رمان': ['pomegranate'],
  'تين': ['fig'], 'زبيب': ['raisin'], 'ليمون': ['lemon', 'lime'], 'جوافه': ['guava'], 'كيوي': ['kiwi'], 'توت': ['berr', 'mulberr'],
  'برقوق': ['plum'], 'كرز': ['cherr'], 'جريب': ['grapefruit'], 'بابايا': ['papaya'], 'جوز_هند': ['coconut'], 'نارجيل': ['coconut'],
  'مجفف': ['dried'], 'مجففه': ['dried'],
  // fats, nuts, seeds
  'زيت': ['oil'], 'جوز': ['walnut', 'nut'], 'لوز': ['almond'], 'فستق': ['pistachio'], 'سوداني': ['peanut'], 'كاجو': ['cashew'],
  'بندق': ['hazelnut'], 'سمسم': ['sesame'], 'طحينه': ['tahini'], 'شيا': ['chia'], 'كتان': ['flax'], 'لب': ['seed'], 'بذور': ['seed'],
  'مكسرات': ['nut'], 'هند': ['coconut'], 'سمن_نباتي': ['shortening', 'margarine'],
  // sweets, snacks, drinks, sauces
  'عسل': ['honey'], 'سكر': ['sugar'], 'شوكولاته': ['chocolate'], 'شوكولا': ['chocolate'], 'شيكولاته': ['chocolate'], 'نوتيلا': ['hazelnut spread'],
  'مربى': ['jam', 'preserves'], 'مربي': ['jam', 'preserves'], 'حلاوه': ['halvah'], 'شيبسي': ['chips'], 'شيبس': ['chips'], 'فشار': ['popcorn'],
  'كراكرز': ['crackers'], 'بار': ['bar'], 'قهوه': ['coffee'], 'نسكافيه': ['coffee'], 'اسبريسو': ['espresso'], 'شاي': ['tea'],
  'عصير': ['juice'], 'ماء': ['water'], 'مياه': ['water'], 'مويه': ['water'], 'صودا': ['soda', 'carbonated'], 'غازي': ['carbonated', 'soda'],
  'كولا': ['cola'], 'بيبسي': ['cola'], 'كوكاكولا': ['cola'], 'مشروب': ['beverage', 'drink'], 'طاقه': ['energy drink'],
  'مايونيز': ['mayonnaise'], 'كاتشب': ['catsup', 'ketchup'], 'مستردة': ['mustard'], 'خردل': ['mustard'],
  'صلصه': ['sauce'], 'صوص': ['sauce'], 'معجون': ['paste'], 'خل': ['vinegar'], 'شطه': ['hot sauce', 'chili'], 'ملح': ['salt'],
  'شوربه': ['soup'], 'حساء': ['soup'], 'مرق': ['broth'], 'كاري': ['curry'], 'برياني': ['biryani'], 'شاورما': ['shawarma', 'gyro'],
  'جيرو': ['gyro'], 'كباب': ['kabob', 'kebab'], 'ساندويتش': ['sandwich'], 'سندويتش': ['sandwich'], 'سندوتش': ['sandwich'], 'رول': ['roll'],
  'سوشي': ['sushi'], 'تاكو': ['taco'], 'بوريتو': ['burrito'], 'ناتشوز': ['nachos'], 'هوت': ['hot dog'], 'دوجز': ['hot dog'],
  'ماكدونالدز': ['mcdonalds'], 'ماكدونالد': ['mcdonalds'], 'كنتاكي': ['kfc'], 'برجركنج': ['burger king'], 'دومينوز': ['domino'], 'هت': ['pizza hut'],
  // preparation / state words
  'مطبوخ': ['cooked'], 'مطبوخه': ['cooked'], 'مسلوق': ['boiled', 'cooked'], 'مسلوقه': ['boiled', 'cooked'], 'نيء': ['raw'], 'ني': ['raw'],
  'نيئ': ['raw'], 'نيئه': ['raw'], 'نيه': ['raw'], 'مشوي': ['roasted', 'grilled', 'broiled'], 'مشويه': ['roasted', 'grilled', 'broiled'],
  'مقلي': ['fried'], 'مقليه': ['fried'], 'محمر': ['fried', 'roasted'], 'مخبوز': ['baked'], 'فرن': ['baked', 'roasted'], 'بخار': ['steamed'],
  'مدخن': ['smoked'], 'مجمد': ['frozen'], 'مجمده': ['frozen'], 'معلب': ['canned'], 'معلبه': ['canned'], 'مصفى': ['drained'], 'مصفي': ['drained'],
  'طازج': ['fresh', 'raw'], 'طازه': ['fresh', 'raw'], 'جاف': ['dry', 'dried'], 'جافه': ['dry', 'dried'], 'جلد': ['skin'], 'بالجلد': ['skin'],
  'لايت': ['light', 'lowfat', 'reduced fat'], 'قليل': ['low', 'reduced'], 'خالي': ['nonfat', 'fat free', 'free'], 'كامل': ['whole', 'full'],
  'دسم': ['fat'], 'الدسم': ['fat'], 'دايت': ['diet', 'low calorie'], 'شرائح': ['sliced'], 'شريحه': ['slice'],
  'حبه': ['piece'], 'كوب': ['cup'], 'ملعقه': ['tablespoon']
};

/** Transliterated Arabic dish names → English tokens. */
const TRANSLIT: Record<string, string[]> = {
  foul: ['fava'], ful: ['fava'], taameya: ['falafel'], tameya: ['falafel'], ta3meya: ['falafel'], shawerma: ['shawarma', 'gyro'],
  shawarma: ['shawarma', 'gyro'], kofta: ['ground'], kufta: ['ground'], laban: ['buttermilk', 'milk'], labneh: ['cream cheese'], labna: ['cream cheese'],
  roz: ['rice'], ruz: ['rice'], aish: ['bread'], eish: ['bread'], khubz: ['bread'], jibneh: ['cheese'], gebna: ['cheese'], tahina: ['tahini'],
  hommos: ['hummus'], homos: ['hummus'], hummos: ['hummus'], molokhia: ['jute'], mulukhiyah: ['jute'], bamya: ['okra'], betengan: ['eggplant'],
  koshari: ['lentil', 'rice', 'pasta'], kushari: ['lentil', 'rice', 'pasta'], farakh: ['chicken'], ferakh: ['chicken'], dajaj: ['chicken'],
  lahma: ['beef'], lahm: ['beef', 'meat'], samak: ['fish'], bayd: ['egg'], beid: ['egg'], tamr: ['date'], balah: ['date']
};

const AR = new Map<string, string[]>();
for (const [k, v] of Object.entries(AR_EN)) AR.set(normalizeText(k.replace(/_.*$/, '')), [...(AR.get(normalizeText(k.replace(/_.*$/, ''))) ?? []), ...v]);
const EN_AR = new Map<string, string[]>();
for (const [k, vs] of Object.entries(AR_EN)) for (const v of vs) for (const w of v.split(' ')) EN_AR.set(w, [...(EN_AR.get(w) ?? []), normalizeText(k.replace(/_.*$/, ''))]);

const isArabic = (s: string) => /[؀-ۿ]/.test(s);
/** Very light English stemming so "eggs" = "egg", "potatoes" = "potato", "berries" = "berr". */
export function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
/** Arabic: strip the article and common attached prefixes/plural suffixes for matching. */
function arVariants(w: string): string[] {
  const out = new Set([w]);
  if (w.startsWith('ال') && w.length > 3) out.add(w.slice(2));
  for (const p of ['بال', 'وال', 'لل']) if (w.startsWith(p) && w.length > 4) out.add(w.slice(3));
  for (const suf of ['ات', 'ين', 'ون']) for (const x of [...out]) if (x.endsWith(suf) && x.length > 4) out.add(x.slice(0, -2));
  return [...out];
}

export interface QueryGroup { raw: string; alts: string[] }

/** Splits a query into word groups; each group lists the word plus its translations/variants. */
export function expandQuery(q: string): QueryGroup[] {
  const words = normalizeText(q).split(' ').filter(Boolean);
  return words.map((w) => {
    const alts = new Set<string>([w]);
    if (isArabic(w)) {
      for (const v of arVariants(w)) { alts.add(v); for (const t of AR.get(v) ?? []) alts.add(t); }
    } else {
      const s = stem(w);
      alts.add(s);
      for (const t of TRANSLIT[w] ?? []) alts.add(t);
      for (const t of EN_AR.get(s) ?? EN_AR.get(w) ?? []) alts.add(t);
    }
    return { raw: w, alts: [...alts] };
  });
}

/** Damerau-Levenshtein distance limited to small values (early exit). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** Inverted index over a list of names (English reference database). */
export class NameIndex {
  private vocab = new Map<string, number[]>();
  private vocabList: string[] = [];
  constructor(names: string[]) {
    names.forEach((n, i) => {
      for (const t of new Set(normalizeText(n).split(' ').filter((x) => x.length > 1).map(stem))) {
        const list = this.vocab.get(t);
        if (list) list.push(i); else this.vocab.set(t, [i]);
      }
    });
    this.vocabList = [...this.vocab.keys()];
  }
  /** Vocabulary tokens that match a term: exact, prefix (≥3 chars) or a small typo (≥4 chars). */
  private tokensFor(term: string): { tok: string; score: number }[] {
    const t = stem(term);
    const out: { tok: string; score: number }[] = [];
    for (const tok of this.vocabList) {
      if (tok === t) out.push({ tok, score: 3 });
      else if (t.length >= 3 && tok.startsWith(t)) out.push({ tok, score: 2 });
      else if (t.length >= 4 && Math.abs(tok.length - t.length) <= 2 && tok[0] === t[0] && editDistance(t, tok, t.length >= 8 ? 2 : 1) <= (t.length >= 8 ? 2 : 1)) out.push({ tok, score: 1 });
    }
    return out;
  }
  /** Returns matching row indexes with a score; every query group must match (AND), alternatives are OR. */
  search(groups: QueryGroup[], limit = 60): { i: number; score: number }[] {
    const usable = groups.map((g) => g.alts.filter((a) => !isArabic(a)).flatMap((a) => a.split(' '))).filter((alts) => alts.length);
    if (!usable.length) return [];
    let acc: Map<number, number> | null = null;
    for (const alts of usable) {
      const hit = new Map<number, number>();
      for (const a of alts) for (const { tok, score } of this.tokensFor(a)) for (const i of this.vocab.get(tok) ?? []) hit.set(i, Math.max(hit.get(i) ?? 0, score));
      if (!hit.size) continue; // an untranslatable word (e.g. an Arabic word we do not know) does not block results
      if (!acc) acc = hit;
      else { const next = new Map<number, number>(); for (const [i, s] of acc) if (hit.has(i)) next.set(i, s + hit.get(i)!); acc = next; }
    }
    if (!acc) return [];
    return [...acc.entries()].map(([i, score]) => ({ i, score })).sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit);
  }
}

/** True when a local (Arabic/English) food name matches every query group (any alternative, substring). */
export function matchesLocal(hay: string, groups: QueryGroup[]): boolean {
  const h = normalizeText(hay);
  return groups.every((g) => g.alts.some((a) => h.includes(isArabic(a) ? a : stem(a))));
}
