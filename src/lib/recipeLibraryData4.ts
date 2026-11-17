/**
 * Library part 4 — practical high-protein meals built around chicken, eggs, rice, potatoes, sweet potatoes, pasta,
 * mozzarella, Greek yogurt, olive oil, vegetables, fruit and moderate honey (no whey, no oats). Same rules as the
 * rest of the library: every ingredient, oil, cheese, sauce and spice has an exact weight and is counted once from
 * the user's foods or the USDA rows in recipeRefMap.ts. Weights are the state of the food record (raw meat, raw
 * potatoes, dry rice/pasta).
 */
import type { LibraryRecipe } from './recipeLibraryData';

type Ing = [string, number, string?, string?];
const base = { uncounted: [] as [string, string, number][], tipsAr: [] as string[], tipsEn: [] as string[] };
const R = (r: Omit<LibraryRecipe, 'uncounted' | 'tipsAr' | 'tipsEn'> & { tipsAr?: string[]; tipsEn?: string[] }): LibraryRecipe => ({ ...base, ...r }) as LibraryRecipe;
const ing = (...x: Ing[]) => x;
const FRIDGE3 = { storageAr: 'في علبة محكمة بالثلاجة حتى 3 أيام. سخّن في الميكروويف 2–3 دقائق أو في الفرن 180°م 10 دقائق حتى يسخن جيداً.', storageEn: 'Airtight in the fridge up to 3 days. Reheat 2–3 min in the microwave or 10 min at 180°C until piping hot.' };
const FRIDGE2 = { storageAr: 'بالثلاجة حتى يومين في علبة محكمة. يُفضّل تسخينه في المقلاة أو القلاية الهوائية ليحافظ على قوامه.', storageEn: 'Fridge up to 2 days, airtight. Best reheated in a pan or the air fryer to keep the texture.' };
const FRESH = { storageAr: 'يُؤكل طازجاً. يمكن تحضير المكونات مسبقاً وحفظها منفصلة بالثلاجة يوماً واحداً.', storageEn: 'Best eaten fresh. The components can be prepared ahead and kept separately in the fridge for 1 day.' };

