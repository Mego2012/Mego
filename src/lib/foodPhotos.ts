/**
 * Food photography: maps a food to ONE curated, freely licensed photo (Wikimedia Commons; see public/food-img/CREDITS.md).
 * A photo is shown only when the match is unambiguous; otherwise the UI shows a designed placeholder — never an
 * unrelated or misleading picture. Prepared dishes, mixtures, flavoured/processed variants and baby foods never match.
 */
import { normalizeText } from './normalize';

export type PhotoGroup = 'protein' | 'dairy' | 'legume' | 'grain' | 'fruit' | 'veg' | 'fat' | 'nut' | 'sweet' | 'drink' | 'other';
interface PhotoKey { key: string; group: PhotoGroup; en: RegExp; ar?: RegExp; fdc?: string[] }

const K = (key: string, group: PhotoGroup, en: RegExp, ar?: RegExp, fdc?: string[]): PhotoKey => ({ key, group, en, ar, fdc });

/* Order matters: the first match wins, so specific keys come before generic ones. Arabic patterns run on normalizeText(). */
export const PHOTO_KEYS: PhotoKey[] = [
  K('egg-white', 'protein', /\begg whites?\b/, /بياض (ال)?بيض/, ['172183']),
  K('egg-boiled', 'protein', /\beggs?\b(?!.*(substitute|noodle|nog|roll|plant))/, /^(ال)?بيض(ه|ات)?\b|بيض مسلوق|بيض/, ['173424']),
  K('chicken-breast', 'protein', /\bchicken\b.*\bbreast\b|\bbreast\b.*\bchicken\b/, /صد(ر|ور) (ال)?(دجاج|فراخ|فرخه)/, ['171477']),
  K('turkey-breast', 'protein', /\bturkey\b.*\bbreast\b/, /(ديك رومي|حبش)/, ['174516']),
  K('tuna-canned', 'protein', /\btuna\b.*\bcanned\b|\bcanned\b.*\btuna\b/, /تونه/, ['173709']),
  K('tuna-steak', 'protein', /\btuna\b/, undefined, ['172006']),
  K('salmon', 'protein', /\bsalmon\b/, /سلمون|سالمون/, ['175168']),
  K('sardines', 'protein', /\bsardines?\b/, /سردين/, ['175139']),
  K('mackerel', 'protein', /\bmackerel\b/, /ماكريل|اسقمري|سكومبري/, ['175120']),
  K('tilapia', 'protein', /\btilapia\b/, /بلطي/, ['175177']),
  K('cod', 'protein', /\bcod\b/, /سمك القد|\bقد\b/, ['171956']),
  K('haddock', 'protein', /\bhaddock\b/, /حدوق|هادوك/, ['174198']),
  K('shrimp', 'protein', /\bshrimps?\b|\bprawns?\b/, /جمبري|روبيان|قريدس/, ['175180']),
  K('ground-beef', 'protein', /\bbeef\b.*\bground\b|\bground\b.*\bbeef\b/, /لحم (بقري )?مفروم|مفروم/, ['171791']),
  K('steak', 'protein', /\bbeef\b.*\b(sirloin|steak|loin|round|tenderloin|ribeye)\b|\bsteak\b/, /ستيك|لحم بقري|لحم عجل|لحمه بقري/, ['168636']),
  K('lamb', 'protein', /\blamb\b/, /ضان|خروف|لحم غنم/, ['172487']),
  K('greek-yogurt', 'dairy', /\bgreek\b.*\byogurt\b|\byogurt\b.*\bgreek\b/, /زبادي يوناني|يوناني/, ['170894', '170903']),
  K('labneh', 'dairy', /\blabneh\b|\blabne\b/, /لبنه/),
  K('cottage-cheese', 'dairy', /\bcottage cheese\b/, /جبن(ه)? قريش|قريش|كوتج/, ['173417']),
  K('feta', 'dairy', /\bfeta\b/, /فيتا|جبن(ه)? بيضا/, ['173420']),
  K('halloumi', 'dairy', /\bhalloumi\b/, /حلوم/),
  K('cheese', 'dairy', /\bcheddar\b/, /شيدر/),
  K('milk', 'drink', /^milk\b|\bmilk (skim|whole|reduced|lowfat|nonfat|fluid)|\bmilk, (skim|whole|reduced|lowfat|nonfat|fluid|1%|2%)/, /^حليب|^لبن (بقري|كامل|خالي|قليل)/, ['171269', '170872']),
  K('whey', 'protein', /\bwhey\b/, /واي|بروتين مصل/, ['173180']),
  K('soy-protein', 'protein', /\bsoy protein\b/, /بروتين (ال)?صويا/, ['173181']),
  K('tofu', 'legume', /\btofu\b/, /توفو/, ['172448']),
  K('tempeh', 'legume', /\btempeh\b/, /تمبيه/, ['174272']),
  K('edamame', 'legume', /\bedamame\b/, /ادامامي/, ['168411']),
  K('hummus', 'legume', /\bhummus\b/, /^حمص (بالطحينه|بطحينه)|حمص بالطحينه/),
  K('falafel', 'legume', /\bfalafel\b/, /فلافل|طعميه/),
  K('fava-beans', 'legume', /\bfava\b|\bbroad ?beans?\b|\bful\b/, /فول/, ['173798']),
  K('chickpeas', 'legume', /\bchickpeas?\b|\bgarbanzo\b/, /حمص/, ['173757']),
  K('lentils', 'legume', /\blentils?\b/, /عدس/, ['172421']),
  K('kidney-beans', 'legume', /\bkidney beans?\b/, /فاصوليا حمرا/, ['173740']),
  K('black-beans', 'legume', /\bblack beans?\b/, /فاصوليا سودا/, ['173735']),
  K('white-beans', 'legume', /\b(white|navy|cannellini|great northern) beans?\b/, /فاصوليا بيضا/, ['175203']),
  K('split-peas', 'legume', /\bsplit peas?\b/, /بازلا مجروشه/, ['172429']),
  K('peas', 'veg', /\bgreen peas\b|^peas\b|\bpeas, green\b/, /بازلا|بازيلا|بسله/, ['170017']),
  K('oats', 'grain', /\boats?\b|\boatmeal\b/, /شوفان/, ['173904']),
  K('brown-rice', 'grain', /\bbrown rice\b|\brice, brown\b/, /رز بني|ارز بني/, ['169704']),
  K('white-rice', 'grain', /\brice\b/, /^(ال)?(رز|ارز)( ابيض| مصري| بسمتي| مطبوخ| مسلوق)?$|رز ابيض|ارز ابيض|رز بسمتي|ارز بسمتي/, ['168878']),
  K('sweet-potato', 'veg', /\bsweet ?potato(es)?\b/, /بطاطا حلوه|بطاطا حلوة|بطاطس حلوه/, ['168483']),
  K('potato', 'veg', /\bpotato(es)?\b/, /بطاطس|بطاطا/, ['170438']),
  K('pita', 'grain', /\bpita\b/, /خبز (عربي|شامي|بلدي)|عيش (بلدي|شامي)|خبز بر/, ['174916']),
  K('bread-wholewheat', 'grain', /\bbread\b.*\bwhole.?wheat\b|\bwhole.?wheat\b.*\bbread\b/, /خبز (اسمر|توست اسمر|حبوب كامله)|توست اسمر|عيش سن/, ['172688']),
  K('bulgur', 'grain', /\bbulgu?r\b/, /برغل|برغول/, ['170287']),
  K('quinoa', 'grain', /\bquinoa\b/, /كينوا/, ['168917']),
  K('couscous', 'grain', /\bcouscous\b/, /كسكس|كسكسي/, ['169700']),
  K('barley', 'grain', /\bbarley\b/, /شعير/, ['170285']),
  K('pasta', 'grain', /\bpasta\b|\bspaghetti\b|\bmacaroni\b|\bpenne\b/, /مكرونه|معكرونه|باستا|اسباجتي/, ['169737', '168910']),
  K('corn', 'veg', /\bsweet corn\b|\bcorn, sweet\b|\bcorn on the cob\b/, /ذره/, ['168399']),
  K('banana', 'fruit', /\bbananas?\b/, /موز/, ['173944']),
  K('apple', 'fruit', /\bapples?\b(?!.*(juice|sauce|pie|butter|cider|vinegar))/, /تفاح/, ['171688']),
  K('dates', 'fruit', /\bdates?\b.*\b(medjool|deglet)|\bdates, /, /^تمر|^(ال)?تمور|تمر (مجدول|سكري|خلاص)/, ['168191']),
  K('orange', 'fruit', /^oranges?\b|\boranges?, raw\b/, /برتقال/, ['169097']),
  K('strawberries', 'fruit', /\bstrawberr(y|ies)\b/, /فراوله|فريز/, ['167762']),
  K('watermelon', 'fruit', /\bwatermelon\b/, /بطيخ/, ['167765']),
  K('pear', 'fruit', /^pears?\b|\bpears?, raw\b/, /كمثري|اجاص/, ['169118']),
  K('guava', 'fruit', /\bguavas?\b/, /جوافه/, ['173044']),
  K('raspberries', 'fruit', /\braspberr(y|ies)\b/, /توت احمر|توت العليق/, ['167755']),
  K('avocado', 'fat', /\bavocados?\b/, /افوكادو/, ['171705']),
  K('olive-oil', 'fat', /\bolive oil\b|\boil, olive\b/, /زيت (ال)?زيتون/, ['171413']),
  K('canola-oil', 'fat', /\bcanola\b|\brapeseed\b/, /زيت (ال)?كانولا/, ['172336']),
  K('coconut-oil', 'fat', /\bcoconut oil\b|\boil, coconut\b/, /زيت (ال)?جوز الهند/, ['171412']),
  K('butter', 'fat', /^butter\b|\bbutter, (salted|without salt|unsalted)/, /^زبده/, ['173410']),
  K('peanut-butter', 'nut', /\bpeanut butter\b/, /زبده (ال)?فول السوداني/, ['172470']),
  K('tahini', 'nut', /\btahini\b|\bsesame butter\b/, /طحينه/, ['170189']),
  K('almonds', 'nut', /\balmonds?\b(?!.*(milk|butter|flour))/, /لوز/, ['170567']),
  K('walnuts', 'nut', /\bwalnuts?\b/, /عين (ال)?جمل|جوز(?! الهند)/, ['170187']),
  K('pistachios', 'nut', /\bpistachios?\b/, /فستق(?! سوداني)(?! عبيد)/, ['170184']),
  K('cashews', 'nut', /\bcashews?\b/, /كاجو/, ['170162']),
  K('chia', 'nut', /\bchia\b/, /شيا/, ['170554']),
  K('flaxseed', 'nut', /\bflax ?seeds?\b/, /بذر (ال)?كتان|كتان/, ['169414']),
  K('pumpkin-seeds', 'nut', /\bpumpkin\b.*\bseeds?\b/, /بذور (ال)?قرع|لب (ابيض|قرع)/, ['170556']),
  K('honey', 'sweet', /^honey\b/, /^عسل/),
  K('broccoli', 'veg', /\bbroccoli\b/, /بروكلي/, ['169967']),
  K('spinach', 'veg', /\bspinach\b/, /سبانخ/, ['168462']),
  K('carrots', 'veg', /\bcarrots?\b/, /جزر/, ['170393']),
  K('cucumber', 'veg', /\bcucumbers?\b/, /خيار/, ['168409']),
  K('lettuce', 'veg', /\blettuce\b/, /خس/, ['169247']),
  K('tomatoes', 'veg', /\btomato(es)?\b(?!.*(sauce|paste|juice|soup|ketchup|puree))/, /طماطم|بندوره/, ['170457']),
  K('zucchini', 'veg', /\bzucchini\b|\bcourgette\b/, /كوسه|كوسا/, ['169291']),
  K('cauliflower', 'veg', /\bcauliflower\b/, /قرنبيط|زهره/, ['169986']),
  K('cabbage', 'veg', /\bcabbage\b/, /ملفوف|كرنب/, ['169975']),
  K('okra', 'veg', /\bokra\b/, /بامي/, ['169261']),
  K('artichoke', 'veg', /\bartichokes?\b/, /خرشوف|خرشوف/, ['168386'])
];

