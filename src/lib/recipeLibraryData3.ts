/**
 * Cooking Guide — flavour recipes (102+). Same rules as the rest of the library: nutrition is always computed from
 * the user's own foods or the USDA rows in recipeRefMap.ts. Every seasoning, oil, sauce and marinade item has an exact
 * weight and is counted ONCE: oil that goes into the marinade is listed once (in `ingredients`) and is not added again
 * for cooking. Weights are the state of the food record: raw meat, raw vegetables, dry rice/pasta.
 */
import type { LibraryRecipe } from './recipeLibraryData';

type Ing = [string, number, string?, string?];
const base = { uncounted: [] as [string, string, number][], tipsAr: [] as string[], tipsEn: [] as string[] };
const R = (r: Omit<LibraryRecipe, 'uncounted' | 'tipsAr' | 'tipsEn'> & { tipsAr?: string[]; tipsEn?: string[] }): LibraryRecipe => ({ ...base, ...r }) as LibraryRecipe;
const ing = (...x: Ing[]) => x;

export const LIBRARY_3: LibraryRecipe[] = [
  // ------------------------------------------------------------ chicken
  R({
    id: 'lib-lemon-herb-chicken', nameAr: 'دجاج مشوي متبّل بالليمون والثوم والأعشاب', nameEn: 'Lemon-garlic herb grilled chicken', emoji: '🍋',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'meal-prep'], prepMin: 10, cookMin: 12, difficulty: 'easy', servings: 4, methods: ['grill', 'pan'],
    ingredients: ing(['صدر دجاج', 800, 'نيء — 4 صدور متوسطة', 'raw — 4 medium breasts'], ['زيت زيتون', 18, 'للتتبيلة (4 ملاعق صغيرة)', 'for the marinade (4 tsp)'], ['عصير ليمون', 45, 'ليمونة كبيرة', '1 large lemon'], ['ثوم', 12, '4 فصوص مهروسة', '4 cloves, crushed']),
    seasonings: ing(['ملح', 5], ['فلفل أسود مطحون', 2], ['بابريكا', 4], ['كمون مطحون', 2], ['أوريجانو مجفف', 2], ['بقدونس طازج', 10, 'مفروم للتزيين', 'chopped, to finish']),
    marinade: ['زيت زيتون', 'عصير ليمون', 'ثوم', 'ملح', 'فلفل أسود مطحون', 'بابريكا', 'كمون مطحون', 'أوريجانو مجفف'],
    marinateMin: 30, tempC: 220,
    stepsAr: [
      'التحضير: افتح كل صدر من المنتصف (فراشة) أو اطرقه حتى سماكة 1.5 سم ليُطهى بالتساوي، ثم جففه بمناديل المطبخ.',
      'التتبيلة: في وعاء اخفق الزيت وعصير الليمون والثوم المهروس والملح والفلفل الأسود والبابريكا والكمون والأوريجانو.',
      'التتبيل: قلّب الدجاج في التتبيلة حتى يُغطّى تماماً، غطِّ الوعاء وضعه في الثلاجة 30 دقيقة على الأقل (حتى 12 ساعة؛ أكثر من ذلك يجعل الليمون القوام طرياً).',
      'التسخين: سخّن الشواية أو مقلاة الشوي على نار متوسطة إلى عالية لمدة 5 دقائق (سطح ≈ 220°م). لا تضف زيتاً إضافياً — زيت التتبيلة كافٍ ومحسوب.',
      'الشوي: ضع الصدور واتركها 5 دقائق دون تحريك حتى تظهر خطوط الشوي، ثم اقلبها 5 دقائق أخرى حتى تصل الحرارة الداخلية إلى 74°م.',
      'الراحة: انقل الدجاج إلى طبق وغطّه بورق القصدير 5 دقائق لتبقى العصارة في الداخل.',
      'التقديم: قطّعه شرائح عكس الألياف، رش البقدونس، وقسّمه 4 حصص متساوية.'
    ],
    stepsEn: [
      'Prep: butterfly or pound each breast to an even 1.5 cm thickness so it cooks evenly, then pat dry with paper towels.',
      'Marinade: whisk the oil, lemon juice, crushed garlic, salt, black pepper, paprika, cumin and oregano in a bowl.',
      'Marinate: turn the chicken in the marinade until fully coated, cover and refrigerate at least 30 min (up to 12 h; longer makes the lemon soften the texture).',
      'Preheat: heat the grill or grill pan over medium-high for 5 min (surface ≈ 220°C). Add no extra oil — the marinade oil is enough and is already counted.',
      'Grill: lay the breasts down and leave them 5 min without moving until marked, flip and cook 5 min more until the centre reaches 74°C.',
      'Rest: move to a plate, tent with foil and rest 5 min so the juices stay inside.',
      'Serve: slice against the grain, sprinkle with parsley and divide into 4 equal portions.'
    ],
    servingAr: 'الحصة = صدر واحد (200 غ نيء ≈ 150 غ مطبوخ). قدّمه مع أرز بالخضار أو خضار مشوية وصلصة الزبادي بالثوم.',
    servingEn: 'One portion = one breast (200 g raw ≈ 150 g cooked). Serve with vegetable rice or roasted vegetables and garlic-yogurt sauce.',
    tipsAr: ['للتحضير المسبق: يُحفظ 4 أيام في الثلاجة.', 'بديل الأوريجانو: زعتر مجفف بنفس الكمية.'], tipsEn: ['Meal prep: keeps 4 days refrigerated.', 'Swap oregano for dried thyme, same amount.']
  }),
  R({
    id: 'lib-yogurt-garlic-chicken', nameAr: 'دجاج بالزبادي والثوم والليمون (فرن أو قلاية هوائية)', nameEn: 'Yogurt, garlic & lemon chicken (oven or air fryer)', emoji: '🍗',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'meal-prep'], prepMin: 15, cookMin: 20, difficulty: 'easy', servings: 4, methods: ['oven', 'air-fryer'],
    ingredients: ing(['صدر دجاج', 800, 'نيء، مكعبات 4 سم', 'raw, 4 cm cubes'], ['زبادي يوناني خالي الدسم', 200], ['عصير ليمون', 30, 'ملعقتان كبيرتان', '2 tbsp'], ['ثوم', 15, '5 فصوص', '5 cloves'], ['زيت زيتون', 10, 'ملعقتان صغيرتان', '2 tsp']),
    seasonings: ing(['ملح', 5], ['فلفل أسود مطحون', 1.5], ['بابريكا', 5], ['كمون مطحون', 2], ['كركم مطحون', 1.5], ['كزبرة خضراء طازجة', 10, 'للتزيين', 'to finish']),
    marinade: ['زبادي يوناني خالي الدسم', 'عصير ليمون', 'ثوم', 'زيت زيتون', 'ملح', 'فلفل أسود مطحون', 'بابريكا', 'كمون مطحون', 'كركم مطحون'],
    marinateMin: 60, tempC: 220,
    stepsAr: [
      'التحضير: قطّع الدجاج مكعبات 4 سم متساوية الحجم.',
      'التتبيلة: اخلط الزبادي وعصير الليمون والثوم المهروس والزيت والملح والفلفل والبابريكا والكمون والكركم حتى يصبح الخليط ناعماً.',
      'التتبيل: أضف الدجاج وقلّبه جيداً، غطّه واتركه في الثلاجة 60 دقيقة على الأقل (حتى 24 ساعة؛ الزبادي يطرّي اللحم).',
      'التسخين: سخّن الفرن على 220°م مع تبطين صينية بورق الزبدة (أو القلاية الهوائية على 200°م 3 دقائق).',
      'الطهي في الفرن: رصّ القطع بمسافات بينها واخبزها 18 دقيقة، ثم شغّل الشواية العلوية دقيقتين للون المشوي. (القلاية الهوائية: 12 دقيقة مع التقليب بعد 6 دقائق.)',
      'التأكد من النضج: الحرارة الداخلية 74°م والعصارة شفافة.',
      'التقديم: اتركه 3 دقائق، رش الكزبرة وقسّمه 4 حصص.'
    ],
    stepsEn: [
      'Prep: cut the chicken into even 4 cm cubes.',
      'Marinade: mix the yogurt, lemon juice, crushed garlic, oil, salt, pepper, paprika, cumin and turmeric until smooth.',
      'Marinate: add the chicken, coat well, cover and refrigerate at least 60 min (up to 24 h; yogurt tenderises the meat).',
      'Preheat: oven to 220°C with a tray lined with baking paper (or the air fryer at 200°C for 3 min).',
      'Oven: spread the pieces apart and bake 18 min, then grill on top for 2 min for charred edges. (Air fryer: 12 min, turning after 6 min.)',
      'Check: the centre reaches 74°C and the juices run clear.',
      'Serve: rest 3 min, sprinkle with coriander and divide into 4 portions.'
    ],
    servingAr: 'الحصة ≈ 200 غ دجاج نيء مع تتبيلتها (كل التتبيلة محسوبة لأن معظمها يلتصق بالدجاج).',
    servingEn: 'One portion ≈ 200 g raw chicken with its marinade (all of the marinade is counted because most of it clings to the chicken).',
    tipsAr: ['أسياخ: اشبك القطع على أسياخ خشبية منقوعة 30 دقيقة في الماء.'], tipsEn: ['Skewers: thread onto wooden skewers soaked 30 min in water.']
  }),
  R({
    id: 'lib-paprika-chicken-thighs', nameAr: 'أفخاذ دجاج بالبابريكا المدخنة والعسل (قلاية هوائية)', nameEn: 'Smoky paprika & honey chicken thighs (air fryer)', emoji: '🔥',
    meals: ['lunch', 'dinner'], tags: ['chicken'], prepMin: 8, cookMin: 20, difficulty: 'easy', servings: 4, methods: ['air-fryer', 'oven'],
    ingredients: ing(['فخذ دجاج بدون جلد', 800, 'نيء بدون عظم وجلد', 'raw, boneless & skinless'], ['زيت زيتون', 10, 'ملعقتان صغيرتان', '2 tsp'], ['عسل', 10, 'ملعقة صغيرة ونصف', '1½ tsp'], ['عصير ليمون', 15, 'ملعقة كبيرة', '1 tbsp']),
    seasonings: ing(['بابريكا', 8, 'مدخنة أو عادية', 'smoked or sweet'], ['بودرة ثوم', 4], ['بودرة بصل', 3], ['ملح', 5], ['فلفل أسود مطحون', 1.5], ['شطة مطحونة (فلفل أحمر حار)', 0.5], ['زعتر مجفف', 1]),
    marinade: ['زيت زيتون', 'عسل', 'عصير ليمون', 'بابريكا', 'بودرة ثوم', 'بودرة بصل', 'ملح', 'فلفل أسود مطحون', 'شطة مطحونة (فلفل أحمر حار)', 'زعتر مجفف'],
    marinateMin: 15, tempC: 200,
    stepsAr: [
      'التحضير: جفف الأفخاذ جيداً بالمناديل — الجلد الجاف من الخارج يعطي قشرة مقرمشة.',
      'خلطة البهارات: اخلط البابريكا وبودرة الثوم وبودرة البصل والملح والفلفل والشطة والزعتر.',
      'التتبيل: ادهن الأفخاذ بالزيت والعسل وعصير الليمون ثم افرك خلطة البهارات من الجهتين، واتركها 15 دقيقة على الأقل (حتى ليلة كاملة في الثلاجة).',
      'التسخين: سخّن القلاية الهوائية على 200°م لمدة 3 دقائق.',
      'الطهي: رصّ الأفخاذ في طبقة واحدة واطهها 10 دقائق، اقلبها ثم 8–10 دقائق أخرى حتى تصل الحرارة الداخلية إلى 74°م أو أكثر. (الفرن: 220°م لمدة 25 دقيقة.)',
      'الراحة والتقديم: اتركها 3 دقائق ثم قسّمها 4 حصص (فخذان لكل حصة تقريباً).'
    ],
    stepsEn: [
      'Prep: pat the thighs very dry — a dry surface gives a crisp crust.',
      'Spice mix: combine paprika, garlic powder, onion powder, salt, pepper, cayenne and thyme.',
      'Marinate: brush the thighs with the oil, honey and lemon juice, rub the spice mix on both sides and leave at least 15 min (up to overnight in the fridge).',
      'Preheat the air fryer to 200°C for 3 min.',
      'Cook: one layer, 10 min, flip, then 8–10 min more until the centre reaches at least 74°C. (Oven: 220°C for 25 min.)',
      'Rest 3 min and divide into 4 portions (about 2 thighs each).'
    ],
    servingAr: 'الحصة 200 غ أفخاذ نيئة. تناسب البطاطس المقرمشة أو الأرز بالخضار.',
    servingEn: 'One portion = 200 g raw thigh. Goes well with crispy potatoes or vegetable rice.',
    tipsAr: ['بديل العسل: اتركه — توفر نحو 8 سعرات للحصة.'], tipsEn: ['Skip the honey to save about 8 kcal per portion.']
  }),
  R({
    id: 'lib-beef-kofta', nameAr: 'كفتة لحم بالبقدونس والبهارات (شواية أو قلاية هوائية)', nameEn: 'Spiced beef & parsley kofta (grill or air fryer)', emoji: '🍢',
    meals: ['lunch', 'dinner'], tags: ['meat', 'meal-prep'], prepMin: 15, cookMin: 12, difficulty: 'medium', servings: 4, methods: ['grill', 'air-fryer'],
    ingredients: ing(['لحم بقري قليل الدهن 90/10', 600, 'نيء مفروم', 'raw, minced'], ['بصل', 100, 'مبشور ومعصور', 'grated and squeezed'], ['بقدونس طازج', 30, 'مفروم ناعم', 'finely chopped'], ['ثوم', 6, 'فصّان', '2 cloves']),
    seasonings: ing(['ملح', 5], ['كمون مطحون', 2], ['بهار حلو مطحون', 2], ['قرفة مطحونة', 0.5], ['فلفل أسود مطحون', 1.5], ['شطة مطحونة (فلفل أحمر حار)', 0.5]),
    tempC: 200,
    stepsAr: [
      'التحضير: ابشر البصل واعصره جيداً بيدك للتخلص من الماء (حتى لا تتفكك الكفتة).',
      'الخلط: اخلط اللحم والبصل والبقدونس والثوم وجميع البهارات، واعجن 2–3 دقائق حتى يتماسك الخليط.',
      'الراحة: غطِّ الخليط واتركه في الثلاجة 20 دقيقة ليتماسك.',
      'التشكيل: قسّمه 12 قطعة متساوية (≈ 60 غ) وشكّلها أصابع على أسياخ أو بدونها.',
      'الطهي: القلاية الهوائية 200°م لمدة 10 دقائق مع التقليب بعد 5 دقائق، أو الشواية 4 دقائق لكل جهة. الحرارة الداخلية 71°م.',
      'التقديم: 3 أصابع لكل حصة مع سلطة وصلصة طحينة بالليمون.'
    ],
    stepsEn: [
      'Prep: grate the onion and squeeze out its water by hand (so the kofta holds together).',
      'Mix: combine the beef, onion, parsley, garlic and all spices; knead 2–3 min until sticky.',
      'Rest: cover and chill the mixture 20 min to firm up.',
      'Shape: divide into 12 equal pieces (≈ 60 g) and shape into fingers, on skewers or not.',
      'Cook: air fryer 200°C for 10 min, turning after 5 min, or grill 4 min per side. Centre 71°C.',
      'Serve: 3 fingers per portion with salad and tahini-lemon sauce.'
    ],
    servingAr: 'الحصة = 3 أصابع (150 غ لحم نيء). الدهون المتساقطة في القلاية لا تُطرح من الحساب (الحساب يبقى محافظاً).',
    servingEn: 'One portion = 3 fingers (150 g raw beef). Fat that drips off is not subtracted (the count stays conservative).'
  }),
  R({
    id: 'lib-lemon-herb-fish', nameAr: 'سمك بلطي بالليمون والشبت والثوم في الفرن', nameEn: 'Oven-baked tilapia with lemon, dill & garlic', emoji: '🐟',
    meals: ['lunch', 'dinner'], tags: ['fish', 'quick'], prepMin: 8, cookMin: 14, difficulty: 'easy', servings: 2, methods: ['oven'],
    ingredients: ing(['سمك بلطي/تلابيا', 400, 'فيليه نيء', 'raw fillets'], ['زيت زيتون', 10, 'ملعقتان صغيرتان', '2 tsp'], ['عصير ليمون', 30, 'ملعقتان كبيرتان', '2 tbsp'], ['ثوم', 6, 'فصّان', '2 cloves']),
    seasonings: ing(['ملح', 2.5], ['فلفل أسود مطحون', 1], ['كمون مطحون', 1], ['بابريكا', 1.5], ['شبت طازج', 8, 'مفروم', 'chopped']),
    marinade: ['زيت زيتون', 'عصير ليمون', 'ثوم', 'ملح', 'فلفل أسود مطحون', 'كمون مطحون', 'بابريكا'],
    marinateMin: 15, tempC: 200,
    stepsAr: [
      'التحضير: سخّن الفرن على 200°م، وجفف الفيليه بالمناديل.',
      'التتبيلة: اخلط الزيت وعصير الليمون والثوم والملح والفلفل والكمون والبابريكا.',
      'التتبيل: ادهن السمك بالتتبيلة واتركه 15 دقيقة فقط (لا تزد عن 30 دقيقة — حمض الليمون "يطهو" السمك ويجعله هشاً).',
      'الخَبز: ضعه في صينية مبطنة واخبزه 12–14 دقيقة حتى يتفتت بسهولة بالشوكة (الحرارة الداخلية 63°م).',
      'التقديم: رش الشبت الطازج وقدّم كل فيليه كحصة.'
    ],
    stepsEn: [
      'Prep: preheat the oven to 200°C and pat the fillets dry.',
      'Marinade: mix the oil, lemon juice, garlic, salt, pepper, cumin and paprika.',
      'Marinate: brush the fish and leave only 15 min (no more than 30 min — the lemon acid "cooks" fish and makes it mushy).',
      'Bake on a lined tray 12–14 min until it flakes easily with a fork (centre 63°C).',
      'Serve: sprinkle with fresh dill; one fillet per portion.'
    ],
    servingAr: 'الحصة 200 غ سمك نيء. يناسبه الأرز بالخضار أو البطاطا الحلوة المهروسة.',
    servingEn: 'One portion = 200 g raw fish. Pairs with vegetable rice or mashed sweet potato.'
  }),
  // ------------------------------------------------------------ carbs & sides
  R({
    id: 'lib-veg-rice', nameAr: 'أرز بسمتي متبّل بالخضار والكركم', nameEn: 'Seasoned basmati rice with vegetables & turmeric', emoji: '🍚',
    meals: ['lunch', 'dinner'], tags: ['rice', 'side', 'vegetarian', 'meal-prep'], prepMin: 25, cookMin: 22, difficulty: 'easy', servings: 4, methods: ['pot'],
    ingredients: ing(['أرز بسمتي نيء/جاف', 240, 'جاف — 60 غ للحصة', 'dry — 60 g per portion'], ['بازلاء مجمدة', 120], ['جزر', 100, 'مكعبات صغيرة', 'small dice'], ['بصل', 80, 'مفروم', 'chopped'], ['زيت زيتون', 10, 'ملعقتان صغيرتان', '2 tsp'], ['مرق دجاج قليل الصوديوم', 480, 'أو ماء', 'or water']),
    seasonings: ing(['ملح', 3], ['كمون مطحون', 1], ['كركم مطحون', 1.5], ['فلفل أسود مطحون', 0.5], ['هيل مطحون', 0.5], ['بقدونس طازج', 10, 'للتزيين', 'to finish']),
    stepsAr: [
      'الغسل والنقع: اغسل الأرز 3 مرات حتى يصفو الماء، ثم انقعه في ماء بارد 20 دقيقة وصفّه جيداً.',
      'التشويح: سخّن الزيت في قدر على نار متوسطة وشوّح البصل 3 دقائق حتى يذبل، ثم الجزر 3 دقائق.',
      'البهارات: أضف الكمون والكركم والهيل والفلفل وقلّب 30 ثانية حتى تفوح الرائحة.',
      'الأرز: أضف الأرز المصفّى وقلّبه دقيقتين ليتغلف بالبهارات.',
      'الغلي: أضف المرق والملح والبازلاء، ارفع النار حتى الغليان.',
      'الطهي: خفّف النار للأدنى، غطِّ القدر بإحكام واتركه 15 دقيقة دون فتح الغطاء.',
      'الراحة: أطفئ النار واتركه مغطى 10 دقائق، ثم قلّبه بالشوكة ورش البقدونس.'
    ],
    stepsEn: [
      'Wash & soak: rinse the rice 3 times until the water runs clear, soak in cold water 20 min and drain well.',
      'Sauté: heat the oil in a pot over medium heat, soften the onion 3 min, then the carrot 3 min.',
      'Spices: add cumin, turmeric, cardamom and pepper; stir 30 s until fragrant.',
      'Rice: add the drained rice and stir 2 min to coat.',
      'Boil: add the broth, salt and peas; bring to a boil.',
      'Cook: lowest heat, lid on tight, 15 min without lifting the lid.',
      'Rest: off the heat, covered, 10 min; fluff with a fork and sprinkle parsley.'
    ],
    servingAr: 'الحصة = ربع القدر (60 غ أرز جاف ≈ 180 غ مطبوخ مع الخضار). المرق محسوب (≈ 7 سعرات/100 مل).',
    servingEn: 'One portion = a quarter of the pot (60 g dry rice ≈ 180 g cooked with the vegetables). The broth is counted (≈ 7 kcal/100 ml).',
    tipsAr: ['للكارب الأقل: استبدل نصف الأرز بقرنبيط مبشور.'], tipsEn: ['Lower carb: replace half the rice with riced cauliflower.']
  }),
  R({
    id: 'lib-crispy-air-potatoes', nameAr: 'بطاطس مقرمشة بالبابريكا والروزماري (قلاية هوائية)', nameEn: 'Crispy paprika-rosemary air-fryer potatoes', emoji: '🥔',
    meals: ['lunch', 'dinner'], tags: ['side', 'potato', 'vegetarian'], prepMin: 35, cookMin: 22, difficulty: 'easy', servings: 3, methods: ['air-fryer'],
    ingredients: ing(['بطاطس', 600, 'نيئة بالقشر، مكعبات 2.5 سم', 'raw with skin, 2.5 cm cubes'], ['زيت زيتون', 10, 'ملعقتان صغيرتان', '2 tsp'], ['نشا ذرة', 6, 'ملعقتان صغيرتان — للقرمشة', '2 tsp — for crispness']),
    seasonings: ing(['ملح', 3], ['بابريكا', 3], ['بودرة ثوم', 2], ['روزماري مجفف', 1], ['فلفل أسود مطحون', 0.5], ['بقدونس طازج', 5, 'للتزيين', 'to finish']),
    tempC: 200,
    stepsAr: [
      'التحضير: قطّع البطاطس مكعبات 2.5 سم متساوية.',
      'النقع: انقعها في ماء بارد 30 دقيقة لإزالة النشا الزائد (سر القرمشة).',
      'التجفيف: صفّها وجففها تماماً بمنشفة — أي رطوبة تمنع القرمشة.',
      'التتبيل: قلّبها مع الزيت ثم النشا ثم الملح والبابريكا وبودرة الثوم والروزماري والفلفل.',
      'الطهي: القلاية الهوائية 200°م لمدة 20 دقيقة في طبقة واحدة، مع الهز كل 7 دقائق، ثم دقيقتان إضافيتان إن أردت لوناً أغمق.',
      'التقديم: رش البقدونس وقدّمها فوراً.'
    ],
    stepsEn: [
      'Prep: cut the potatoes into even 2.5 cm cubes.',
      'Soak in cold water for 30 min to remove surface starch (the key to crispness).',
      'Dry completely with a towel — any moisture stops them crisping.',
      'Season: toss with the oil, then the cornstarch, then salt, paprika, garlic powder, rosemary and pepper.',
      'Cook: air fryer 200°C for 20 min in one layer, shaking every 7 min; 2 min more for a darker colour.',
      'Serve at once, sprinkled with parsley.'
    ],
    servingAr: 'الحصة 200 غ بطاطس نيئة. طبق جانبي — أضف مصدر بروتين (دجاج بالبابريكا مثلاً).',
    servingEn: 'One portion = 200 g raw potato. A side — add a protein (e.g. paprika chicken).'
  }),
  R({
    id: 'lib-roasted-sweet-potato', nameAr: 'بطاطا حلوة مشوية بالقرفة والبابريكا', nameEn: 'Roasted sweet potatoes with cinnamon & paprika', emoji: '🍠',
    meals: ['lunch', 'dinner', 'snacks'], tags: ['side', 'potato', 'vegetarian', 'meal-prep'], prepMin: 8, cookMin: 28, difficulty: 'easy', servings: 3, methods: ['oven', 'air-fryer'],
    ingredients: ing(['بطاطا حلوة نيئة', 600, 'بالقشر، أصابع أو مكعبات 2.5 سم', 'skin on, 2.5 cm wedges or cubes'], ['زيت زيتون', 10, 'ملعقتان صغيرتان', '2 tsp']),
    seasonings: ing(['قرفة مطحونة', 1], ['بابريكا', 2], ['كمون مطحون', 1], ['ملح', 2], ['فلفل أسود مطحون', 0.5]),
    tempC: 210,
    stepsAr: [
      'التسخين: سخّن الفرن على 210°م وبطّن صينية بورق الزبدة.',
      'التقطيع: اغسل البطاطا وقطّعها أصابع أو مكعبات 2.5 سم بالقشر.',
      'التتبيل: قلّبها مع الزيت ثم القرفة والبابريكا والكمون والملح والفلفل.',
      'الشوي: وزّعها في طبقة واحدة متباعدة واشوها 15 دقيقة، اقلبها ثم 12 دقيقة أخرى حتى تتكرمل الأطراف. (القلاية الهوائية: 200°م لمدة 18 دقيقة مع الهز مرتين.)',
      'التقديم: قسّمها 3 حصص.'
    ],
    stepsEn: [
      'Preheat the oven to 210°C and line a tray with baking paper.',
      'Cut: wash the sweet potatoes and cut into 2.5 cm wedges or cubes, skin on.',
      'Season: toss with the oil, then cinnamon, paprika, cumin, salt and pepper.',
      'Roast in one spaced layer 15 min, turn, then 12 min more until the edges caramelise. (Air fryer: 200°C for 18 min, shaking twice.)',
      'Serve: divide into 3 portions.'
    ],
    servingAr: 'الحصة 200 غ بطاطا حلوة نيئة.', servingEn: 'One portion = 200 g raw sweet potato.'
  }),
  R({
    id: 'lib-mashed-sweet-potato', nameAr: 'بطاطا حلوة مهروسة خفيفة بالحليب والقرفة', nameEn: 'Light mashed sweet potato with milk & cinnamon', emoji: '🥣',
    meals: ['lunch', 'dinner'], tags: ['side', 'potato', 'vegetarian'], prepMin: 8, cookMin: 18, difficulty: 'easy', servings: 4, methods: ['pot'],
    ingredients: ing(['بطاطا حلوة نيئة', 800, 'مقشرة، مكعبات 3 سم', 'peeled, 3 cm cubes'], ['حليب قليل الدسم', 120, 'دافئ', 'warm'], ['زبدة', 10, 'ملعقتان صغيرتان', '2 tsp']),
    seasonings: ing(['ملح', 2], ['قرفة مطحونة', 1], ['جوزة الطيب مطحونة', 0.3], ['فلفل أسود مطحون', 0.5]),
    stepsAr: [
      'السلق: ضع المكعبات في قدر وغطّها بماء بارد مع رشة من الملح المحسوب، واغلِها ثم اتركها 15 دقيقة حتى تلين تماماً بالشوكة.',
      'التصفية: صفّها واتركها في القدر على نار هادئة دقيقتين ليتبخر الماء المتبقي.',
      'الهرس: أضف الزبدة والحليب الدافئ واهرسها حتى النعومة.',
      'التتبيل: أضف باقي الملح والقرفة وجوزة الطيب والفلفل وتذوّق.',
      'التقديم: قسّمها 4 حصص.'
    ],
    stepsEn: [
      'Boil: cover the cubes with cold water and a pinch of the measured salt, bring to a boil and cook 15 min until fork-tender.',
      'Drain and return to the pot over low heat for 2 min to steam off the remaining water.',
      'Mash with the butter and warm milk until smooth.',
      'Season with the rest of the salt, cinnamon, nutmeg and pepper; taste.',
      'Serve: divide into 4 portions.'
    ],
    servingAr: 'الحصة 200 غ بطاطا حلوة نيئة (≈ 170 غ مهروسة). ماء السلق يُسكب ولا يُحسب.',
    servingEn: 'One portion = 200 g raw sweet potato (≈ 170 g mashed). The cooking water is discarded and not counted.'
  }),
  R({
    id: 'lib-roasted-veg-tray', nameAr: 'صينية خضار مشوية بالأعشاب والخل البلسمي', nameEn: 'Herb & balsamic roasted vegetable tray', emoji: '🥦',
    meals: ['lunch', 'dinner'], tags: ['side', 'vegetarian', 'high-fiber', 'meal-prep'], prepMin: 12, cookMin: 25, difficulty: 'easy', servings: 4, methods: ['oven'],
    ingredients: ing(['كوسا', 300, 'أنصاف دوائر 1.5 سم', '1.5 cm half-moons'], ['فلفل رومي (حلو)', 250, 'قطع 3 سم', '3 cm pieces'], ['بروكلي', 250, 'زهرات', 'florets'], ['جزر', 200, 'أصابع رفيعة', 'thin sticks'], ['بصل', 150, 'أرباع', 'quarters'], ['زيت زيتون', 20, '4 ملاعق صغيرة', '4 tsp'], ['خل بلسمي', 15, 'ملعقة كبيرة', '1 tbsp']),
    seasonings: ing(['ملح', 4], ['فلفل أسود مطحون', 1.5], ['بودرة ثوم', 3], ['زعتر مجفف', 1.5], ['أوريجانو مجفف', 1]),
    tempC: 220,
    stepsAr: [
      'التسخين: سخّن الفرن على 220°م وبطّن صينيتين كبيرتين (الازدحام يجعل الخضار تُطهى بالبخار بدل الشوي).',
      'التقطيع: قطّع الخضار بالأحجام المذكورة — الجزر أرفع لأنه يحتاج وقتاً أطول.',
      'التتبيل: في وعاء كبير قلّب الخضار مع الزيت ثم الملح والفلفل وبودرة الثوم والزعتر والأوريجانو.',
      'الشوي: وزّعها في طبقة واحدة واشوها 12 دقيقة، قلّبها ثم 13 دقيقة أخرى حتى تتحمر الأطراف.',
      'اللمسة الأخيرة: رش الخل البلسمي فور الإخراج وقلّب.',
      'التقديم: قسّمها 4 حصص.'
    ],
    stepsEn: [
      'Preheat the oven to 220°C and line two large trays (crowding steams the vegetables instead of roasting them).',
      'Cut the vegetables to the sizes listed — carrots thinner because they take longest.',
      'Season: in a large bowl toss the vegetables with the oil, then salt, pepper, garlic powder, thyme and oregano.',
      'Roast in one layer 12 min, turn, then 13 min more until the edges brown.',
      'Finish: drizzle the balsamic vinegar straight out of the oven and toss.',
      'Serve: divide into 4 portions.'
    ],
    servingAr: 'الحصة ≈ 290 غ خضار نيئة. تُحفظ 4 أيام وتُسخّن في القلاية الهوائية 4 دقائق.',
    servingEn: 'One portion ≈ 290 g raw vegetables. Keeps 4 days; reheat in the air fryer for 4 min.'
  }),
  // ------------------------------------------------------------ pasta
  R({
    id: 'lib-pasta-tomato-chicken', nameAr: 'معكرونة بصلصة الطماطم والريحان مع الدجاج', nameEn: 'Pasta with tomato-basil sauce & chicken', emoji: '🍝',
    meals: ['lunch', 'dinner'], tags: ['pasta', 'chicken', 'meal-prep'], prepMin: 10, cookMin: 25, difficulty: 'easy', servings: 4, methods: ['pot', 'pan'],
    ingredients: ing(['معكرونة نيئة/جافة', 320, 'جافة — 80 غ للحصة', 'dry — 80 g per portion'], ['صدر دجاج', 500, 'نيء، مكعبات 2 سم', 'raw, 2 cm cubes'], ['طماطم مهروسة معلبة', 400, 'علبة', '1 can'], ['معجون طماطم', 30, 'ملعقتان كبيرتان', '2 tbsp'], ['بصل', 80, 'مفروم', 'chopped'], ['ثوم', 12, '4 فصوص', '4 cloves'], ['زيت زيتون', 15, 'ملعقة كبيرة', '1 tbsp'], ['جبن بارميزان مبشور', 20, '4 ملاعق كبيرة', '4 tbsp']),
    seasonings: ing(['ملح', 4, 'للصلصة', 'for the sauce'], ['فلفل أسود مطحون', 1], ['أوريجانو مجفف', 1], ['شطة مطحونة (فلفل أحمر حار)', 0.5], ['عسل', 5, 'يوازن حموضة الطماطم', 'balances the tomato acidity'], ['ريحان طازج', 10, 'أوراق ممزقة', 'torn leaves']),
    waterMl: 2000,
    stepsAr: [
      'الماء: اغلِ لترين من الماء مع ملح (ملح ماء السلق يُسكب معه ولا يُحسب ضمن الوصفة).',
      'المعكرونة: اسلقها 10 دقائق (أقل بدقيقة من العلبة لتبقى متماسكة)، واحتفظ بـ 100 مل من ماء السلق قبل التصفية.',
      'الدجاج: في مقلاة واسعة سخّن الزيت وحمّر الدجاج 6 دقائق حتى يتلون من كل الجهات، ثم أخرجه.',
      'القاعدة: في نفس المقلاة شوّح البصل 4 دقائق، ثم الثوم دقيقة واحدة، ثم معجون الطماطم دقيقة.',
      'الصلصة: أضف الطماطم المهروسة والملح والفلفل والأوريجانو والشطة والعسل، واتركها تغلي بهدوء 10 دقائق.',
      'الجمع: أعد الدجاج 3 دقائق ثم أضف المعكرونة وجزءاً من ماء السلق وقلّب دقيقة حتى تلتصق الصلصة.',
      'التقديم: أطفئ النار، أضف الريحان والبارميزان، وقسّمها 4 حصص متساوية.'
    ],
    stepsEn: [
      'Water: bring 2 L of water to a boil with salt (pasta-water salt is poured away and not counted in the recipe).',
      'Pasta: boil 10 min (1 min less than the packet so it stays firm); keep 100 ml of the water before draining.',
      'Chicken: heat the oil in a wide pan and brown the chicken 6 min on all sides, then remove.',
      'Base: in the same pan soften the onion 4 min, the garlic 1 min, then the tomato paste 1 min.',
      'Sauce: add the crushed tomatoes, salt, pepper, oregano, chili and honey; simmer gently 10 min.',
      'Combine: return the chicken for 3 min, add the pasta and a splash of pasta water and toss 1 min until glossy.',
      'Serve: off the heat add the basil and parmesan; divide into 4 equal portions.'
    ],
    servingAr: 'الحصة = 80 غ معكرونة جافة + 125 غ دجاج نيء مع ربع الصلصة.',
    servingEn: 'One portion = 80 g dry pasta + 125 g raw chicken with a quarter of the sauce.',
    tipsAr: ['معكرونة القمح الكامل تضيف أليافاً بنفس الوزن.'], tipsEn: ['Whole-wheat pasta adds fibre at the same weight.']
  }),
  R({
    id: 'lib-pasta-creamy-mushroom', nameAr: 'معكرونة بصلصة كريمية خفيفة بالفطر والدجاج والسبانخ', nameEn: 'Light creamy mushroom, chicken & spinach pasta', emoji: '🍄',
    meals: ['lunch', 'dinner'], tags: ['pasta', 'chicken'], prepMin: 10, cookMin: 25, difficulty: 'medium', servings: 4, methods: ['pot', 'pan'],
    ingredients: ing(['معكرونة قمح كامل نيئة/جافة', 320, 'جافة', 'dry'], ['صدر دجاج', 450, 'نيء، شرائح رفيعة', 'raw, thin strips'], ['فطر (مشروم) أبيض', 250, 'شرائح', 'sliced'], ['سبانخ', 60], ['حليب قليل الدسم', 300], ['جبن كريمي قليل الدسم', 80], ['جبن بارميزان مبشور', 25], ['نشا ذرة', 10, 'ملعقة كبيرة', '1 tbsp'], ['ثوم', 9, '3 فصوص', '3 cloves'], ['زيت زيتون', 10, 'ملعقتان صغيرتان', '2 tsp']),
    seasonings: ing(['ملح', 4], ['فلفل أسود مطحون', 1.5], ['زعتر مجفف', 1], ['جوزة الطيب مطحونة', 0.2]),
    marinade: ['حليب قليل الدسم', 'جبن كريمي قليل الدسم', 'جبن بارميزان مبشور', 'نشا ذرة', 'جوزة الطيب مطحونة'],
    waterMl: 2000,
    stepsAr: [
      'المعكرونة: اسلقها في لترين من الماء المغلي 10 دقائق، واحتفظ بـ 100 مل من ماء السلق ثم صفّها.',
      'خليط الصلصة: اخفق النشا في الحليب البارد حتى يذوب تماماً (يمنع التكتل).',
      'الدجاج: حمّر شرائح الدجاج في الزيت 5 دقائق مع نصف الملح والفلفل، ثم أخرجها.',
      'الفطر: في نفس المقلاة اطهُ الفطر 5 دقائق على نار عالية حتى يتبخر ماؤه ويتحمر، ثم الثوم والزعتر 30 ثانية.',
      'الصلصة: خفّف النار، أضف خليط الحليب وقلّب باستمرار 3 دقائق حتى تتكثف، ثم الجبن الكريمي والبارميزان وجوزة الطيب وباقي الملح.',
      'الجمع: أضف السبانخ دقيقة حتى تذبل، ثم الدجاج والمعكرونة وقليلاً من ماء السلق لضبط القوام.',
      'التقديم: قسّمها 4 حصص فوراً — الصلصة تتكثف عند البرود.'
    ],
    stepsEn: [
      'Pasta: boil in 2 L of water for 10 min; keep 100 ml of the water and drain.',
      'Sauce base: whisk the cornstarch into the cold milk until fully dissolved (prevents lumps).',
      'Chicken: brown the strips in the oil 5 min with half the salt and pepper, then remove.',
      'Mushrooms: in the same pan cook 5 min over high heat until their water evaporates and they brown; add garlic and thyme for 30 s.',
      'Sauce: lower the heat, pour in the milk mixture and stir constantly 3 min until thick; add the cream cheese, parmesan, nutmeg and the rest of the salt.',
      'Combine: wilt the spinach 1 min, then add the chicken, pasta and a little pasta water to loosen.',
      'Serve at once in 4 portions — the sauce thickens as it cools.'
    ],
    servingAr: 'صلصة "كريمية" بدون قشطة: الحليب قليل الدسم + الجبن الكريمي الخفيف + النشا (كلها محسوبة).',
    servingEn: 'A "creamy" sauce without cream: low-fat milk + light cream cheese + cornstarch (all counted).'
  }),
  // ------------------------------------------------------------ eggs
  R({
    id: 'lib-eggs-garlic-yogurt', nameAr: 'بيض مسلوق بدون قشر على زبادي بالثوم وزبدة البابريكا', nameEn: 'Poached eggs on garlic yogurt with paprika butter', emoji: '🍳',
    meals: ['breakfast', 'dinner'], tags: ['eggs', 'quick', 'breakfast-idea', 'vegetarian'], prepMin: 5, cookMin: 8, difficulty: 'medium', servings: 2, methods: ['pot', 'pan'],
    ingredients: ing(['بيض كامل', 220, '4 بيضات', '4 eggs'], ['زبادي يوناني قليل الدسم', 200], ['ثوم', 3, 'فص واحد', '1 clove'], ['زبدة', 8, 'ملعقتان صغيرتان تقريباً', 'about 2 tsp'], ['خبز عربي أسمر', 60, 'رغيف صغير للتغميس', '1 small pita for dipping']),
    seasonings: ing(['ملح', 1], ['بابريكا', 2], ['شطة مطحونة (فلفل أحمر حار)', 0.3], ['شبت طازج', 5]),
    stepsAr: [
      'الزبادي: اخلط الزبادي مع الثوم المهروس ونصف الملح، ووزّعه في طبقين (بحرارة الغرفة).',
      'الماء: سخّن ماءً بعمق 8 سم حتى يكاد يغلي (فقاعات صغيرة فقط) وأضف ملعقة خل اختيارياً — لا يُحسب لأنه يُسكب.',
      'السلق: اكسر كل بيضة في كوب صغير وأنزلها برفق، واطهها 3 دقائق للصفار السائل (4 دقائق للمتماسك).',
      'زبدة البابريكا: ذوّب الزبدة على نار هادئة 30 ثانية وأطفئ النار ثم أضف البابريكا والشطة.',
      'التقديم: ضع بيضتين فوق كل طبق زبادي، رش زبدة البابريكا والشبت وباقي الملح، وقدّمه مع الخبز.'
    ],
    stepsEn: [
      'Yogurt: mix the yogurt with the crushed garlic and half the salt; spread on 2 plates (room temperature).',
      'Water: heat 8 cm of water until barely simmering (small bubbles only); a spoon of vinegar is optional — not counted as it is poured away.',
      'Poach: crack each egg into a small cup, slide it in gently and cook 3 min for a runny yolk (4 min for set).',
      'Paprika butter: melt the butter over low heat 30 s, take off the heat and stir in the paprika and chili.',
      'Serve: 2 eggs on each yogurt plate, drizzle the paprika butter, add dill and the rest of the salt; serve with the bread.'
    ],
    servingAr: 'الحصة = بيضتان + 100 غ زبادي + 30 غ خبز.', servingEn: 'One portion = 2 eggs + 100 g yogurt + 30 g bread.'
  }),
  R({
    id: 'lib-herb-omelette', nameAr: 'أومليت الأعشاب والخضار بالجبن', nameEn: 'Herb & vegetable cheese omelette', emoji: '🥚',
    meals: ['breakfast', 'dinner'], tags: ['eggs', 'quick', 'breakfast-idea', 'vegetarian'], prepMin: 5, cookMin: 6, difficulty: 'easy', servings: 1, methods: ['pan'],
    ingredients: ing(['بيض كامل', 110, 'بيضتان', '2 eggs'], ['بياض بيض', 99, '3 بياض', '3 whites'], ['طماطم', 60, 'مكعبات', 'diced'], ['فلفل رومي (حلو)', 40, 'مكعبات', 'diced'], ['بصل أخضر', 15, 'عود واحد', '1 stalk'], ['جبن موزاريلا قليلة الدسم', 20], ['زيت زيتون', 4, 'ملعقة صغيرة', '1 tsp']),
    seasonings: ing(['ملح', 0.8], ['فلفل أسود مطحون', 0.3], ['زعتر مجفف', 0.5], ['بقدونس طازج', 5]),
    stepsAr: [
      'الخفق: اخفق البيض والبياض مع الملح والفلفل والزعتر والبقدونس 30 ثانية.',
      'الخضار: سخّن الزيت في مقلاة 24 سم على نار متوسطة وشوّح الفلفل والبصل الأخضر دقيقتين.',
      'البيض: اسكب البيض وحرّك الأطراف نحو المركز أول 30 ثانية، ثم اتركه دقيقتين حتى يتماسك القاع.',
      'الحشو: وزّع الطماطم والجبن على نصفه، غطِّ المقلاة دقيقة واحدة حتى يذوب الجبن.',
      'التقديم: اطوِه نصفين وقدّمه فوراً.'
    ],
    stepsEn: [
      'Whisk the eggs and whites with salt, pepper, thyme and parsley for 30 s.',
      'Vegetables: heat the oil in a 24 cm pan over medium heat and sauté the pepper and spring onion 2 min.',
      'Eggs: pour in, push the edges to the centre for the first 30 s, then leave 2 min until the base sets.',
      'Fill: scatter tomato and cheese over one half, cover 1 min until the cheese melts.',
      'Fold in half and serve immediately.'
    ],
    servingAr: 'حصة واحدة غنية بالبروتين؛ أضف شريحة توست أسمر إن احتجت كارب.', servingEn: 'One high-protein portion; add a slice of whole-wheat toast if you need carbs.'
  }),
  // ------------------------------------------------------------ sauces (healthy, low calorie)
  R({
    id: 'lib-sauce-garlic-yogurt', nameAr: 'صلصة زبادي بالثوم والنعناع', nameEn: 'Garlic-mint yogurt sauce', emoji: '🥛',
    meals: [], tags: ['sauce', 'quick', 'vegetarian'], prepMin: 5, cookMin: 0, difficulty: 'easy', servings: 6, methods: ['no-cook'],
    ingredients: ing(['زبادي يوناني خالي الدسم', 170], ['ثوم', 6, 'فصّان مهروسان', '2 crushed cloves'], ['عصير ليمون', 15, 'ملعقة كبيرة', '1 tbsp'], ['زيت زيتون', 5, 'ملعقة صغيرة', '1 tsp']),
    seasonings: ing(['ملح', 1.5], ['نعناع طازج', 5, 'مفروم', 'chopped'], ['فلفل أسود مطحون', 0.3]),
    stepsAr: ['اهرس الثوم مع الملح حتى يصبح عجينة.', 'اخلطه مع الزبادي وعصير الليمون والنعناع والفلفل.', 'رش الزيت على الوجه واتركها 10 دقائق في الثلاجة لتتداخل النكهات.'],
    stepsEn: ['Crush the garlic with the salt to a paste.', 'Mix with the yogurt, lemon juice, mint and pepper.', 'Drizzle the oil on top and chill 10 min for the flavours to blend.'],
    servingAr: 'الحصة ≈ 33 غ (ملعقتان كبيرتان). تُحفظ 3 أيام.', servingEn: 'One portion ≈ 33 g (2 tbsp). Keeps 3 days.'
  }),
  R({
    id: 'lib-sauce-tahini-lemon', nameAr: 'صلصة طحينة بالليمون (خفيفة)', nameEn: 'Light tahini-lemon sauce', emoji: '🥄',
    meals: [], tags: ['sauce', 'quick', 'vegetarian'], prepMin: 5, cookMin: 0, difficulty: 'easy', servings: 6, methods: ['no-cook'],
    ingredients: ing(['طحينة', 60, '4 ملاعق كبيرة', '4 tbsp'], ['عصير ليمون', 45, '3 ملاعق كبيرة', '3 tbsp'], ['ثوم', 3, 'فص واحد', '1 clove']),
    seasonings: ing(['ملح', 1], ['كمون مطحون', 0.5]),
    waterMl: 45,
    stepsAr: ['اخفق الطحينة مع عصير الليمون — ستتكثف أولاً وهذا طبيعي.', 'أضف 45 مل ماء بارد تدريجياً مع الخفق حتى يصبح القوام كريمياً.', 'أضف الثوم المهروس والملح والكمون وتذوّق.'],
    stepsEn: ['Whisk the tahini with the lemon juice — it seizes and thickens at first, which is normal.', 'Whisk in 45 ml cold water gradually until creamy.', 'Add the crushed garlic, salt and cumin; taste.'],
    servingAr: 'الحصة ≈ 25 غ (ملعقة ونصف كبيرة). الماء 0 سعرة.', servingEn: 'One portion ≈ 25 g (1½ tbsp). The water is 0 kcal.'
  }),
  R({
    id: 'lib-sauce-tomato-salsa', nameAr: 'سالسا طماطم طازجة بالكزبرة والليم', nameEn: 'Fresh tomato salsa with coriander & lime', emoji: '🍅',
    meals: [], tags: ['sauce', 'quick', 'vegetarian'], prepMin: 10, cookMin: 0, difficulty: 'easy', servings: 4, methods: ['no-cook'],
    ingredients: ing(['طماطم', 300, 'مكعبات صغيرة بدون بذور', 'small dice, seeded'], ['بصل', 60, 'أحمر مفروم ناعم', 'red, finely chopped'], ['فلفل حار أخضر', 10, 'نصف حبة', 'half a chili'], ['عصير ليم (لايم)', 20], ['زيت زيتون', 5, 'ملعقة صغيرة', '1 tsp']),
    seasonings: ing(['كزبرة خضراء طازجة', 15], ['ملح', 2]),
    stepsAr: ['افرم الطماطم والبصل والفلفل الحار والكزبرة.', 'أضف عصير الليم والزيت والملح وقلّب.', 'اتركها 15 دقيقة قبل التقديم لتخرج العصارة.'],
    stepsEn: ['Dice the tomato, onion, chili and coriander.', 'Add the lime juice, oil and salt; stir.', 'Leave 15 min before serving so the juices come out.'],
    servingAr: 'الحصة ≈ 100 غ. مع الدجاج المشوي أو البيض أو التورتيلا.', servingEn: 'One portion ≈ 100 g. With grilled chicken, eggs or tortillas.'
  }),
  R({
    id: 'lib-sauce-honey-mustard', nameAr: 'صلصة الزبادي بالخردل والعسل', nameEn: 'Honey-mustard yogurt sauce', emoji: '🍯',
    meals: [], tags: ['sauce', 'quick', 'vegetarian'], prepMin: 3, cookMin: 0, difficulty: 'easy', servings: 6, methods: ['no-cook'],
    ingredients: ing(['زبادي يوناني خالي الدسم', 150], ['خردل', 30, '2 ملعقة كبيرة', '2 tbsp'], ['عسل', 15, 'ملعقتان صغيرتان', '2 tsp'], ['عصير ليمون', 10, 'ملعقتان صغيرتان', '2 tsp']),
    seasonings: ing(['ملح', 0.5], ['فلفل أسود مطحون', 0.3]),
    stepsAr: ['اخلط كل المكونات حتى النعومة.', 'تذوّق واضبط الحموضة بالليمون.'],
    stepsEn: ['Whisk everything until smooth.', 'Taste and adjust the acidity with lemon.'],
    servingAr: 'الحصة ≈ 34 غ (ملعقتان كبيرتان). بديل خفيف لصلصات المطاعم.', servingEn: 'One portion ≈ 34 g (2 tbsp). A light swap for restaurant dips.'
  }),
  R({
    id: 'lib-sauce-chimichurri', nameAr: 'صلصة الأعشاب الخضراء (تشيميتشوري خفيفة)', nameEn: 'Light green herb sauce (chimichurri-style)', emoji: '🌿',
    meals: [], tags: ['sauce', 'quick', 'vegetarian'], prepMin: 10, cookMin: 0, difficulty: 'easy', servings: 6, methods: ['no-cook'],
    ingredients: ing(['بقدونس طازج', 40], ['كزبرة خضراء طازجة', 10], ['ثوم', 6, 'فصّان', '2 cloves'], ['خل أحمر', 20], ['زيت زيتون', 20, '4 ملاعق صغيرة', '4 tsp']),
    seasonings: ing(['أوريجانو مجفف', 1], ['شطة مطحونة (فلفل أحمر حار)', 0.5], ['ملح', 1.5]),
    waterMl: 20,
    stepsAr: ['افرم البقدونس والكزبرة والثوم فرماً ناعماً جداً (أو انبضها في الخلاط 5 مرات).', 'أضف الخل والزيت و20 مل ماء والأوريجانو والشطة والملح.', 'اتركها 20 دقيقة قبل التقديم.'],
    stepsEn: ['Chop the parsley, coriander and garlic very finely (or pulse 5 times in a blender).', 'Add the vinegar, oil, 20 ml water, oregano, chili and salt.', 'Rest 20 min before serving.'],
    servingAr: 'الحصة ≈ 16 غ (ملعقة كبيرة). نصف الزيت المعتاد واستُبدل الباقي بالماء.', servingEn: 'One portion ≈ 16 g (1 tbsp). Half the usual oil; the rest replaced with water.'
  }),
  R({
    id: 'lib-sauce-spicy-yogurt', nameAr: 'صلصة سريراتشا بالزبادي (حارة خفيفة)', nameEn: 'Light sriracha yogurt sauce', emoji: '🌶️',
    meals: [], tags: ['sauce', 'quick', 'vegetarian'], prepMin: 3, cookMin: 0, difficulty: 'easy', servings: 6, methods: ['no-cook'],
    ingredients: ing(['زبادي يوناني خالي الدسم', 150], ['صلصة حارة (سريراتشا)', 25, 'ملعقة ونصف كبيرة', '1½ tbsp'], ['مايونيز لايت', 15, 'ملعقة كبيرة', '1 tbsp'], ['عصير ليم (لايم)', 10], ['ثوم', 3, 'فص واحد', '1 clove']),
    seasonings: ing(['ملح', 0.5]),
    stepsAr: ['اخلط كل المكونات حتى يصبح اللون متجانساً.', 'اضبط الحرارة بإضافة السريراتشا تدريجياً (كل 5 غ ≈ 5 سعرات).'],
    stepsEn: ['Whisk everything until evenly coloured.', 'Adjust the heat by adding sriracha gradually (each 5 g ≈ 5 kcal).'],
    servingAr: 'الحصة ≈ 34 غ. مع الدجاج أو التاكو أو البطاطس.', servingEn: 'One portion ≈ 34 g. With chicken, tacos or potatoes.'
  })
];
