/**
 * Nutrition Education Center content (Arabic + English).
 * level "established" = statement backed by the listed source(s); "practical" = general, practical guidance.
 * Only sources that exist and are cited precisely are used. Educational content — not medical advice.
 */
export interface Source { id: string; cite: string; url: string }
export const SOURCES: Record<string, Source> = {
  who_diet: { id: 'who_diet', cite: 'World Health Organization. Healthy diet — Fact sheet.', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
  who_carb: { id: 'who_carb', cite: 'World Health Organization (2023). Carbohydrate intake for adults and children: WHO guideline.', url: 'https://www.who.int/publications' },
  who_protein: { id: 'who_protein', cite: 'WHO/FAO/UNU (2007). Protein and amino acid requirements in human nutrition. WHO Technical Report Series 935.', url: 'https://iris.who.int' },
  fao_protein: { id: 'fao_protein', cite: 'FAO (2013). Dietary protein quality evaluation in human nutrition. FAO Food and Nutrition Paper 92.', url: 'https://www.fao.org/publications' },
  issn_protein: { id: 'issn_protein', cite: 'Jäger R, et al. (2017). International Society of Sports Nutrition position stand: protein and exercise. J Int Soc Sports Nutr 14:20.', url: 'https://doi.org/10.1186/s12970-017-0177-8' },
  morton: { id: 'morton', cite: 'Morton RW, et al. (2018). Protein supplementation and resistance training-induced gains in muscle mass and strength: systematic review and meta-analysis. Br J Sports Med 52:376–384.', url: 'https://doi.org/10.1136/bjsports-2017-097608' },
  helms: { id: 'helms', cite: 'Helms ER, Aragon AA, Fitschen PJ (2014). Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation. J Int Soc Sports Nutr 11:20.', url: 'https://doi.org/10.1186/1550-2783-11-20' },
  efsa_water: { id: 'efsa_water', cite: 'EFSA NDA Panel (2010). Scientific opinion on dietary reference values for water. EFSA Journal 8(3):1459.', url: 'https://doi.org/10.2903/j.efsa.2010.1459' },
  nih_ods: { id: 'nih_ods', cite: 'NIH Office of Dietary Supplements. Dietary supplement fact sheets (vitamins, minerals, omega-3).', url: 'https://ods.od.nih.gov/factsheets/list-all/' },
  nrf: { id: 'nrf', cite: 'Fulgoni VL 3rd, Keast DR, Drewnowski A (2009). Development and validation of the Nutrient-Rich Foods index. J Nutr 139(8):1549–1554.', url: 'https://doi.org/10.3945/jn.108.101360' },
  usda: { id: 'usda', cite: 'USDA Agricultural Research Service. FoodData Central.', url: 'https://fdc.nal.usda.gov/' },
  fda_dv: { id: 'fda_dv', cite: 'U.S. FDA. Daily Value on the Nutrition and Supplement Facts labels.', url: 'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels' }
};

export interface Section { level: 'established' | 'practical'; ar: string; en: string; sources?: string[] }
export interface Article { id: string; icon: string; title: { ar: string; en: string }; summary: { ar: string; en: string }; sections: Section[] }

export const ARTICLES: Article[] = [
  {
    id: 'protein', icon: '🥩', title: { ar: 'البروتين', en: 'Protein' },
    summary: { ar: 'لبناء العضلات والحفاظ عليها، وللشبع.', en: 'Builds and preserves muscle and helps you feel full.' },
    sections: [
      { level: 'established', ar: 'كل غرام بروتين يعطي نحو 4 سعرات. يتكوّن من أحماض أمينية، تسعة منها «أساسية» يجب أن تأتي من الطعام.', en: 'Each gram of protein provides about 4 kcal. Proteins are made of amino acids; nine are "essential" and must come from food.', sources: ['who_protein'] },
      { level: 'established', ar: 'الحد الآمن للبالغين عمومًا 0.83 غ لكل كغ من وزن الجسم يوميًا — وهذا حدّ للوقاية من النقص وليس للأداء الرياضي.', en: 'The safe intake for adults is about 0.83 g per kg of body weight per day — a level that prevents deficiency, not one aimed at athletic goals.', sources: ['who_protein'] },
      { level: 'established', ar: 'لمن يمارسون تمارين المقاومة: 1.4–2.0 غ/كغ يوميًا مناسبة لمعظم الناس، ويفضَّل توزيعها على وجبات تحتوي كل منها نحو 20–40 غ.', en: 'For people doing resistance training, 1.4–2.0 g/kg per day suits most; spreading it over meals of about 20–40 g each is recommended.', sources: ['issn_protein'] },
      { level: 'established', ar: 'في تحليل تجميعي، توقفت الفائدة الإضافية على الكتلة العضلية تقريبًا عند ~1.6 غ/كغ يوميًا (وقد تصل لدى البعض إلى ~2.2 غ/كغ).', en: 'In a meta-analysis, extra benefit for muscle mass plateaued around ~1.6 g/kg/day (up to ~2.2 g/kg for some people).', sources: ['morton'] },
      { level: 'established', ar: 'جودة البروتين تعتمد على الأحماض الأمينية الأساسية وقابلية الهضم. البقوليات غالبًا محدودة في الأحماض الكبريتية والحبوب في الليسين، والجمع بينهما يكمل بعضهما.', en: 'Protein quality depends on essential amino acids and digestibility. Legumes are often limited in sulfur amino acids and grains in lysine — eating both complements them.', sources: ['fao_protein'] },
      { level: 'practical', ar: 'في MEGO نعرض «درجة الأحماض الأمينية» لكل طعام من بيانات USDA. لا نصحّحها بقابلية الهضم لأن هذه البيانات غير منشورة لمعظم الأطعمة.', en: 'MEGO shows an amino-acid score per food from USDA data. It is not corrected for digestibility because those data are not published for most foods.', sources: ['usda'] }
    ]
  },
  {
    id: 'carbs', icon: '🌾', title: { ar: 'الكربوهيدرات', en: 'Carbohydrates' },
    summary: { ar: 'مصدر الطاقة الأساسي — والنوع أهم من الكمية وحدها.', en: 'Your main energy source — quality matters as much as quantity.' },
    sections: [
      { level: 'established', ar: 'كل غرام كربوهيدرات يعطي نحو 4 سعرات. توصي منظمة الصحة العالمية بأن تأتي أساسًا من الحبوب الكاملة والخضار والفواكه والبقوليات.', en: 'Each gram of carbohydrate provides about 4 kcal. WHO recommends getting them mainly from whole grains, vegetables, fruits and pulses.', sources: ['who_carb'] },
      { level: 'established', ar: 'السكريات الحرة (المضافة والعسل والعصائر) أقل من 10% من الطاقة، ويُفضَّل أقل من 5%. السكر الموجود داخل الفاكهة الكاملة ليس سكرًا حرًا.', en: 'Free sugars (added sugar, honey, juices) should be under 10% of energy, ideally under 5%. Sugar inside whole fruit is not a free sugar.', sources: ['who_diet'] },
      { level: 'established', ar: 'على الأقل 400 غ من الخضار والفواكه يوميًا.', en: 'Eat at least 400 g of fruit and vegetables a day.', sources: ['who_diet'] },
      { level: 'practical', ar: 'لمن هدفه التنشيف: اختر نشويات غنية بالألياف وأقل كثافة في السعرات (بطاطس مسلوقة، برغل، فواكه). للتضخيم: النشويات الأكثف (أرز، شوفان، تمر) تسهّل الوصول للسعرات.', en: 'Cutting: choose fibre-rich, lower-calorie-density carbs (boiled potatoes, bulgur, fruit). Building: denser carbs (rice, oats, dates) make reaching calories easier.' }
    ]
  },
  {
    id: 'fats', icon: '🫒', title: { ar: 'الدهون', en: 'Dietary fats' },
    summary: { ar: 'ضرورية للهرمونات وامتصاص الفيتامينات — اختر غير المشبعة.', en: 'Essential for hormones and vitamin absorption — favour unsaturated fats.' },
    sections: [
      { level: 'established', ar: 'كل غرام دهون يعطي نحو 9 سعرات. منظمة الصحة العالمية: الدهون الكلية ≤ 30% من الطاقة، المشبعة < 10%، والمتحولة < 1%، مع استبدال المشبعة بغير المشبعة.', en: 'Each gram of fat provides about 9 kcal. WHO: total fat ≤ 30% of energy, saturated < 10%, trans < 1%, replacing saturated with unsaturated fats.', sources: ['who_diet'] },
      { level: 'established', ar: 'أوميغا-3: الأسماك الدهنية تعطي EPA وDHA مباشرة. الكتان والشيا والجوز تعطي ALA، ويتحوّل جزء صغير فقط منه إلى EPA وDHA.', en: 'Omega-3: fatty fish provide EPA and DHA directly. Flax, chia and walnuts provide ALA, of which only a small part is converted to EPA and DHA.', sources: ['nih_ods'] },
      { level: 'practical', ar: 'الزيوت والمكسرات عالية السعرات: قِس الزيت بالملعقة بدل السكب، فملعقة كبيرة زيت ≈ 120 سعرة.', en: 'Oils and nuts are calorie-dense: measure oil with a spoon instead of pouring — one tablespoon of oil is about 120 kcal.', sources: ['usda'] },
      { level: 'practical', ar: 'بيانات USDA لا تفرّق بين زيت الزيتون البكر الممتاز والعادي؛ ترتيب الدهون يعتمد على تركيب الأحماض الدهنية المنشور.', en: 'USDA data do not distinguish extra-virgin from regular olive oil; the fat ranking uses the published fatty-acid composition.' }
    ]
  },
  {
    id: 'fiber', icon: '🥦', title: { ar: 'الألياف', en: 'Fibre' },
    summary: { ar: 'للشبع وصحة الهضم — معظم الناس يحتاجون أكثر.', en: 'For fullness and digestive health — most people need more.' },
    sections: [
      { level: 'established', ar: 'توصي منظمة الصحة العالمية البالغين بـ 25 غ على الأقل يوميًا من الألياف الطبيعية في الطعام.', en: 'WHO recommends adults eat at least 25 g of naturally occurring dietary fibre per day.', sources: ['who_carb'] },
      { level: 'practical', ar: 'أفضل المصادر: البقوليات (عدس، فول، حمص)، الحبوب الكاملة، الخضار، الفواكه، البذور. زِد الكمية تدريجيًا مع شرب الماء.', en: 'Best sources: legumes (lentils, fava, chickpeas), whole grains, vegetables, fruit and seeds. Increase gradually and drink water.' },
      { level: 'practical', ar: 'MEGO يحسب الألياف فقط عندما تكون معروفة لكل عناصر اليوم — ولا يفترض أن الناقص صفر.', en: 'MEGO only judges fibre when it is known for every item of the day — missing values are never treated as zero.' }
    ]
  },
  {
    id: 'micros', icon: '💊', title: { ar: 'الفيتامينات والمعادن', en: 'Vitamins & minerals' },
    summary: { ar: 'تأتي أساسًا من تنوّع الطعام.', en: 'Mostly come from a varied diet.' },
    sections: [
      { level: 'established', ar: 'لكل فيتامين ومعدن احتياج يومي مرجعي؛ «القيمة اليومية» على ملصقات الأغذية تُستخدم للمقارنة بين الأطعمة.', en: 'Each vitamin and mineral has a reference daily need; the "Daily Value" on food labels is used to compare foods.', sources: ['fda_dv', 'nih_ods'] },
      { level: 'practical', ar: 'التنوع في الخضار والفواكه والبقوليات والحبوب الكاملة ومصادر البروتين يغطي معظم الاحتياجات. المكملات قرار طبي فردي.', en: 'Variety across vegetables, fruit, legumes, whole grains and protein sources covers most needs. Supplements are an individual medical decision.' }
    ]
  },
  {
    id: 'quality', icon: '⭐', title: { ar: 'جودة الطعام والكثافة الغذائية', en: 'Food quality & nutrient density' },
    summary: { ar: 'كم من المغذيات تحصل عليه لكل سعرة.', en: 'How many nutrients you get per calorie.' },
    sections: [
      { level: 'established', ar: 'مؤشر NRF9.3 يقيس الكثافة الغذائية: 9 مغذيات مفيدة ناقص 3 يُستحسن تقليلها، لكل 100 سعرة. MEGO يستخدم السكر الكلي بدل المضاف لعدم توفّره في البيانات.', en: 'The NRF9.3 index measures nutrient density: 9 beneficial nutrients minus 3 to limit, per 100 kcal. MEGO uses total sugar instead of added sugar, which is not in the data.', sources: ['nrf', 'usda'] },
      { level: 'practical', ar: 'الأطعمة الأقل معالجة تحتفظ بالألياف والمغذيات؛ لكن «معالج» لا يعني «سيئًا» دائمًا (الزبادي والتونة المعلبة مثال).', en: 'Less processed foods keep their fibre and nutrients — but "processed" is not always "bad" (yogurt and canned tuna, for example).' }
    ]
  },
  {
    id: 'density', icon: '⚖️', title: { ar: 'كثافة السعرات', en: 'Calorie density' },
    summary: { ar: 'سعرات كل 100 غ — مفتاح الشبع بسعرات أقل.', en: 'Calories per 100 g — a key to feeling full on fewer calories.' },
    sections: [
      { level: 'practical', ar: 'الخضار والفواكه والشوربات والبروتينات قليلة الدهن منخفضة الكثافة: حجم أكبر بسعرات أقل. الزيوت والمكسرات والحلويات عالية الكثافة.', en: 'Vegetables, fruit, soups and lean proteins have low calorie density: more volume for fewer calories. Oils, nuts and sweets are dense.', sources: ['usda'] },
      { level: 'practical', ar: 'في التنشيف: املأ نصف الطبق بالخضار. في التضخيم: الأطعمة الكثيفة تسهّل الوصول للهدف.', en: 'Cutting: fill half the plate with vegetables. Building: dense foods help you reach your target.' }
    ]
  },
  {
    id: 'fatloss', icon: '🔥', title: { ar: 'التغذية أثناء خسارة الدهون', en: 'Nutrition during fat loss' },
    summary: { ar: 'عجز معتدل + بروتين مرتفع + تمارين مقاومة.', en: 'A moderate deficit, high protein and resistance training.' },
    sections: [
      { level: 'established', ar: 'خسارة الدهون تتطلب عجزًا في السعرات. معدل نحو 0.5–1% من وزن الجسم أسبوعيًا يساعد على الحفاظ على العضلات.', en: 'Fat loss requires a calorie deficit. About 0.5–1% of body weight per week helps preserve muscle.', sources: ['helms'] },
      { level: 'established', ar: 'لدى الرياضيين النحفاء المتدربين على المقاومة أثناء العجز، اقتُرح بروتين أعلى (2.3–3.1 غ لكل كغ من الكتلة الخالية من الدهون).', en: 'For lean, resistance-trained people in a deficit, higher protein (2.3–3.1 g per kg of fat-free mass) has been suggested.', sources: ['helms'] },
      { level: 'practical', ar: 'MEGO يعتمد اتجاه الوزن على المتوسطات الأسبوعية وليس على وزنة واحدة، ولا يخفّض سعراتك تلقائيًا أبدًا.', en: 'MEGO judges weight trends from weekly averages, not single weigh-ins, and never lowers your calories automatically.' }
    ]
  },
  {
    id: 'preserve', icon: '🛡️', title: { ar: 'الحفاظ على العضلات', en: 'Muscle preservation' },
    summary: { ar: 'البروتين الكافي + المقاومة + عجز غير مبالغ.', en: 'Enough protein, resistance training and a sensible deficit.' },
    sections: [
      { level: 'established', ar: 'تمارين المقاومة مع بروتين كافٍ (1.4–2.0 غ/كغ) هما أساس الحفاظ على الكتلة العضلية.', en: 'Resistance training with adequate protein (1.4–2.0 g/kg) is the foundation of preserving muscle.', sources: ['issn_protein'] },
      { level: 'established', ar: 'الخسارة السريعة جدًا (أكثر من ~1% أسبوعيًا) ترفع خطر فقدان العضلات.', en: 'Very fast loss (more than ~1% per week) raises the risk of losing muscle.', sources: ['helms'] }
    ]
  },
  {
    id: 'build', icon: '💪', title: { ar: 'التغذية لبناء العضلات', en: 'Nutrition for muscle building' },
    summary: { ar: 'فائض صغير + بروتين + تدريب تدريجي.', en: 'A small surplus, protein and progressive training.' },
    sections: [
      { level: 'established', ar: 'البروتين اليومي نحو 1.6 غ/كغ يحقق معظم الفائدة، وحتى ~2.2 غ/كغ لمن يريد هامشًا أعلى.', en: 'About 1.6 g/kg of protein per day captures most of the benefit, up to ~2.2 g/kg for a margin.', sources: ['morton'] },
      { level: 'established', ar: 'توزيع البروتين على 3–5 وجبات (20–40 غ لكل وجبة) مع تدريب مقاومة تدريجي.', en: 'Spread protein over 3–5 meals (20–40 g each) with progressive resistance training.', sources: ['issn_protein'] },
      { level: 'practical', ar: 'فائض سعرات صغير يحدّ من تراكم الدهون؛ تابع الوزن والخصر أسبوعيًا.', en: 'A small calorie surplus limits fat gain; track weight and waist weekly.' }
    ]
  },
  {
    id: 'planning', icon: '🗓️', title: { ar: 'تخطيط الوجبات', en: 'Meal planning' },
    summary: { ar: 'خطط للبروتين أولًا ثم أكمل الباقي.', en: 'Plan protein first, then fill the rest.' },
    sections: [
      { level: 'practical', ar: 'ابدأ كل وجبة بمصدر بروتين، أضف خضارًا، ثم نشويات ودهونًا حسب المتبقي من أهدافك. ميزة «أكمل الماكروز» في المدرب تقترح تركيبات بالغرامات.', en: 'Start each meal with a protein source, add vegetables, then carbs and fats according to what remains. The Coach\'s "complete my macros" suggests combinations in grams.' },
      { level: 'practical', ar: 'زِن الطعام مطبوخًا أو نيئًا وسجّله بنفس الحالة — MEGO يفرّق بينهما ولا يحوّل تلقائيًا.', en: 'Weigh food cooked or raw and log it in the same state — MEGO keeps them separate and never converts automatically.' }
    ]
  },
  {
    id: 'hydration', icon: '💧', title: { ar: 'شرب الماء', en: 'Hydration' },
    summary: { ar: 'الاحتياج يزيد مع الحر والنشاط.', en: 'Needs rise with heat and activity.' },
    sections: [
      { level: 'established', ar: 'الكميات الكافية من الماء الكلي (من الشراب والطعام): نحو 2.0 لتر يوميًا للنساء و2.5 لتر للرجال في الظروف المعتدلة.', en: 'Adequate total water intake (drinks plus food): about 2.0 L/day for women and 2.5 L/day for men in temperate conditions.', sources: ['efsa_water'] },
      { level: 'practical', ar: 'في الطقس الحار والتمرين تحتاج أكثر. لون البول الفاتح علامة عملية على الترطيب الجيد.', en: 'Hot weather and exercise increase needs. Pale urine is a practical sign of good hydration.' }
    ]
  },
  {
    id: 'method', icon: '🔬', title: { ar: 'كيف يرتّب MEGO الأطعمة', en: 'How MEGO ranks foods' },
    summary: { ar: 'منهجية شفافة من بيانات منشورة.', en: 'A transparent method based on published data.' },
    sections: [
      { level: 'practical', ar: 'كل القيم من USDA FoodData Central (لكل 100 غ). كل ترتيب مجموع موزون لمؤشرات من 0 إلى 1، والأوزان تتغير حسب هدفك (تنشيف / ثبات / بناء).', en: 'All values come from USDA FoodData Central (per 100 g). Each ranking is a weighted sum of 0–1 indicators; weights change with your goal (cut / maintain / build).', sources: ['usda'] },
      { level: 'established', ar: 'درجة الأحماض الأمينية: أقل نسبة بين كل حمض أميني أساسي (ملغ لكل غ بروتين) والنمط المرجعي للبالغين (FAO/WHO 2007)، بحد أقصى 1.0.', en: 'Amino-acid score: the lowest ratio of each essential amino acid (mg per g protein) to the FAO/WHO 2007 adult reference pattern, capped at 1.0.', sources: ['who_protein', 'fao_protein'] },
      { level: 'practical', ar: 'المصدر الحيواني أو النباتي يُعرض فقط ولا يدخل في الحساب. البيانات الناقصة تظهر «لا بيانات» ولا تُخمَّن.', en: 'Animal or plant origin is shown but never scored. Missing data shows as "no data" and is never guessed.' }
    ]
  }
];