/** Names that describe a dish, a mixture or a processed product: never matched to a single-ingredient photo. */
const EXCLUDE_EN = /\b(with|and|in sauce|sauce|soup|salad|sandwich|pie|cake|cookie|bar|nugget|breaded|battered|fried|casserole|stew|curry|pizza|burger|baby ?food|babyfood|flavou?red|sweetened|candied|chips|juice|drink|beverage|powder(?!.*(whey|protein))|substitute|imitation|dessert|ice cream|pudding|muffin|cereal|snack|frozen meal|entree|dinner|mix|dip|spread(?!.*peanut)|crackers?|smoothie|shake)\b/;
const EXCLUDE_AR = /(مع |ب(ال)?صلصه|صلصه|شوربه|سلطه|ساندويتش|فطيره|كيك|بسكويت|مقلي|مقليه|كبسه|طاجن|بيتزا|برجر|عصير|مشروب|حلوي|ايس كريم|مهلبيه|محشي|معجنات|كريب|شيبس|مخبوز(ات)?)/;

const byKey = new Map(PHOTO_KEYS.map((k) => [k.key, k]));
export const photoGroupOf = (key: string | null | undefined): PhotoGroup => (key && byKey.get(key)?.group) || 'other';

/** FDC id from a USDA sourceRef ("USDA FDC 171477 (SR Legacy)"), an intel id ("S171477") or a ref id ("U-171477"). */
function fdcOf(x: { sourceRef?: string; id?: string }): string | null {
  const m = /FDC\s+(\d+)/.exec(x.sourceRef ?? '') ?? /^[SFU]-?(\d{5,})$/.exec(x.id ?? '');
  return m ? m[1] : null;
}

