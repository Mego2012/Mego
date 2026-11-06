/**
 * Foods compared in the Food Intelligence rankings. Each entry points to ONE exact USDA FoodData Central record
 * (values are read from the shipped database, never typed here). Forms are chosen so foods are compared as they are
 * usually eaten: meats, fish, grains and legumes cooked; fruit, vegetables, nuts and dairy as sold.
 * The names here are only display labels.
 */
export type IntelGroup = 'protein' | 'carb' | 'fat' | 'fiber';
export interface IntelItem {
  id: string; ar: string; en: string; groups: IntelGroup[];
  /** animal or plant origin (shown, never used to rank) */
  origin: 'animal' | 'plant';
  /** minimally processed whole food (grains: whole grain) */
  whole: boolean;
}

const I = (id: string, ar: string, en: string, groups: IntelGroup[], origin: 'animal' | 'plant', whole = true): IntelItem => ({ id, ar, en, groups, origin, whole });

export const INTEL_CATALOG: IntelItem[] = [
  // protein
  I('S171477', 'صدر دجاج مشوي (بدون جلد)', 'Chicken breast, roasted (skinless)', ['protein'], 'animal'),
  I('S174516', 'صدر ديك رومي مشوي', 'Turkey breast, roasted', ['protein'], 'animal'),
  I('S173709', 'تونة معلبة بالماء (مصفاة)', 'Tuna, canned in water, drained', ['protein'], 'animal', false),
  I('S172006', 'تونة طازجة مطبوخة', 'Tuna (yellowfin), cooked', ['protein'], 'animal'),
  I('S171956', 'سمك القد مطبوخ', 'Cod, cooked', ['protein'], 'animal'),
  I('S175177', 'بلطي مطبوخ', 'Tilapia, cooked', ['protein'], 'animal'),
  I('S174198', 'حدوق (هادوك) مطبوخ', 'Haddock, cooked', ['protein'], 'animal'),
  I('S175168', 'سلمون مزروع مطبوخ', 'Salmon (farmed), cooked', ['protein', 'fat'], 'animal'),
  I('S175120', 'ماكريل مطبوخ', 'Mackerel, cooked', ['protein', 'fat'], 'animal'),
  I('S175139', 'سردين معلب بالزيت (مصفى)', 'Sardines, canned in oil, drained', ['protein', 'fat'], 'animal', false),
  I('S175180', 'جمبري مطبوخ', 'Shrimp, cooked', ['protein'], 'animal'),
  I('S171791', 'لحم بقري مفروم 95% مطبوخ', 'Beef, ground 95% lean, cooked', ['protein'], 'animal'),
  I('S168636', 'ستيك سيرلوين قليل الدهن مطبوخ', 'Beef top sirloin, lean, cooked', ['protein'], 'animal'),
  I('S172487', 'لحم ضأن (فخذ) قليل الدهن مطبوخ', 'Lamb leg, lean, roasted', ['protein'], 'animal'),
  I('S173424', 'بيض مسلوق', 'Egg, hard-boiled', ['protein'], 'animal'),
  I('S172183', 'بياض بيض', 'Egg white', ['protein'], 'animal'),
  I('S170894', 'زبادي يوناني خالي الدسم', 'Greek yogurt, nonfat plain', ['protein'], 'animal'),
  I('S170903', 'زبادي يوناني قليل الدسم', 'Greek yogurt, lowfat plain', ['protein'], 'animal'),
  I('S173417', 'جبن قريش 1%', 'Cottage cheese 1%', ['protein'], 'animal'),
  I('S173420', 'جبن فيتا', 'Feta cheese', ['protein', 'fat'], 'animal'),
  I('S171269', 'حليب خالي الدسم', 'Milk, skim', ['protein', 'carb'], 'animal'),
  I('S170872', 'حليب 1%', 'Milk, 1%', ['protein', 'carb'], 'animal'),
  I('S173180', 'بروتين مصل اللبن (واي) بودرة', 'Whey protein powder', ['protein'], 'animal', false),
  I('S172421', 'عدس مطبوخ', 'Lentils, cooked', ['protein', 'carb', 'fiber'], 'plant'),
  I('S173757', 'حمص مطبوخ', 'Chickpeas, cooked', ['protein', 'carb', 'fiber'], 'plant'),
  I('S173740', 'فاصوليا حمراء مطبوخة', 'Kidney beans, cooked', ['protein', 'carb', 'fiber'], 'plant'),
  I('S173735', 'فاصوليا سوداء مطبوخة', 'Black beans, cooked', ['protein', 'carb', 'fiber'], 'plant'),
  I('S175203', 'فاصوليا بيضاء مطبوخة', 'White beans, cooked', ['protein', 'carb', 'fiber'], 'plant'),
  I('S173798', 'فول مدمس (فول جاف مطبوخ)', 'Fava beans, cooked', ['protein', 'carb', 'fiber'], 'plant'),
  I('S172429', 'بازلاء مجروشة مطبوخة', 'Split peas, cooked', ['protein', 'carb', 'fiber'], 'plant'),
  I('S172448', 'توفو صلب', 'Tofu, firm', ['protein'], 'plant'),
  I('S174272', 'تمبيه', 'Tempeh', ['protein'], 'plant'),
  I('S168411', 'إدامامي', 'Edamame', ['protein', 'fiber'], 'plant'),
  I('S173181', 'بروتين صويا بودرة', 'Soy protein powder', ['protein'], 'plant', false),
  // carbohydrates
  I('S173904', 'شوفان (جاف)', 'Oats (dry)', ['carb', 'fiber'], 'plant'),
  I('S168878', 'أرز أبيض مطبوخ', 'White rice, cooked', ['carb'], 'plant', false),
  I('S169704', 'أرز بني مطبوخ', 'Brown rice, cooked', ['carb'], 'plant'),
  I('S170438', 'بطاطس مسلوقة بالقشر', 'Potato, boiled in skin', ['carb'], 'plant'),
  I('S168483', 'بطاطا حلوة مشوية بالقشر', 'Sweet potato, baked in skin', ['carb', 'fiber'], 'plant'),
  I('S172688', 'خبز قمح كامل', 'Whole-wheat bread', ['carb', 'fiber'], 'plant'),
  I('S174916', 'خبز عربي (بيتا) قمح كامل', 'Whole-wheat pita', ['carb', 'fiber'], 'plant'),
  I('S170287', 'برغل مطبوخ', 'Bulgur, cooked', ['carb', 'fiber'], 'plant'),
  I('S168917', 'كينوا مطبوخة', 'Quinoa, cooked', ['carb', 'protein'], 'plant'),
  I('S169737', 'معكرونة مطبوخة', 'Pasta, cooked', ['carb'], 'plant', false),
  I('S168910', 'معكرونة قمح كامل مطبوخة', 'Whole-wheat pasta, cooked', ['carb', 'fiber'], 'plant'),
  I('S169700', 'كسكس مطبوخ', 'Couscous, cooked', ['carb'], 'plant', false),
  I('S170285', 'شعير مقشور مطبوخ', 'Barley (pearled), cooked', ['carb', 'fiber'], 'plant', false),
  I('S168399', 'ذرة حلوة مطبوخة', 'Sweet corn, cooked', ['carb'], 'plant'),
  I('S173944', 'موز', 'Banana', ['carb'], 'plant'),
  I('S171688', 'تفاح بالقشر', 'Apple, with skin', ['carb', 'fiber'], 'plant'),
  I('S168191', 'تمر مجهول', 'Dates, medjool', ['carb'], 'plant'),
  I('S169097', 'برتقال', 'Orange', ['carb', 'fiber'], 'plant'),
  I('S167762', 'فراولة', 'Strawberries', ['carb', 'fiber'], 'plant'),
  I('S167765', 'بطيخ', 'Watermelon', ['carb'], 'plant'),
  I('S169118', 'كمثرى', 'Pear', ['carb', 'fiber'], 'plant'),
  I('S173044', 'جوافة', 'Guava', ['carb', 'fiber'], 'plant'),
  I('S167755', 'توت العليق (راسبيري)', 'Raspberries', ['carb', 'fiber'], 'plant'),
  // fats
  I('S171413', 'زيت زيتون', 'Olive oil', ['fat'], 'plant', false),
  I('S172336', 'زيت كانولا', 'Canola oil', ['fat'], 'plant', false),
  I('S171412', 'زيت جوز الهند', 'Coconut oil', ['fat'], 'plant', false),
  I('S173410', 'زبدة', 'Butter', ['fat'], 'animal', false),
  I('S171705', 'أفوكادو', 'Avocado', ['fat', 'fiber'], 'plant'),
  I('S170567', 'لوز', 'Almonds', ['fat', 'protein', 'fiber'], 'plant'),
  I('S170187', 'جوز (عين الجمل)', 'Walnuts', ['fat'], 'plant'),
  I('S170184', 'فستق حلبي', 'Pistachios', ['fat', 'protein', 'fiber'], 'plant'),
  I('S170162', 'كاجو', 'Cashews', ['fat'], 'plant'),
  I('S170554', 'بذور الشيا', 'Chia seeds', ['fat', 'fiber'], 'plant'),
  I('S169414', 'بذور الكتان', 'Flaxseed', ['fat', 'fiber'], 'plant'),
  I('S170556', 'بذور القرع', 'Pumpkin seeds', ['fat', 'protein'], 'plant'),
  I('S172470', 'زبدة فول سوداني', 'Peanut butter', ['fat', 'protein'], 'plant', false),
  I('S170189', 'طحينة', 'Tahini', ['fat'], 'plant', false),
  // vegetables (fiber, low calorie)
  I('S169967', 'بروكلي مسلوق', 'Broccoli, boiled', ['fiber'], 'plant'),
  I('S168462', 'سبانخ', 'Spinach', ['fiber'], 'plant'),
  I('S170393', 'جزر', 'Carrots', ['fiber'], 'plant'),
  I('S170017', 'بازلاء خضراء مطبوخة', 'Green peas, cooked', ['fiber', 'carb'], 'plant'),
  I('S168409', 'خيار بالقشر', 'Cucumber', ['fiber'], 'plant'),
  I('S169247', 'خس روماني', 'Romaine lettuce', ['fiber'], 'plant'),
  I('S170457', 'طماطم', 'Tomatoes', ['fiber'], 'plant'),
  I('S169291', 'كوسا', 'Zucchini', ['fiber'], 'plant'),
  I('S169986', 'قرنبيط', 'Cauliflower', ['fiber'], 'plant'),
  I('S169975', 'ملفوف', 'Cabbage', ['fiber'], 'plant'),
  I('S169261', 'بامية مطبوخة', 'Okra, cooked', ['fiber'], 'plant'),
  I('S168386', 'خرشوف مطبوخ', 'Artichoke, cooked', ['fiber'], 'plant')
];