export const LIBRARY_4: LibraryRecipe[] = [
  // ------------------------------------------------------------ chicken & potatoes
  R({
    id: 'lib4-chicken-potato-mozzarella', nameAr: 'صدر دجاج مع بطاطس محمّرة وموزاريلا ذائبة', nameEn: 'Chicken breast with roasted potatoes & melted mozzarella', emoji: '🧀',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'potato', 'meal-prep'], prepMin: 15, cookMin: 35, difficulty: 'easy', servings: 2, methods: ['oven'], ...FRIDGE3,
    ingredients: ing(['صدر دجاج', 360, 'نيء — صدران متوسطان', 'raw — 2 medium breasts'], ['بطاطس', 400, 'نيئة، مكعبات 2.5 سم', 'raw, 2.5 cm cubes'], ['جبن موزاريلا قليلة الدسم', 60, 'مبشورة', 'grated'], ['زيت زيتون', 14, 'ملعقة كبيرة', '1 tbsp'], ['فلفل رومي (حلو)', 120, 'شرائح', 'sliced']),
    seasonings: ing(['ثوم', 9, '3 فصوص مهروسة', '3 cloves, crushed'], ['ملح', 4], ['فلفل أسود مطحون', 1.5], ['بابريكا', 4], ['أوريجانو مجفف', 1.5], ['روزماري مجفف', 1], ['بقدونس طازج', 8, 'مفروم للتزيين', 'chopped, to finish']),
    tempC: 220,
    stepsAr: [
      'سخّن الفرن إلى 220°م (هواء ساخن 200°م) وبطّن صينية كبيرة بورق الزبدة.',
      'قلّب مكعبات البطاطس مع نصف الزيت (7 غ) ونصف الملح والبابريكا والروزماري، وافردها في طبقة واحدة. اخبزها 15 دقيقة.',
      'في الأثناء اطرق الصدور حتى سماكة 2 سم، وادهنها بباقي الزيت والثوم والأوريجانو والفلفل الأسود وباقي الملح والبابريكا.',
      'حرّك البطاطس، أضف الفلفل الرومي، وضع الدجاج في منتصف الصينية. اخبز 15–18 دقيقة حتى تصل حرارة الدجاج الداخلية إلى 74°م.',
      'وزّع الموزاريلا فوق الدجاج وأعد الصينية 3 دقائق حتى تذوب الجبنة وتبدأ بالتحمير.',
      'رش البقدونس وقسّم على طبقين متساويين.'
    ],
    stepsEn: [
      'Heat the oven to 220°C (fan 200°C) and line a large tray with baking paper.',
      'Toss the potato cubes with half the oil (7 g), half the salt, the paprika and rosemary; spread in one layer and bake 15 min.',
      'Meanwhile pound the breasts to 2 cm and rub with the rest of the oil, the garlic, oregano, pepper and the rest of the salt and paprika.',
      'Stir the potatoes, add the peppers and put the chicken in the middle. Bake 15–18 min until the chicken reaches 74°C inside.',
      'Scatter the mozzarella over the chicken and return 3 min until melted and starting to brown.',
      'Finish with parsley and divide between two plates.'
    ],
    tipsAr: ['بديل: بطاطا حلوة بدل البطاطس (نفس الوقت).', 'لقرمشة أكثر جفف البطاطس جيداً قبل الزيت.'], tipsEn: ['Swap: sweet potato for potato (same timing).', 'For crisper potatoes, dry them well before oiling.']
  }),
  R({
    id: 'lib4-creamy-chicken-potato-casserole', nameAr: 'كسرولة الدجاج والبطاطس الكريمية (خفيفة)', nameEn: 'Light creamy chicken & potato casserole', emoji: '🥘',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'potato', 'meal-prep'], prepMin: 20, cookMin: 40, difficulty: 'medium', servings: 4, methods: ['oven', 'pan'], ...FRIDGE3,
    ingredients: ing(['صدر دجاج', 600, 'نيء، مكعبات', 'raw, cubed'], ['بطاطس', 700, 'نيئة، شرائح 5 مم', 'raw, 5 mm slices'], ['حليب قليل الدسم', 400], ['جبن كريمي قليل الدسم', 60], ['نشا ذرة', 18, 'ملعقة ونصف كبيرة', '1½ tbsp'], ['جبن موزاريلا قليلة الدسم', 80, 'مبشورة', 'grated'], ['جبن بارميزان مبشور', 20], ['فطر (مشروم) أبيض', 200, 'شرائح', 'sliced'], ['بصل', 100, 'مفروم', 'chopped'], ['زيت زيتون', 10]),
    seasonings: ing(['ثوم', 12, '4 فصوص', '4 cloves'], ['ملح', 6], ['فلفل أسود مطحون', 2], ['جوزة الطيب مطحونة', 0.5, 'رشة', 'a pinch'], ['زعتر مجفف', 1.5], ['بقدونس طازج', 10]),
    tempC: 190,
    stepsAr: [
      'اسلق شرائح البطاطس في ماء مملح 6 دقائق فقط ثم صفّها (تكمل الطهي في الفرن). سخّن الفرن 190°م.',
      'في مقلاة واسعة سخّن الزيت وقلّب البصل 4 دقائق، أضف الدجاج 5 دقائق حتى يبيض من الخارج، ثم الفطر والثوم دقيقتين.',
      'الصلصة: اخلط النشا مع 100 مل من الحليب البارد حتى يذوب، ثم أضفه مع باقي الحليب والجبن الكريمي إلى المقلاة. قلّب 3–4 دقائق حتى تتكاثف.',
      'تبّل بالملح والفلفل وجوزة الطيب والزعتر وارفع عن النار.',
      'في صينية 20×30 سم رتب نصف البطاطس، ثم خليط الدجاج، ثم باقي البطاطس. وزّع الموزاريلا والبارميزان على الوجه.',
      'اخبز 25 دقيقة حتى يغلي الجوانب ويتحمّر الوجه. اتركها 5 دقائق ثم رش البقدونس وقسّمها 4 مربعات متساوية.'
    ],
    stepsEn: [
      'Parboil the potato slices in salted water for just 6 min and drain (they finish in the oven). Heat the oven to 190°C.',
      'In a wide pan heat the oil and soften the onion 4 min, add the chicken 5 min until white outside, then the mushrooms and garlic 2 min.',
      'Sauce: whisk the cornstarch into 100 ml cold milk, add it with the rest of the milk and the cream cheese to the pan; stir 3–4 min until thick.',
      'Season with salt, pepper, nutmeg and thyme; take off the heat.',
      'In a 20×30 cm dish layer half the potatoes, then the chicken mixture, then the rest of the potatoes. Top with mozzarella and parmesan.',
      'Bake 25 min until bubbling at the edges and golden on top. Rest 5 min, add parsley and cut into 4 equal squares.'
    ],
    tipsAr: ['الكريمة هنا من الحليب والجبن الكريمي الخفيف والنشا — نفس القوام بسعرات أقل بكثير من الكريمة.'], tipsEn: ['The creaminess comes from milk, light cream cheese and cornstarch — the same texture for far fewer calories than cream.']
  }),
  R({
    id: 'lib4-airfryer-chicken-potato-bowl', nameAr: 'بول الدجاج والبطاطس بالقلاية الهوائية مع صوص الثوم والأعشاب', nameEn: 'Air-fryer chicken & potato bowl with garlic-herb yogurt', emoji: '🥣',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'potato', 'quick'], prepMin: 10, cookMin: 25, difficulty: 'easy', servings: 1, methods: ['air-fryer', 'no-cook'], ...FRIDGE2,
    ingredients: ing(['صدر دجاج', 180, 'نيء، مكعبات 3 سم', 'raw, 3 cm cubes'], ['بطاطس', 220, 'نيئة، مكعبات 2 سم', 'raw, 2 cm cubes'], ['زيت زيتون', 8, '2 ملعقة صغيرة', '2 tsp'], ['خيار', 80], ['طماطم', 80], ['زبادي يوناني خالي الدسم', 80, 'للصوص', 'for the sauce']),
    seasonings: ing(['ثوم', 3, 'فص مهروس للصوص', '1 clove, crushed, for the sauce'], ['عصير ليمون', 10], ['شبت طازج', 4], ['بقدونس طازج', 4], ['ملح', 2], ['فلفل أسود مطحون', 1], ['بابريكا', 3], ['بودرة ثوم', 2], ['كمون مطحون', 1]),
    marinade: ['زبادي يوناني خالي الدسم', 'ثوم', 'عصير ليمون', 'شبت طازج', 'بقدونس طازج'],
    tempC: 200,
    stepsAr: [
      'سخّن القلاية الهوائية 200°م لمدة 3 دقائق.',
      'قلّب البطاطس مع 4 غ زيت ونصف الملح والبابريكا، واطهها 10 دقائق.',
      'قلّب الدجاج مع 4 غ زيت وبودرة الثوم والكمون والفلفل وباقي الملح. أضفه للبطاطس وهزّ السلة، واطهها 12–14 دقيقة مع الهز في المنتصف حتى يصل الدجاج إلى 74°م.',
      'الصوص: اخلط الزبادي مع الثوم المهروس وعصير الليمون والشبت والبقدونس.',
      'رتّب في وعاء: البطاطس والدجاج والخيار والطماطم المقطعة، ثم الصوص فوقها.'
    ],
    stepsEn: [
      'Preheat the air fryer to 200°C for 3 min.',
      'Toss the potatoes with 4 g oil, half the salt and the paprika; cook 10 min.',
      'Toss the chicken with 4 g oil, garlic powder, cumin, pepper and the rest of the salt. Add to the potatoes, shake and cook 12–14 min, shaking halfway, until the chicken reaches 74°C.',
      'Sauce: mix the yogurt with the crushed garlic, lemon juice, dill and parsley.',
      'Build the bowl: potatoes and chicken, chopped cucumber and tomato, sauce on top.'
    ]
  }),
  R({
    id: 'lib4-chicken-sweet-potato-tray', nameAr: 'دجاج بالفرن مع بطاطا حلوة وسبانخ', nameEn: 'Baked chicken with sweet potatoes & spinach', emoji: '🍠',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'potato', 'meal-prep', 'high-fiber'], prepMin: 15, cookMin: 30, difficulty: 'easy', servings: 2, methods: ['oven'], ...FRIDGE3,
    ingredients: ing(['صدر دجاج', 360], ['بطاطا حلوة نيئة', 400, 'مكعبات 2.5 سم', '2.5 cm cubes'], ['سبانخ', 100, 'طازجة', 'fresh'], ['بصل', 80, 'أهلّة', 'wedges'], ['زيت زيتون', 14], ['عسل', 8, 'ملعقة صغيرة للتلميع', '1 tsp, to glaze']),
    seasonings: ing(['ثوم', 6], ['ملح', 4], ['فلفل أسود مطحون', 1.5], ['بابريكا', 4], ['كمون مطحون', 2], ['قرفة مطحونة', 0.5, 'رشة على البطاطا', 'a pinch on the sweet potato'], ['عصير ليمون', 10]),
    tempC: 210,
    stepsAr: [
      'سخّن الفرن 210°م. قلّب البطاطا الحلوة والبصل مع 7 غ زيت ونصف الملح والقرفة واخبزها 12 دقيقة.',
      'ادهن الدجاج بباقي الزيت والثوم والبابريكا والكمون والفلفل وباقي الملح.',
      'ضع الدجاج في الصينية مع البطاطا واخبز 16–18 دقيقة حتى 74°م في الداخل. اخلط العسل مع عصير الليمون وادهن به البطاطا في آخر 5 دقائق.',
      'أخرج الصينية وأضف السبانخ فوق البطاطا الساخنة وقلّب دقيقة حتى تذبل.',
      'قطّع الدجاج وقسّم على طبقين.'
    ],
    stepsEn: [
      'Heat the oven to 210°C. Toss the sweet potato and onion with 7 g oil, half the salt and the cinnamon; bake 12 min.',
      'Rub the chicken with the rest of the oil, the garlic, paprika, cumin, pepper and the rest of the salt.',
      'Add the chicken and bake 16–18 min to 74°C inside. Mix the honey with the lemon juice and brush it over the sweet potato for the last 5 min.',
      'Take the tray out, pile the spinach on the hot sweet potatoes and toss 1 min until wilted.',
      'Slice the chicken and divide between two plates.'
    ]
  }),
  R({
    id: 'lib4-chicken-potato-skillet', nameAr: 'طاسة الدجاج والبطاطس بالبهارات المصرية', nameEn: 'Egyptian-spiced chicken & potato skillet', emoji: '🍳',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'potato'], prepMin: 10, cookMin: 25, difficulty: 'easy', servings: 2, methods: ['pan'], ...FRIDGE3,
    ingredients: ing(['صدر دجاج', 340, 'مكعبات', 'cubed'], ['بطاطس', 350, 'مكعبات 1.5 سم', '1.5 cm cubes'], ['بصل', 100], ['فلفل رومي (حلو)', 120], ['طماطم', 150], ['زيت زيتون', 14]),
    seasonings: ing(['ثوم', 9], ['ملح', 4], ['فلفل أسود مطحون', 1.5], ['كمون مطحون', 2], ['كزبرة ناشفة مطحونة', 2], ['بهار حلو مطحون', 1], ['شطة مطحونة (فلفل أحمر حار)', 0.5], ['كزبرة خضراء طازجة', 8]),
    stepsAr: [
      'سخّن 8 غ زيت في مقلاة واسعة غير لاصقة على نار متوسطة. أضف البطاطس ورشة ملح، غطِّ واطهها 10 دقائق مع التقليب كل 3 دقائق.',
      'ارفع الغطاء، أضف البصل والفلفل 4 دقائق.',
      'أبعد الخضار للجانب، أضف باقي الزيت والدجاج والثوم والبهارات (كمون، كزبرة، بهار حلو، شطة، فلفل) وباقي الملح. قلّب 6–7 دقائق حتى ينضج الدجاج.',
      'أضف الطماطم المقطعة دقيقتين حتى تلين وتغلف المكونات.',
      'رش الكزبرة الخضراء وقسّم إلى حصتين.'
    ],
    stepsEn: [
      'Heat 8 g oil in a wide non-stick pan over medium. Add the potatoes and a pinch of salt; cover and cook 10 min, stirring every 3 min.',
      'Uncover, add the onion and pepper for 4 min.',
      'Push the vegetables aside, add the rest of the oil, the chicken, garlic and spices (cumin, coriander, allspice, chilli, pepper) and the rest of the salt. Stir 6–7 min until cooked.',
      'Add the chopped tomato for 2 min until it softens and coats everything.',
      'Finish with fresh coriander and split into two portions.'
    ]
  }),
  R({
    id: 'lib4-wedges-seasoned-chicken', nameAr: 'أصابع بطاطس مقرمشة مع شرائح دجاج متبلة', nameEn: 'Crispy potato wedges with seasoned chicken strips', emoji: '🍟',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'potato', 'quick'], prepMin: 10, cookMin: 25, difficulty: 'easy', servings: 1, methods: ['air-fryer', 'oven'], ...FRIDGE2,
    ingredients: ing(['صدر دجاج', 180, 'شرائح 2 سم', '2 cm strips'], ['بطاطس', 250, 'أصابع (ودجز) بقشرها', 'wedges, skin on'], ['زيت زيتون', 8], ['نشا ذرة', 6, 'لقرمشة البطاطس', 'for crisp wedges'], ['زبادي يوناني خالي الدسم', 60, 'للغموس', 'for dipping']),
    seasonings: ing(['ملح', 2], ['بابريكا', 4], ['بودرة ثوم', 2], ['بودرة بصل', 1], ['فلفل أسود مطحون', 1], ['أوريجانو مجفف', 1], ['صلصة حارة (سريراتشا)', 8, 'للغموس', 'for the dip']),
    tempC: 200,
    stepsAr: [
      'انقع أصابع البطاطس في ماء بارد 10 دقائق ثم جففها تماماً.',
      'قلّبها مع النشا ثم 4 غ زيت ونصف الملح ونصف البابريكا. اطهها في القلاية 200°م 10 دقائق (أو الفرن 220°م 20 دقيقة).',
      'تبّل شرائح الدجاج بباقي الزيت والبابريكا وبودرة الثوم والبصل والأوريجانو والفلفل وباقي الملح.',
      'أضف الدجاج للسلة مع البطاطس واطهها 10–12 دقيقة أخرى مع الهز حتى يتحمّر الدجاج ويصل إلى 74°م.',
      'الغموس: اخلط الزبادي مع السريراتشا. قدّم فوراً.'
    ],
    stepsEn: [
      'Soak the wedges in cold water 10 min, then dry them completely.',
      'Toss with the cornstarch, then 4 g oil, half the salt and half the paprika. Air-fry at 200°C for 10 min (or oven 220°C for 20 min).',
      'Season the chicken strips with the rest of the oil and paprika, garlic and onion powder, oregano, pepper and the rest of the salt.',
      'Add the chicken to the basket and cook 10–12 min more, shaking, until browned and 74°C inside.',
      'Dip: stir the sriracha into the yogurt. Serve straight away.'
    ]
  }),
  // ------------------------------------------------------------ pasta
  R({
    id: 'lib4-creamy-chicken-mozzarella-pasta', nameAr: 'مكرونة الدجاج الكريمية بالموزاريلا', nameEn: 'Creamy chicken mozzarella pasta', emoji: '🍝',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'pasta'], prepMin: 10, cookMin: 20, difficulty: 'easy', servings: 2, methods: ['pot', 'pan'], ...FRIDGE3,
    ingredients: ing(['معكرونة نيئة/جافة', 140, 'جافة', 'dry'], ['صدر دجاج', 300, 'مكعبات', 'cubed'], ['حليب قليل الدسم', 250], ['جبن كريمي قليل الدسم', 40], ['نشا ذرة', 8], ['جبن موزاريلا قليلة الدسم', 60, 'مبشورة', 'grated'], ['سبانخ', 80], ['زيت زيتون', 7]),
    seasonings: ing(['ثوم', 9], ['ملح', 4], ['فلفل أسود مطحون', 1.5], ['ريحان مجفف', 1], ['شطة مطحونة (فلفل أحمر حار)', 0.3, 'اختياري', 'optional']),
    stepsAr: [
      'اسلق المعكرونة في ماء مملح حسب العبوة ناقص دقيقة، واحتفظ بـ 100 مل من ماء السلق.',
      'سخّن الزيت في مقلاة وحمّر الدجاج المتبل بنصف الملح والفلفل 6–7 دقائق حتى ينضج، ثم أضف الثوم 30 ثانية.',
      'اخلط النشا في الحليب البارد وأضفه مع الجبن الكريمي. حرّك 3 دقائق حتى يتكاثف.',
      'أضف السبانخ والريحان وباقي الملح، ثم المعكرونة والموزاريلا. قلّب دقيقة حتى تذوب الجبنة، وخفّف بماء السلق إن لزم.',
      'قسّم إلى طبقين متساويين.'
    ],
    stepsEn: [
      'Boil the pasta in salted water 1 min less than the packet says; keep 100 ml of the cooking water.',
      'Heat the oil and brown the chicken, seasoned with half the salt and the pepper, 6–7 min until cooked; add the garlic for 30 s.',
      'Whisk the cornstarch into the cold milk and add with the cream cheese. Stir 3 min until thick.',
      'Add the spinach, basil and the rest of the salt, then the pasta and mozzarella. Toss 1 min until melted; loosen with pasta water if needed.',
      'Divide into two equal plates.'
    ]
  }),
  R({
    id: 'lib4-garlic-parmesan-chicken-pasta', nameAr: 'مكرونة الدجاج بالثوم والبارميزان', nameEn: 'Garlic parmesan chicken pasta', emoji: '🧄',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'pasta', 'quick'], prepMin: 5, cookMin: 15, difficulty: 'easy', servings: 2, methods: ['pot', 'pan'], ...FRIDGE2,
    ingredients: ing(['معكرونة نيئة/جافة', 140], ['صدر دجاج', 300], ['جبن بارميزان مبشور', 30], ['زبدة', 10], ['زيت زيتون', 7], ['بروكلي', 150, 'زهرات', 'florets'], ['مرق دجاج قليل الصوديوم', 150]),
    seasonings: ing(['ثوم', 15, '5 فصوص شرائح', '5 cloves, sliced'], ['ملح', 3], ['فلفل أسود مطحون', 2], ['بقدونس طازج', 8], ['عصير ليمون', 10]),
    stepsAr: [
      'اسلق المعكرونة مع البروكلي في آخر 3 دقائق، ثم صفّها.',
      'سخّن الزيت وحمّر الدجاج المقطع شرائح مع الملح والفلفل 6–7 دقائق، ثم ارفعه.',
      'في نفس المقلاة ذوّب الزبدة على نار هادئة وأضف الثوم دقيقة واحدة حتى يذهّب (لا تحرقه).',
      'أضف المرق واتركه يغلي دقيقتين، ثم المعكرونة والبروكلي والدجاج ونصف البارميزان. قلّب حتى يلتصق الصوص.',
      'أضف الليمون والبقدونس، قسّم ورش باقي البارميزان.'
    ],
    stepsEn: [
      'Boil the pasta, adding the broccoli for the last 3 min; drain.',
      'Heat the oil and brown the sliced chicken with salt and pepper 6–7 min; lift out.',
      'In the same pan melt the butter over low heat and cook the garlic 1 min until golden (do not burn).',
      'Add the broth and bubble 2 min, then the pasta, broccoli, chicken and half the parmesan. Toss until glossy.',
      'Add lemon and parsley, divide and finish with the rest of the parmesan.'
    ]
  }),
  R({
    id: 'lib4-spicy-arrabbiata-chicken-pasta', nameAr: 'مكرونة أرابياتا حارة بالدجاج', nameEn: 'Spicy arrabbiata chicken pasta', emoji: '🌶️',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'pasta'], prepMin: 10, cookMin: 20, difficulty: 'easy', servings: 2, methods: ['pot', 'pan'], ...FRIDGE3,
    ingredients: ing(['معكرونة قمح كامل نيئة/جافة', 140], ['صدر دجاج', 300], ['طماطم مهروسة معلبة', 400], ['معجون طماطم', 15], ['بصل', 80], ['زيت زيتون', 10], ['جبن بارميزان مبشور', 15]),
    seasonings: ing(['ثوم', 12], ['شطة مطحونة (فلفل أحمر حار)', 1.5, 'حسب الرغبة', 'to taste'], ['فلفل حار أخضر', 10, 'اختياري', 'optional'], ['ملح', 4], ['أوريجانو مجفف', 1.5], ['ريحان طازج', 6]),
    stepsAr: [
      'اسلق المعكرونة حسب العبوة.',
      'سخّن الزيت، حمّر الدجاج المكعب مع نصف الملح 6 دقائق وارفعه.',
      'في نفس المقلاة قلّب البصل 3 دقائق، أضف الثوم والشطة والفلفل الحار دقيقة.',
      'أضف معجون الطماطم دقيقة ثم الطماطم المهروسة والأوريجانو وباقي الملح. اتركها تغلي بهدوء 8 دقائق.',
      'أعد الدجاج، أضف المعكرونة وقلّب. قدّم مع الريحان والبارميزان.'
    ],
    stepsEn: [
      'Boil the pasta as the packet says.',
      'Heat the oil, brown the cubed chicken with half the salt 6 min and lift out.',
      'In the same pan soften the onion 3 min; add the garlic, chilli flakes and green chilli for 1 min.',
      'Stir in the tomato paste 1 min, then the crushed tomatoes, oregano and the rest of the salt; simmer 8 min.',
      'Return the chicken, add the pasta and toss. Serve with basil and parmesan.'
    ]
  }),
  R({
    id: 'lib4-light-bechamel-pasta-bake', nameAr: 'مكرونة بالبشاميل الخفيفة باللحم (عالية البروتين)', nameEn: 'High-protein light béchamel pasta bake with beef', emoji: '🥧',
    meals: ['lunch', 'dinner'], tags: ['meat', 'pasta', 'meal-prep'], prepMin: 20, cookMin: 40, difficulty: 'medium', servings: 4, methods: ['oven', 'pan', 'pot'], ...FRIDGE3,
    ingredients: ing(['معكرونة نيئة/جافة', 240, 'قلم (بيني)', 'penne'], ['لحم بقري قليل الدهن 90/10', 500], ['بصل', 120], ['طماطم مهروسة معلبة', 200], ['حليب قليل الدسم', 500], ['نشا ذرة', 30], ['جبن موزاريلا قليلة الدسم', 100], ['جبن بارميزان مبشور', 20], ['بيض كامل', 50, 'بيضة واحدة للبشاميل', '1 egg for the sauce'], ['زيت زيتون', 7]),
    seasonings: ing(['ثوم', 9], ['ملح', 7], ['فلفل أسود مطحون', 2], ['بهار حلو مطحون', 1.5], ['قرفة مطحونة', 0.5], ['جوزة الطيب مطحونة', 0.5]),
    tempC: 190,
    stepsAr: [
      'اسلق المعكرونة 2 دقيقة أقل من العبوة وصفّها. سخّن الفرن 190°م.',
      'الحشوة: سخّن الزيت وقلّب البصل 4 دقائق، أضف اللحم المفروم وفتّته 7 دقائق حتى يتحمّر، ثم الثوم والبهار الحلو والقرفة ونصف الملح والطماطم 5 دقائق.',
      'البشاميل الخفيف: اخلط النشا في 150 مل حليب بارد، ثم سخّنه مع باقي الحليب على نار متوسطة مع التحريك المستمر 4–5 دقائق حتى يتكاثف. ارفعه وأضف جوزة الطيب وباقي الملح والفلفل، وبعد دقيقتين اخفق البيضة فيه.',
      'اخلط ربع البشاميل مع المعكرونة. في صينية 20×30 سم: نصف المعكرونة، اللحم، باقي المعكرونة، ثم باقي البشاميل.',
      'وزّع الموزاريلا والبارميزان واخبز 25 دقيقة حتى يتحمّر الوجه. اتركها 10 دقائق لتتماسك ثم قطّعها 4 حصص متساوية.'
    ],
    stepsEn: [
      'Boil the pasta 2 min less than the packet and drain. Heat the oven to 190°C.',
      'Filling: heat the oil and soften the onion 4 min, add the beef and break it up 7 min until browned, then the garlic, allspice, cinnamon, half the salt and the tomatoes for 5 min.',
      'Light béchamel: whisk the cornstarch into 150 ml cold milk, heat with the rest of the milk over medium, stirring constantly 4–5 min until thick. Off the heat add nutmeg, the rest of the salt and pepper; after 2 min whisk in the egg.',
      'Mix a quarter of the sauce into the pasta. In a 20×30 cm dish: half the pasta, the beef, the rest of the pasta, then the remaining sauce.',
      'Top with mozzarella and parmesan and bake 25 min until golden. Rest 10 min to set, then cut into 4 equal portions.'
    ],
    tipsAr: ['مستوحاة من المكرونة بالبشاميل المصرية — البشاميل هنا بالحليب قليل الدسم والنشا بدل الزبدة والدقيق.'], tipsEn: ['Inspired by Egyptian makarona béchamel — the sauce uses low-fat milk and cornstarch instead of butter and flour.']
  }),
  // ------------------------------------------------------------ rice
  R({
    id: 'lib4-egyptian-chicken-rice', nameAr: 'فراخ بالأرز المصري بالشعرية', nameEn: 'Egyptian-style chicken with vermicelli rice', emoji: '🍗',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'rice', 'meal-prep'], prepMin: 15, cookMin: 35, difficulty: 'medium', servings: 4, methods: ['pot', 'oven'], ...FRIDGE3,
    ingredients: ing(['صدر دجاج', 700], ['أرز أبيض', 280, 'مصري قصير الحبة، نيء', 'Egyptian short-grain, raw'], ['معكرونة نيئة/جافة', 40, 'شعرية مكسّرة', 'broken vermicelli'], ['زبدة', 10], ['زيت زيتون', 10], ['بصل', 100], ['مرق دجاج قليل الصوديوم', 500]),
    seasonings: ing(['ملح', 7], ['فلفل أسود مطحون', 2], ['هيل مطحون', 1], ['بهار حلو مطحون', 1.5], ['كمون مطحون', 1.5], ['بابريكا', 3], ['ثوم', 6]),
    tempC: 220,
    stepsAr: [
      'اغسل الأرز وانقعه 15 دقيقة ثم صفّه. تبّل الدجاج بالزيت والثوم والبابريكا والكمون والبهار الحلو ونصف الملح.',
      'اخبز الدجاج في الفرن 220°م 20 دقيقة حتى 74°م (أو اسلقه في المرق 15 دقيقة ثم حمّره).',
      'في قدر ذوّب الزبدة وحمّر الشعرية 2–3 دقائق حتى تذهّب، أضف البصل المبشور دقيقتين ثم الأرز وقلّب دقيقة.',
      'أضف المرق الساخن والهيل والفلفل وباقي الملح. عند الغليان اخفض النار لأدنى درجة وغطِّ 18 دقيقة.',
      'اترك الأرز مغطى 5 دقائق، قلّبه بالشوكة، ثم قسّم الأرز والدجاج إلى 4 أطباق متساوية.'
    ],
    stepsEn: [
      'Rinse and soak the rice 15 min, then drain. Season the chicken with the oil, garlic, paprika, cumin, allspice and half the salt.',
      'Roast the chicken at 220°C for 20 min to 74°C (or simmer it in the broth 15 min, then brown it).',
      'In a pot melt the butter and toast the vermicelli 2–3 min until golden; add the grated onion 2 min, then the rice for 1 min.',
      'Add the hot broth, cardamom, pepper and the rest of the salt. When boiling, turn the heat to the lowest and cover 18 min.',
      'Leave covered 5 min, fluff with a fork, then divide rice and chicken into 4 equal plates.'
    ]
  }),
  R({
    id: 'lib4-chicken-biryani-light', nameAr: 'برياني الدجاج الصحي', nameEn: 'Healthy chicken biryani-style rice', emoji: '🍛',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'rice', 'meal-prep'], prepMin: 20, cookMin: 35, difficulty: 'medium', servings: 4, methods: ['pot'], ...FRIDGE3,
    ingredients: ing(['صدر دجاج', 700], ['أرز بسمتي نيء/جاف', 280], ['زبادي يوناني قليل الدسم', 150, 'للتتبيلة', 'for the marinade'], ['بصل', 200, 'شرائح رفيعة', 'thinly sliced'], ['طماطم', 150], ['زيت زيتون', 15], ['بازلاء مجمدة', 100]),
    seasonings: ing(['ثوم', 12], ['زنجبيل طازج', 10], ['كاري بودرة', 6], ['كركم مطحون', 2], ['كمون مطحون', 2], ['هيل مطحون', 1], ['قرنفل مطحون', 0.3], ['قرفة مطحونة', 0.5], ['ملح', 7], ['كزبرة خضراء طازجة', 10], ['نعناع طازج', 6]),
    marinade: ['زبادي يوناني قليل الدسم', 'ثوم', 'زنجبيل طازج', 'كاري بودرة', 'كركم مطحون', 'كمون مطحون'],
    marinateMin: 30,
    stepsAr: [
      'تبّل الدجاج المكعب بالزبادي والثوم والزنجبيل والكاري والكركم والكمون ونصف الملح، وضعه في الثلاجة 30 دقيقة على الأقل.',
      'انقع الأرز 20 دقيقة، ثم اسلقه في ماء مغلي مملح مع الهيل والقرنفل والقرفة 5 دقائق فقط (70% نضج) وصفّه.',
      'في قدر ثقيل سخّن الزيت وحمّر البصل 10 دقائق حتى يذهّب، ارفع نصفه للتزيين.',
      'أضف الدجاج بتتبيلته والطماطم إلى القدر 10 دقائق حتى ينضج ويتكثف الصوص، ثم البازلاء وباقي الملح.',
      'غطِّ الدجاج بالأرز، رش البصل المحمّر والكزبرة والنعناع، وغطِّ بإحكام على أدنى نار 15 دقيقة.',
      'قلّب برفق من الأسفل للأعلى وقسّم إلى 4 أطباق متساوية.'
    ],
    stepsEn: [
      'Marinate the cubed chicken in the yogurt, garlic, ginger, curry, turmeric, cumin and half the salt, at least 30 min in the fridge.',
      'Soak the rice 20 min, then boil in salted water with the cardamom, cloves and cinnamon for just 5 min (70 % cooked); drain.',
      'In a heavy pot heat the oil and fry the onion 10 min until golden; lift out half for the topping.',
      'Add the chicken with its marinade and the tomatoes for 10 min until cooked and the sauce thickens; add the peas and the rest of the salt.',
      'Cover the chicken with the rice, scatter the fried onion, coriander and mint, seal and cook on the lowest heat 15 min.',
      'Fold gently from the bottom up and divide into 4 equal plates.'
    ]
  }),
  R({
    id: 'lib4-honey-soy-chicken-bowl', nameAr: 'بول أرز بالدجاج بصوص العسل والصويا', nameEn: 'Honey-soy chicken rice bowl', emoji: '🍯',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'rice', 'quick'], prepMin: 10, cookMin: 20, difficulty: 'easy', servings: 2, methods: ['pan', 'pot'], ...FRIDGE3,
    ingredients: ing(['صدر دجاج', 320], ['أرز بسمتي نيء/جاف', 120], ['بروكلي', 150], ['جزر', 80], ['صويا صوص قليل الصوديوم', 25], ['عسل', 15, 'ملعقة كبيرة', '1 tbsp'], ['نشا ذرة', 5], ['زيت زيتون', 8]),
    seasonings: ing(['ثوم', 6], ['زنجبيل طازج', 6], ['سمسم', 4, 'للتزيين', 'to finish'], ['بصل أخضر', 10], ['عصير ليم (لايم)', 10]),
    stepsAr: [
      'اطبخ الأرز: 120 غ أرز مع 220 مل ماء، يغلي ثم نار هادئة مغطى 12 دقيقة.',
      'الصوص: اخلط الصويا والعسل وعصير الليم والنشا مع 60 مل ماء.',
      'سخّن الزيت وحمّر الدجاج المكعب 6 دقائق، أضف الثوم والزنجبيل 30 ثانية.',
      'أضف البروكلي والجزر الشرائح و2 ملعقة ماء، غطِّ 3 دقائق.',
      'صب الصوص وقلّب دقيقة حتى يلمع ويتكاثف. قسّم الأرز ثم الدجاج والخضار، ورش السمسم والبصل الأخضر.'
    ],
    stepsEn: [
      'Cook the rice: 120 g rice with 220 ml water, bring to the boil, then cover on low 12 min.',
      'Sauce: whisk the soy sauce, honey, lime juice and cornstarch with 60 ml water.',
      'Heat the oil and brown the cubed chicken 6 min; add garlic and ginger for 30 s.',
      'Add the broccoli, sliced carrot and 2 tbsp water; cover 3 min.',
      'Pour in the sauce and stir 1 min until glossy. Divide the rice, top with chicken and vegetables, sesame and spring onion.'
    ]
  }),
  // ------------------------------------------------------------ eggs & breakfast
  R({
    id: 'lib4-eggs-potato-mozzarella', nameAr: 'بيض بالبطاطس والموزاريلا (طاسة)', nameEn: 'Eggs with potatoes & mozzarella (skillet)', emoji: '🥔',
    meals: ['breakfast', 'dinner'], tags: ['eggs', 'potato', 'breakfast-idea', 'vegetarian'], prepMin: 5, cookMin: 20, difficulty: 'easy', servings: 1, methods: ['pan'], ...FRESH,
    ingredients: ing(['بيض كامل', 150, '3 بيضات', '3 eggs'], ['بياض بيض', 66, 'بياض بيضتين', '2 egg whites'], ['بطاطس', 180, 'مكعبات صغيرة', 'small cubes'], ['جبن موزاريلا قليلة الدسم', 30], ['زيت زيتون', 7], ['بصل', 40]),
    seasonings: ing(['ملح', 2.5], ['فلفل أسود مطحون', 1], ['كمون مطحون', 1], ['بابريكا', 1], ['بقدونس طازج', 5]),
    stepsAr: [
      'سخّن الزيت في مقلاة 24 سم، أضف البطاطس ورشة ملح، غطِّ واطهها 10–12 دقيقة على نار متوسطة مع التقليب حتى تطرى وتتحمّر.',
      'أضف البصل دقيقتين.',
      'اخفق البيض والبياض مع باقي الملح والفلفل والكمون، وصبه فوق البطاطس.',
      'وزّع الموزاريلا، غطِّ على نار هادئة 3–4 دقائق حتى يتماسك البيض وتذوب الجبنة.',
      'رش البابريكا والبقدونس وقدّم.'
    ],
    stepsEn: [
      'Heat the oil in a 24 cm pan, add the potatoes and a pinch of salt, cover and cook 10–12 min on medium, stirring, until tender and golden.',
      'Add the onion for 2 min.',
      'Beat the eggs and whites with the rest of the salt, pepper and cumin; pour over the potatoes.',
      'Scatter the mozzarella, cover on low heat 3–4 min until the eggs set and the cheese melts.',
      'Finish with paprika and parsley.'
    ]
  }),
  R({
    id: 'lib4-protein-breakfast-wrap', nameAr: 'راب الإفطار عالي البروتين', nameEn: 'High-protein breakfast wrap', emoji: '🌯',
    meals: ['breakfast'], tags: ['eggs', 'sandwich', 'quick', 'breakfast-idea'], prepMin: 5, cookMin: 7, difficulty: 'easy', servings: 1, methods: ['pan'], ...FRESH,
    ingredients: ing(['تورتيلا قمح', 70, 'رغيف كبير', '1 large wrap'], ['بيض كامل', 100, 'بيضتان', '2 eggs'], ['بياض بيض', 99, 'بياض 3 بيضات', '3 egg whites'], ['جبن موزاريلا قليلة الدسم', 30], ['فلفل رومي (حلو)', 50], ['سبانخ', 30], ['زيت زيتون', 4]),
    seasonings: ing(['ملح', 0.5, 'رشة — الجبن والتورتيلا مالحة', 'a pinch — the cheese and wrap are already salty'], ['فلفل أسود مطحون', 0.5], ['بابريكا', 1], ['صلصة حارة (سريراتشا)', 5, 'اختياري', 'optional']),
    stepsAr: [
      'سخّن الزيت وقلّب الفلفل المقطع دقيقتين ثم السبانخ 30 ثانية.',
      'اخفق البيض والبياض مع الملح والفلفل والبابريكا، صبه وحرّك برفق دقيقتين حتى يتماسك طرياً.',
      'سخّن التورتيلا 20 ثانية في مقلاة جافة.',
      'ضع البيض والموزاريلا والسريراتشا في المنتصف، لف الأطراف ثم اللفافة.',
      'حمّر الراب على جانب الوصلة دقيقة حتى يُغلق وتذوب الجبنة.'
    ],
    stepsEn: [
      'Heat the oil and cook the chopped pepper 2 min, then the spinach 30 s.',
      'Beat the eggs and whites with salt, pepper and paprika, pour in and stir gently 2 min until softly set.',
      'Warm the tortilla 20 s in a dry pan.',
      'Fill the centre with the eggs, mozzarella and sriracha, fold in the sides and roll.',
      'Toast seam-side down 1 min to seal and melt the cheese.'
    ]
  }),
  R({
    id: 'lib4-baked-eggs-cheese-tomato', nameAr: 'بيض مخبوز بالجبن في صلصة الطماطم', nameEn: 'Baked eggs with cheese in tomato sauce', emoji: '🍅',
    meals: ['breakfast', 'dinner'], tags: ['eggs', 'vegetarian', 'breakfast-idea'], prepMin: 5, cookMin: 18, difficulty: 'easy', servings: 2, methods: ['oven', 'pan'], ...FRESH,
    ingredients: ing(['بيض كامل', 250, '5 بيضات', '5 eggs'], ['طماطم مهروسة معلبة', 300], ['فلفل رومي (حلو)', 100], ['بصل', 60], ['جبن موزاريلا قليلة الدسم', 50], ['جبن قريش قليل الدسم', 100], ['زيت زيتون', 7], ['خبز عربي أسمر', 60, 'للتقديم', 'to serve']),
    seasonings: ing(['ثوم', 6], ['ملح', 1, 'الطماطم المعلبة والجبن مالحة', 'canned tomatoes and cheese are already salty'], ['كمون مطحون', 1], ['بابريكا', 2], ['شطة مطحونة (فلفل أحمر حار)', 0.3], ['ريحان طازج', 5]),
    tempC: 200,
    stepsAr: [
      'سخّن الفرن 200°م. في مقلاة تصلح للفرن قلّب البصل والفلفل بالزيت 4 دقائق، ثم الثوم والبهارات.',
      'أضف الطماطم والملح واتركها تغلي 5 دقائق.',
      'اصنع 5 حفر واكسر بيضة في كل حفرة، ووزّع الجبن القريش بين البيض والموزاريلا فوق الصلصة.',
      'اخبز 8–10 دقائق حتى يتماسك البياض ويبقى الصفار حسب الرغبة.',
      'رش الريحان وقسّم إلى حصتين مع الخبز.'
    ],
    stepsEn: [
      'Heat the oven to 200°C. In an ovenproof pan soften the onion and pepper in the oil 4 min, then the garlic and spices.',
      'Add the tomatoes and salt; simmer 5 min.',
      'Make 5 wells and crack an egg into each; dot the cottage cheese between the eggs and the mozzarella over the sauce.',
      'Bake 8–10 min until the whites set and the yolks are as you like.',
      'Scatter basil and divide into two portions with the bread.'
    ]
  }),
  R({
    id: 'lib4-egg-potato-breakfast-bowl', nameAr: 'بول البيض والبطاطس للإفطار مع صوص الزبادي', nameEn: 'Egg & potato breakfast bowl with yogurt sauce', emoji: '🥚',
    meals: ['breakfast'], tags: ['eggs', 'potato', 'breakfast-idea', 'vegetarian'], prepMin: 5, cookMin: 18, difficulty: 'easy', servings: 1, methods: ['air-fryer', 'pot'], ...FRESH,
    ingredients: ing(['بطاطس', 200, 'مكعبات 2 سم', '2 cm cubes'], ['بيض كامل', 150, '3 بيضات مسلوقة', '3 eggs, boiled'], ['زبادي يوناني خالي الدسم', 100], ['خيار', 60], ['طماطم', 60], ['زيت زيتون', 5]),
    seasonings: ing(['ملح', 2.5], ['بابريكا', 2], ['بودرة ثوم', 1], ['نعناع مجفف', 0.5], ['عصير ليمون', 5], ['فلفل أسود مطحون', 0.5]),
    tempC: 200,
    stepsAr: [
      'قلّب البطاطس بالزيت ونصف الملح والبابريكا وبودرة الثوم، واطهها في القلاية 200°م 15–18 دقيقة مع الهز.',
      'اسلق البيض 8 دقائق (صفار متماسك طري)، ثم ضعه في ماء بارد وقشّره.',
      'اخلط الزبادي مع النعناع والليمون وباقي الملح.',
      'رتّب البطاطس والخضار المقطعة والبيض المقطوع نصفين في وعاء، وأضف صوص الزبادي والفلفل.'
    ],
    stepsEn: [
      'Toss the potatoes with the oil, half the salt, paprika and garlic powder; air-fry at 200°C for 15–18 min, shaking.',
      'Boil the eggs 8 min (jammy-firm yolk), cool in cold water and peel.',
      'Mix the yogurt with mint, lemon and the rest of the salt.',
      'Arrange potatoes, chopped vegetables and halved eggs in a bowl; add the yogurt sauce and pepper.'
    ]
  }),
  // ------------------------------------------------------------ sandwiches, pizza, burgers
  R({
    id: 'lib4-grilled-chicken-mozzarella-sandwich', nameAr: 'ساندويتش دجاج مشوي بالموزاريلا والطماطم', nameEn: 'Grilled chicken, mozzarella & tomato sandwich', emoji: '🥪',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'sandwich', 'quick'], prepMin: 5, cookMin: 12, difficulty: 'easy', servings: 1, methods: ['pan', 'grill'], ...FRESH,
    ingredients: ing(['توست بر (خبز أسمر)', 80, 'شريحتان كبيرتان', '2 large slices'], ['صدر دجاج', 150], ['جبن موزاريلا قليلة الدسم', 30], ['طماطم', 60], ['خس', 20], ['زيت زيتون', 5], ['زبادي يوناني خالي الدسم', 30, 'للدهن', 'as spread']),
    seasonings: ing(['ملح', 1.5], ['فلفل أسود مطحون', 0.5], ['أوريجانو مجفف', 0.5], ['بودرة ثوم', 1], ['خردل', 5]),
    stepsAr: [
      'اطرق الصدر حتى سماكة 1.5 سم وتبّله بالزيت والملح والفلفل والأوريجانو وبودرة الثوم.',
      'اشوه في مقلاة شوي ساخنة 4–5 دقائق لكل جانب حتى 74°م، واتركه دقيقتين ثم قطّعه شرائح.',
      'اخلط الزبادي مع الخردل وادهن الخبز.',
      'رتّب الخس والدجاج والطماطم والموزاريلا، أغلق الساندويتش واضغطه في المقلاة دقيقتين لكل جانب حتى تذوب الجبنة.'
    ],
    stepsEn: [
      'Pound the breast to 1.5 cm and season with the oil, salt, pepper, oregano and garlic powder.',
      'Cook in a hot grill pan 4–5 min per side to 74°C; rest 2 min and slice.',
      'Mix the yogurt with mustard and spread on the bread.',
      'Layer lettuce, chicken, tomato and mozzarella; close and press in the pan 2 min per side until the cheese melts.'
    ]
  }),
  R({
    id: 'lib4-healthy-chicken-pizza', nameAr: 'بيتزا صحية بالدجاج على خبز عربي أسمر', nameEn: 'Healthy chicken pizza on wholemeal flatbread', emoji: '🍕',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'quick'], prepMin: 10, cookMin: 10, difficulty: 'easy', servings: 1, methods: ['oven', 'air-fryer'], ...FRESH,
    ingredients: ing(['خبز عربي أسمر', 80, 'رغيف كبير', '1 large flatbread'], ['صدر دجاج', 120, 'مطبوخ مسبقاً بوزنه النيء', 'pre-cooked, raw weight'], ['طماطم مهروسة معلبة', 60], ['معجون طماطم', 10], ['جبن موزاريلا قليلة الدسم', 50], ['فلفل رومي (حلو)', 50], ['فطر (مشروم) أبيض', 50], ['بصل', 20], ['زيت زيتون', 4]),
    seasonings: ing(['أوريجانو مجفف', 1], ['ريحان مجفف', 0.5], ['بودرة ثوم', 1], ['ملح', 1.5], ['شطة مطحونة (فلفل أحمر حار)', 0.3]),
    tempC: 220,
    stepsAr: [
      'اطبخ الدجاج المكعب مسبقاً في مقلاة مع نصف الزيت والملح 6 دقائق (أو استخدم دجاجاً مشوياً متبقياً بنفس الوزن).',
      'الصلصة: اخلط الطماطم المهروسة والمعجون والأوريجانو والريحان وبودرة الثوم.',
      'افرد الصلصة على الخبز، ثم نصف الموزاريلا والدجاج والخضار، ثم باقي الجبنة وباقي الزيت.',
      'اخبز 220°م 8–10 دقائق (أو القلاية الهوائية 190°م 6–7 دقائق) حتى تتحمّر الأطراف.',
      'رش الشطة واتركها دقيقة قبل التقطيع.'
    ],
    stepsEn: [
      'Pre-cook the cubed chicken in a pan with half the oil and the salt for 6 min (or use leftover grilled chicken of the same weight).',
      'Sauce: mix the crushed tomatoes, paste, oregano, basil and garlic powder.',
      'Spread the sauce on the flatbread, add half the mozzarella, the chicken and vegetables, then the rest of the cheese and oil.',
      'Bake at 220°C 8–10 min (air fryer 190°C 6–7 min) until the edges are crisp.',
      'Add chilli flakes and rest 1 min before cutting.'
    ]
  }),
  // ------------------------------------------------------------ meat & fish
  R({
    id: 'lib4-tuna-potato-bowl', nameAr: 'بول التونة والبطاطس بالليمون والأعشاب', nameEn: 'Tuna & potato bowl with lemon herb dressing', emoji: '🐟',
    meals: ['lunch', 'dinner'], tags: ['fish', 'potato', 'quick'], prepMin: 10, cookMin: 15, difficulty: 'easy', servings: 1, methods: ['pot', 'no-cook'], storageAr: 'بالثلاجة حتى يومين؛ يُؤكل بارداً أو بدرجة حرارة الغرفة.', storageEn: 'Fridge up to 2 days; eat cold or at room temperature.',
    ingredients: ing(['سمك تونة (معلب بالماء)', 150, 'علبة مصفاة', '1 can, drained'], ['بطاطس', 250], ['بيض كامل', 50, 'بيضة مسلوقة', '1 boiled egg'], ['خيار', 80], ['طماطم', 80], ['ذرة حلوة مسلوقة', 40], ['زيت زيتون', 8]),
    seasonings: ing(['عصير ليمون', 15], ['خردل', 5], ['بقدونس طازج', 6], ['شبت طازج', 4], ['ملح', 2], ['فلفل أسود مطحون', 0.5]),
    stepsAr: [
      'اسلق البطاطس مكعبات في ماء مملح 10–12 دقيقة حتى تطرى، ثم صفّها واتركها تبرد قليلاً. اسلق البيضة 9 دقائق.',
      'الصوص: اخفق الزيت والليمون والخردل والملح والفلفل والأعشاب المفرومة.',
      'قلّب البطاطس الدافئة مع نصف الصوص لتتشربه.',
      'رتّب البطاطس والتونة والخيار والطماطم والذرة والبيضة، وصب باقي الصوص.'
    ],
    stepsEn: [
      'Boil the cubed potatoes in salted water 10–12 min until tender; drain and cool slightly. Boil the egg 9 min.',
      'Dressing: whisk the oil, lemon, mustard, salt, pepper and chopped herbs.',
      'Toss the warm potatoes with half the dressing so they absorb it.',
      'Arrange potatoes, tuna, cucumber, tomato, corn and the egg; pour over the rest of the dressing.'
    ]
  }),
  R({
    id: 'lib4-beef-potato-tray', nameAr: 'صينية بطاطس باللحم المفروم والطماطم', nameEn: 'Lean beef & potato tray bake with tomato', emoji: '🥩',
    meals: ['lunch', 'dinner'], tags: ['meat', 'potato', 'meal-prep'], prepMin: 15, cookMin: 45, difficulty: 'easy', servings: 4, methods: ['oven', 'pan'], ...FRIDGE3,
    ingredients: ing(['لحم بقري قليل الدهن 90/10', 600], ['بطاطس', 800, 'شرائح 7 مم', '7 mm slices'], ['بصل', 150], ['فلفل رومي (حلو)', 150], ['طماطم مهروسة معلبة', 400], ['معجون طماطم', 20], ['زيت زيتون', 14]),
    seasonings: ing(['ثوم', 12], ['ملح', 8], ['فلفل أسود مطحون', 2], ['بهار حلو مطحون', 2], ['كمون مطحون', 2], ['بابريكا', 3], ['بقدونس طازج', 15]),
    tempC: 200,
    stepsAr: [
      'سخّن الفرن 200°م. قلّب شرائح البطاطس بـ 7 غ زيت ونصف الملح والبابريكا، وافردها في صينية 25×35 سم. اخبزها 15 دقيقة.',
      'في مقلاة سخّن باقي الزيت وقلّب البصل 4 دقائق، أضف اللحم وفتّته 8 دقائق، ثم الثوم والبهار الحلو والكمون والفلفل والفلفل الرومي.',
      'أضف المعجون والطماطم وباقي الملح و100 مل ماء، واتركها تغلي 5 دقائق.',
      'صب خليط اللحم فوق البطاطس، غطِّ بورق القصدير واخبز 20 دقيقة، ثم اكشفها 10 دقائق.',
      'رش البقدونس وقسّم إلى 4 حصص متساوية.'
    ],
    stepsEn: [
      'Heat the oven to 200°C. Toss the potato slices with 7 g oil, half the salt and the paprika; spread in a 25×35 cm tray and bake 15 min.',
      'In a pan heat the rest of the oil, soften the onion 4 min, add the beef and break it up 8 min, then the garlic, allspice, cumin, pepper and bell pepper.',
      'Add the paste, tomatoes, the rest of the salt and 100 ml water; simmer 5 min.',
      'Pour the beef over the potatoes, cover with foil and bake 20 min, then uncover for 10 min.',
      'Finish with parsley and cut into 4 equal portions.'
    ]
  }),
  R({
    id: 'lib4-egyptian-baked-fish-rice', nameAr: 'سمك بالفرن على الطريقة الصيادية مع أرز بالبصل', nameEn: 'Sayadeya-style baked fish with onion rice', emoji: '🐠',
    meals: ['lunch', 'dinner'], tags: ['fish', 'rice'], prepMin: 15, cookMin: 35, difficulty: 'medium', servings: 2, methods: ['oven', 'pot'], ...FRIDGE2,
    ingredients: ing(['سمك بلطي/تلابيا', 400, 'فيليه نيء', 'raw fillets'], ['أرز بسمتي نيء/جاف', 120], ['بصل', 200, 'شرائح', 'sliced'], ['زيت زيتون', 15], ['طماطم', 150], ['مرق دجاج قليل الصوديوم', 250]),
    seasonings: ing(['ثوم', 9], ['كمون مطحون', 3], ['كركم مطحون', 1], ['ملح', 5], ['فلفل أسود مطحون', 1], ['عصير ليمون', 20], ['بقدونس طازج', 8]),
    tempC: 200,
    stepsAr: [
      'تبّل السمك بالليمون والثوم ونصف الكمون ونصف الملح.',
      'في قدر سخّن 10 غ زيت وحمّر البصل 12 دقيقة حتى يصبح بنياً ذهبياً، ارفع ثلثه.',
      'أضف الأرز والكركم وباقي الكمون والملح والفلفل، ثم المرق الساخن. عند الغليان غطِّ على نار هادئة 15 دقيقة.',
      'في الأثناء ضع السمك في طبق فرن فوق شرائح الطماطم، ادهنه بباقي الزيت واخبزه 200°م 12–15 دقيقة حتى يتفتت بسهولة.',
      'قدّم الأرز مع البصل المحمّر المتبقي والسمك والبقدونس.'
    ],
    stepsEn: [
      'Season the fish with lemon, garlic, half the cumin and half the salt.',
      'In a pot heat 10 g oil and fry the onion 12 min until deep golden; lift out a third.',
      'Add the rice, turmeric, the rest of the cumin, salt and pepper, then the hot broth. When boiling, cover on low 15 min.',
      'Meanwhile put the fish on tomato slices in an oven dish, brush with the rest of the oil and bake at 200°C 12–15 min until it flakes easily.',
      'Serve the rice topped with the reserved onion, the fish and parsley.'
    ],
    tipsAr: ['مستوحاة من الصيادية المصرية — البصل المحمّر هو سر النكهة واللون.'], tipsEn: ['Inspired by Egyptian sayadeya — the deeply browned onion gives the colour and flavour.']
  }),
  // ------------------------------------------------------------ snacks & desserts
  R({
    id: 'lib4-yogurt-banana-honey', nameAr: 'زبادي يوناني بالموز والعسل والقرفة', nameEn: 'Greek yogurt with banana, honey & cinnamon', emoji: '🍌',
    meals: ['breakfast', 'snacks'], tags: ['quick', 'vegetarian', 'breakfast-idea'], prepMin: 3, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'], storageAr: 'يُحضّر طازجاً؛ الموز يتغير لونه بعد ساعات.', storageEn: 'Make fresh; the banana browns after a few hours.',
    ingredients: ing(['زبادي يوناني خالي الدسم', 170, 'علبة واحدة', '1 container'], ['موز', 100, 'موزة متوسطة', '1 medium banana'], ['عسل', 10, 'ملعقتان صغيرتان', '2 tsp'], ['لوز', 10, '8 حبات مقطعة', '8 almonds, chopped']),
    seasonings: ing(['قرفة مطحونة', 0.5]),
    stepsAr: ['ضع الزبادي في وعاء.', 'رتّب شرائح الموز فوقه، رش العسل والقرفة واللوز المقطع.'],
    stepsEn: ['Spoon the yogurt into a bowl.', 'Top with sliced banana, drizzle the honey and add cinnamon and chopped almonds.']
  }),
  R({
    id: 'lib4-chocolate-yogurt-mousse', nameAr: 'موس الشوكولاتة بالزبادي اليوناني (بدون واي)', nameEn: 'Chocolate Greek yogurt mousse (no whey)', emoji: '🍫',
    meals: ['snacks'], tags: ['quick', 'vegetarian', 'dessert'], prepMin: 5, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'], storageAr: 'يُحفظ بالثلاجة حتى يومين مغطى؛ يصبح أكثف مع الوقت.', storageEn: 'Covered in the fridge up to 2 days; it thickens over time.',
    ingredients: ing(['زبادي يوناني خالي الدسم', 170, 'علبة واحدة', '1 container'], ['كاكاو خام بودرة', 10, '2 ملعقة كبيرة', '2 tbsp'], ['عسل', 12], ['فراولة', 80, 'للتقديم', 'to serve']),
    seasonings: ing(['فانيليا سائلة', 2], ['ملح', 0.2, 'رشة صغيرة تُبرز الشوكولاتة', 'a tiny pinch lifts the chocolate']),
    stepsAr: ['اخفق الكاكاو مع العسل والفانيليا والملح وملعقة من الزبادي حتى يصبح عجينة ناعمة.', 'أضف باقي الزبادي واخفق دقيقة حتى يصبح مثل الموس.', 'برّده 15 دقيقة إن أمكن وقدّمه مع الفراولة.'],
    stepsEn: ['Whisk the cocoa with the honey, vanilla, salt and a spoon of yogurt into a smooth paste.', 'Add the rest of the yogurt and whisk 1 min until mousse-like.', 'Chill 15 min if you can and serve with strawberries.']
  }),
  R({
    id: 'lib4-cottage-chocolate-pudding', nameAr: 'بودينغ الشوكولاتة بالجبن القريش (عالي البروتين)', nameEn: 'High-protein chocolate cottage-cheese pudding', emoji: '🍮',
    meals: ['snacks'], tags: ['vegetarian', 'dessert'], prepMin: 5, cookMin: 0, difficulty: 'easy', servings: 2, methods: ['blender', 'no-cook'], storageAr: 'بالثلاجة حتى 3 أيام في أكواب مغطاة.', storageEn: 'Fridge up to 3 days in covered cups.',
    ingredients: ing(['جبن قريش قليل الدسم', 300], ['كاكاو خام بودرة', 18], ['عسل', 20], ['حليب قليل الدسم', 60], ['موز', 60, 'نصف موزة للتحلية والقوام', '½ banana for sweetness and body']),
    seasonings: ing(['فانيليا سائلة', 3], ['قرفة مطحونة', 0.5]),
    stepsAr: ['اخلط كل المكونات في الخلاط 1–2 دقيقة حتى يصبح ناعماً تماماً بدون حبيبات.', 'وزّعه في كوبين متساويين وبرّده 30 دقيقة على الأقل.'],
    stepsEn: ['Blend everything 1–2 min until completely smooth.', 'Divide between two cups and chill at least 30 min.'],
    tipsAr: ['الجبن القريش يعطي بروتيناً عالياً بدون واي.'], tipsEn: ['Cottage cheese gives the protein without whey.']
  }),
  R({
    id: 'lib4-baked-sweet-potato-dessert', nameAr: 'بطاطا حلوة مشوية بالزبادي والعسل والجوز', nameEn: 'Baked sweet potato with yogurt, honey & walnuts', emoji: '🍠',
    meals: ['snacks'], tags: ['vegetarian', 'high-fiber', 'dessert'], prepMin: 5, cookMin: 40, difficulty: 'easy', servings: 2, methods: ['oven', 'air-fryer'], storageAr: 'البطاطا المشوية تُحفظ بالثلاجة 4 أيام؛ أضف الزبادي والعسل عند التقديم.', storageEn: 'Baked sweet potatoes keep 4 days in the fridge; add the yogurt and honey when serving.',
    ingredients: ing(['بطاطا حلوة نيئة', 300, 'حبتان صغيرتان', '2 small'], ['زبادي يوناني خالي الدسم', 150], ['عسل', 12], ['جوز (عين الجمل)', 14, 'مقطّع', 'chopped']),
    seasonings: ing(['قرفة مطحونة', 1], ['فانيليا سائلة', 2]),
    tempC: 200,
    stepsAr: ['اغسل البطاطا ووخزها بالشوكة، واشوها في الفرن 200°م 40 دقيقة (أو القلاية 190°م 30 دقيقة) حتى تطرى تماماً.', 'اخلط الزبادي مع الفانيليا.', 'شق كل حبة، أضف الزبادي ثم العسل والقرفة والجوز.'],
    stepsEn: ['Wash the sweet potatoes, prick with a fork and bake at 200°C 40 min (air fryer 190°C 30 min) until completely soft.', 'Mix the yogurt with the vanilla.', 'Split each one, add the yogurt, then the honey, cinnamon and walnuts.']
  }),
  // ------------------------------------------------------------ low calorie
  R({
    id: 'lib4-chicken-lettuce-cups', nameAr: 'كاسات خس بالدجاج المفروم والخضار (قليلة السعرات)', nameEn: 'Chicken lettuce cups with crunchy vegetables (low calorie)', emoji: '🥬',
    meals: ['lunch', 'dinner'], tags: ['chicken', 'quick'], prepMin: 10, cookMin: 10, difficulty: 'easy', servings: 2, methods: ['pan'], storageAr: 'الحشوة بالثلاجة حتى 3 أيام؛ الخس يُحضّر عند التقديم.', storageEn: 'The filling keeps 3 days in the fridge; prepare the lettuce when serving.',
    ingredients: ing(['صدر دجاج', 300, 'مفروم ناعماً', 'finely chopped or minced'], ['خس', 120, 'أوراق كبيرة', 'large leaves'], ['جزر', 80, 'مبشور', 'grated'], ['خيار', 80], ['فطر (مشروم) أبيض', 100], ['صويا صوص قليل الصوديوم', 15], ['زيت زيتون', 6]),
    seasonings: ing(['ثوم', 6], ['زنجبيل طازج', 6], ['عصير ليم (لايم)', 10], ['بصل أخضر', 15], ['صلصة حارة (سريراتشا)', 8], ['سمسم', 3]),
    stepsAr: ['سخّن الزيت وقلّب الدجاج المفروم 5–6 دقائق مع التفتيت.', 'أضف الفطر المفروم والثوم والزنجبيل 3 دقائق، ثم الصويا والليم.', 'املأ أوراق الخس بالحشوة، وأضف الجزر والخيار والبصل الأخضر والسريراتشا والسمسم.'],
    stepsEn: ['Heat the oil and cook the minced chicken 5–6 min, breaking it up.', 'Add the chopped mushrooms, garlic and ginger for 3 min, then the soy sauce and lime.', 'Spoon into the lettuce leaves and top with carrot, cucumber, spring onion, sriracha and sesame.']
  })
];