/** The photo key for a food, or null when no photo would be an honest match. */
export function photoKeyFor(food: { nameEn?: string; nameAr?: string; sourceRef?: string; id?: string }): string | null {
  const fdc = fdcOf(food);
  if (fdc) for (const k of PHOTO_KEYS) if (k.fdc?.includes(fdc)) return k.key;
  const en = (food.nameEn ?? '').toLowerCase().trim();
  const ar = normalizeText(food.nameAr ?? '');
  if (en && !EXCLUDE_EN.test(en)) for (const k of PHOTO_KEYS) if (k.en.test(en)) return k.key;
  if (ar && !EXCLUDE_AR.test(ar + ' ')) for (const k of PHOTO_KEYS) if (k.ar?.test(ar)) return k.key;
  return null;
}

/** Guess a placeholder group from a free-text category or name when there is no photo key. */
export function groupFromText(category = '', name = ''): PhotoGroup {
  const s = normalizeText(category + ' ' + name);
  if (/(لحم|دجاج|فراخ|سمك|اسماك|بروتين|بيض|meat|poultry|fish|seafood|protein|egg)/.test(s)) return 'protein';
  if (/(البان|حليب|جبن|زبادي|dairy|milk|cheese|yogurt)/.test(s)) return 'dairy';
  if (/(بقول|عدس|فول|حمص|legume|bean|lentil)/.test(s)) return 'legume';
  if (/(نشويات|حبوب|خبز|رز|ارز|مكرونه|grain|cereal|bread|rice|pasta|baked)/.test(s)) return 'grain';
  if (/(فواكه|فاكهه|fruit)/.test(s)) return 'fruit';
  if (/(خضار|خضروات|vegetable|veg)/.test(s)) return 'veg';
  if (/(مكسرات|بذور|nut|seed)/.test(s)) return 'nut';
  if (/(دهون|زيوت|زيت|fat|oil)/.test(s)) return 'fat';
  if (/(حلويات|سكر|sweet|sugar|dessert)/.test(s)) return 'sweet';
  if (/(مشروبات|عصير|drink|beverage)/.test(s)) return 'drink';
  return 'other';
}

export interface PhotoCredit { file: string; title: string; author: string; license: string; licenseUrl: string; source: string }
let manifest: Promise<Record<string, PhotoCredit>> | null = null;
let manifestSync: Record<string, PhotoCredit> | null = null;

/** Loads public/food-img/manifest.json once (cached by the service worker for offline use). */
export function loadPhotoManifest(): Promise<Record<string, PhotoCredit>> {
  if (!manifest) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    manifest = fetch(base + 'food-img/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
      .then((m: Record<string, PhotoCredit>) => (manifestSync = m));
  }
  return manifest;
}
export const photoManifestNow = () => manifestSync;
export function photoUrl(key: string): string | null {
  const m = manifestSync?.[key];
  if (!m) return null;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return base + 'food-img/' + m.file;
}