/** Diet / allergen tags used to respect each user's food restrictions. */
export type DietTag = 'meat' | 'poultry' | 'fish' | 'shellfish' | 'dairy' | 'egg' | 'nuts' | 'peanut' | 'soy' | 'gluten' | 'sesame';
export const DIET_TAGS: DietTag[] = ['meat', 'poultry', 'fish', 'shellfish', 'dairy', 'egg', 'nuts', 'peanut', 'soy', 'gluten', 'sesame'];
const TAGS: Record<string, DietTag[]> = {
  S171477: ['poultry'], S174516: ['poultry'], S173709: ['fish'], S172006: ['fish'], S171956: ['fish'], S175177: ['fish'], S174198: ['fish'],
  S175168: ['fish'], S175120: ['fish'], S175139: ['fish'], S175180: ['shellfish'], S171791: ['meat'], S168636: ['meat'], S172487: ['meat'],
  S173424: ['egg'], S172183: ['egg'], S170894: ['dairy'], S170903: ['dairy'], S173417: ['dairy'], S173420: ['dairy'], S171269: ['dairy'],
  S170872: ['dairy'], S173180: ['dairy'], S173410: ['dairy'], S172448: ['soy'], S174272: ['soy'], S168411: ['soy'], S173181: ['soy'],
  S172688: ['gluten'], S174916: ['gluten'], S170287: ['gluten'], S169737: ['gluten'], S168910: ['gluten'], S169700: ['gluten'], S170285: ['gluten'],
  S173904: ['gluten'], // oats are often cross-contaminated with gluten unless certified
  S170567: ['nuts'], S170187: ['nuts'], S170184: ['nuts'], S170162: ['nuts'], S172470: ['peanut'], S170189: ['sesame']
};
export const tagsOf = (id: string): DietTag[] => TAGS[id] ?? [];
/** Vegetarian excludes meat/poultry/fish/shellfish; vegan additionally dairy and egg. */
export function excludedTags(diet: 'any' | 'vegetarian' | 'vegan', exclude: DietTag[]): Set<DietTag> {
  const s = new Set(exclude);
  if (diet === 'vegetarian' || diet === 'vegan') ['meat', 'poultry', 'fish', 'shellfish'].forEach((t) => s.add(t as DietTag));
  if (diet === 'vegan') ['dairy', 'egg'].forEach((t) => s.add(t as DietTag));
  return s;
}
