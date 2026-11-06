/**
 * Built-in recipe library ("وصفاتي | My Recipes").
 * Ingredients reference foods of the user's own database by their exact Arabic name; nutrition is
 * ALWAYS computed from that database at runtime (never hardcoded here). Seasonings that are not in the
 * database are listed in `uncounted` and make the recipe show as an estimate.
 * Weights are the state named by the food record (raw rice = dry weight, raw chicken = raw weight…).
 */
import type { MealType } from './types';

export type Method = 'air-fryer' | 'oven' | 'pan' | 'pot' | 'grill' | 'no-cook' | 'blender';
export type Tag = 'chicken' | 'eggs' | 'rice' | 'fish' | 'meat' | 'sandwich' | 'quick' | 'meal-prep' | 'high-fiber' | 'vegetarian' | 'breakfast-idea';

export interface LibraryRecipe {
  id: string;
  nameAr: string;
  nameEn: string;
  emoji: string;
  meals: MealType[];
  tags: Tag[];
  prepMin: number;
  cookMin: number;
  difficulty: 'easy' | 'medium';
  servings: number;
  methods: Method[];
  ingredients: [food: string, grams: number, noteAr?: string, noteEn?: string][];
  /** Seasonings not in the database: [ar, en, approx kcal for the whole recipe] */
  uncounted: [string, string, number][];
  stepsAr: string[];
  stepsEn: string[];
  tipsAr: string[];
  tipsEn: string[];
}

const S = {
  garlic: ['ثوم', 'garlic', 10] as [string, string, number],
  lemon: ['عصير ليمون', 'lemon juice', 5] as [string, string, number],
  spices: ['بهارات (ملح، فلفل، كمون، بابريكا)', 'spices (salt, pepper, cumin, paprika)', 5] as [string, string, number],
  herbs: ['أعشاب (بقدونس/كزبرة/نعناع)', 'herbs (parsley/coriander/mint)', 2] as [string, string, number],
  soy: ['صويا صوص قليل الصوديوم', 'low-sodium soy sauce', 10] as [string, string, number],
  hot: ['صلصة حارة', 'hot sauce', 2] as [string, string, number],
  vinegar: ['خل', 'vinegar', 1] as [string, string, number],
  mustard: ['خردل', 'mustard', 5] as [string, string, number],
  stock: ['مرق/ماء', 'stock/water', 5] as [string, string, number],
  cinnamon: ['قرفة', 'cinnamon', 1] as [string, string, number],
  pickles: ['مخلل', 'pickles', 3] as [string, string, number]
};

export const LIBRARY: LibraryRecipe[] = [
  // ---------------------------------------------------------------- breakfast
  {
    id: 'lib-shakshuka', nameAr: 'شكشوكة بالفلفل والطماطم', nameEn: 'Pepper & tomato shakshuka', emoji: '🍳', meals: ['breakfast', 'dinner'], tags: ['eggs', 'quick', 'breakfast-idea'],
    prepMin: 8, cookMin: 15, difficulty: 'easy', servings: 2, methods: ['pan'],
    ingredients: [['بيض كامل', 220, '4 بيضات', '4 eggs'], ['بياض بيض', 99, '3 بياض', '3 whites'], ['طماطم', 300], ['فلفل رومي (حلو)', 120], ['بصل', 80], ['زيت زيتون', 8], ['توست بر (خبز أسمر)', 112, '4 شرائح', '4 slices']],
    uncounted: [S.garlic, S.spices],
    stepsAr: ['شوّح البصل والفلفل في الزيت 5 دقائق.', 'أضف الطماطم المفرومة والثوم والكمون والبابريكا واتركها تتسبك 6 دقائق.', 'اعمل حفراً وأضف البيض والبياض، غطِّ المقلاة 5–6 دقائق حتى يتماسك البياض.', 'قدّمها مع التوست المحمّص.'],
    stepsEn: ['Sauté onion and pepper in the oil for 5 min.', 'Add chopped tomato, garlic, cumin and paprika; simmer 6 min.', 'Make wells, add eggs and whites, cover 5–6 min until whites set.', 'Serve with toasted bread.'],
    tipsAr: ['للمزيد من البروتين: زد البياض إلى 5.', 'رشة شطة أو فلفل أحمر حار تعطيها نكهة أقوى.'], tipsEn: ['More protein: use 5 whites.', 'Add chili flakes for a kick.']
  },
  {
    id: 'lib-egg-muffins', nameAr: 'مافن البيض بالخضار (تحضير مسبق)', nameEn: 'Veggie egg muffins (meal prep)', emoji: '🧁', meals: ['breakfast', 'snacks'], tags: ['eggs', 'meal-prep', 'breakfast-idea'],
    prepMin: 10, cookMin: 20, difficulty: 'easy', servings: 3, methods: ['oven', 'air-fryer'],
    ingredients: [['بيض كامل', 330, '6 بيضات', '6 eggs'], ['بياض بيض', 198, '6 بياض', '6 whites'], ['سبانخ', 60], ['فلفل رومي (حلو)', 80], ['بصل', 50], ['جبن موزاريلا قليلة الدسم', 60]],
    uncounted: [S.spices],
    stepsAr: ['اخفق البيض والبياض مع الملح والفلفل.', 'وزّع الخضار المفرومة والجبن في 12 قالب مافن مدهون بخفة.', 'اسكب خليط البيض فوقها.', 'اخبز 20 دقيقة على 180°م (أو 12–14 دقيقة في القلاية الهوائية 160°م). الحصة = 4 قطع.'],
    stepsEn: ['Whisk eggs and whites with salt and pepper.', 'Divide chopped veg and cheese into 12 lightly greased muffin cups.', 'Pour the egg mix over.', 'Bake 20 min at 180°C (or 12–14 min air fryer at 160°C). Serving = 4 muffins.'],
    tipsAr: ['تُحفظ 4 أيام في الثلاجة؛ سخّنها 30 ثانية في المايكرويف.'], tipsEn: ['Keeps 4 days refrigerated; reheat 30 s in the microwave.']
  },
  {
    id: 'lib-yogurt-bowl', nameAr: 'زبادي يوناني بالفراولة والموز واللوز', nameEn: 'Greek yogurt berry & banana bowl', emoji: '🥣', meals: ['breakfast', 'snacks'], tags: ['quick', 'breakfast-idea', 'vegetarian'],
    prepMin: 4, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['زبادي يوناني قليل الدسم', 250], ['فراولة', 100], ['موز', 60], ['لوز', 10]],
    uncounted: [S.cinnamon],
    stepsAr: ['ضع الزبادي في وعاء.', 'أضف الفراولة والموز المقطّع.', 'رش اللوز المجروش والقرفة.'],
    stepsEn: ['Add yogurt to a bowl.', 'Top with sliced strawberries and banana.', 'Sprinkle crushed almonds and cinnamon.'],
    tipsAr: ['بديل: مانجو بدل الموز.', 'لبروتين أعلى أضف نصف سكوب واي.'], tipsEn: ['Swap banana for mango.', 'Add half a whey scoop for more protein.']
  },
  {
    id: 'lib-cottage-toast', nameAr: 'توست أسمر بالجبن القريش والطماطم', nameEn: 'Cottage cheese & tomato toast', emoji: '🍞', meals: ['breakfast', 'snacks'], tags: ['quick', 'breakfast-idea', 'vegetarian'],
    prepMin: 5, cookMin: 2, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['توست بر (خبز أسمر)', 56, 'شريحتان', '2 slices'], ['جبن قريش قليل الدسم', 150], ['طماطم', 100], ['خيار', 80]],
    uncounted: [S.spices, S.herbs],
    stepsAr: ['حمّص التوست.', 'افرد الجبن القريش واتبله بالفلفل الأسود والزعتر/النعناع.', 'ضع شرائح الطماطم والخيار فوقه.'],
    stepsEn: ['Toast the bread.', 'Spread cottage cheese, season with black pepper and thyme/mint.', 'Top with tomato and cucumber slices.'],
    tipsAr: ['أضف بيضة مسلوقة مقطعة لوجبة أكبر.'], tipsEn: ['Add a sliced boiled egg for a bigger meal.']
  },
  {
    id: 'lib-egg-wrap', nameAr: 'راب البيض والسبانخ والجبن', nameEn: 'Egg, spinach & cheese wrap', emoji: '🌯', meals: ['breakfast'], tags: ['eggs', 'quick', 'sandwich', 'breakfast-idea'],
    prepMin: 4, cookMin: 6, difficulty: 'easy', servings: 1, methods: ['pan'],
    ingredients: [['تورتيلا قمح', 45], ['بيض كامل', 110, 'بيضتان', '2 eggs'], ['بياض بيض', 66], ['سبانخ', 30], ['جبن موزاريلا قليلة الدسم', 20], ['زيت زيتون', 3]],
    uncounted: [S.spices, S.hot],
    stepsAr: ['اقلب السبانخ دقيقة في المقلاة.', 'أضف البيض المخفوق وحرّك حتى ينضج.', 'ضعه في التورتيلا مع الجبن ولفّها، ثم حمّصها دقيقة من كل جهة.'],
    stepsEn: ['Wilt spinach 1 min in the pan.', 'Add beaten eggs and scramble until set.', 'Fill the tortilla with eggs and cheese, roll and toast 1 min per side.'],
    tipsAr: ['أضف صلصة حارة أو سالسا طماطم.'], tipsEn: ['Add hot sauce or tomato salsa.']
  },
  {
    id: 'lib-ful', nameAr: 'فول مدمس بالطحينة والليمون', nameEn: 'Ful medames with tahini & lemon', emoji: '🫘', meals: ['breakfast', 'dinner'], tags: ['high-fiber', 'vegetarian', 'quick', 'breakfast-idea'],
    prepMin: 5, cookMin: 5, difficulty: 'easy', servings: 1, methods: ['pot'],
    ingredients: [['فول مطبوخ', 250], ['طحينة', 10], ['طماطم', 100], ['زيت زيتون', 5], ['خبز عربي أسمر', 60]],
    uncounted: [S.garlic, S.lemon, S.spices],
    stepsAr: ['سخّن الفول مع قليل من الماء واهرسه جزئياً.', 'أضف الثوم والليمون والكمون والطحينة.', 'زيّنه بالطماطم المفرومة والزيت وقدّمه مع الخبز.'],
    stepsEn: ['Warm the beans with a splash of water and partly mash.', 'Stir in garlic, lemon, cumin and tahini.', 'Top with diced tomato and oil; serve with bread.'],
    tipsAr: ['لبروتين أعلى: قدّمه مع بيضتين مسلوقتين.'], tipsEn: ['Add 2 boiled eggs for more protein.']
  },
  {
    id: 'lib-protein-pancakes', nameAr: 'بان كيك البروتين بالموز (بدون شوفان)', nameEn: 'Banana protein pancakes (no oats)', emoji: '🥞', meals: ['breakfast', 'snacks'], tags: ['eggs', 'quick', 'breakfast-idea'],
    prepMin: 5, cookMin: 8, difficulty: 'easy', servings: 1, methods: ['pan', 'blender'],
    ingredients: [['موز', 120], ['بيض كامل', 110], ['بياض بيض', 66], ['واي بروتين (سكوب)', 30], ['زبدة', 4], ['فراولة', 80]],
    uncounted: [S.cinnamon],
    stepsAr: ['اخلط الموز والبيض والبياض والواي والقرفة في الخلاط.', 'ادهن المقلاة بالزبدة واسكب دوائر صغيرة على نار متوسطة.', 'اقلبها عند ظهور الفقاعات، وقدّمها مع الفراولة.'],
    stepsEn: ['Blend banana, eggs, whites, whey and cinnamon.', 'Butter the pan; pour small rounds over medium heat.', 'Flip when bubbles appear; serve with strawberries.'],
    tipsAr: ['أضف ملعقة زبادي يوناني فوقها بدل الشراب.'], tipsEn: ['Top with Greek yogurt instead of syrup.']
  },
  {
    id: 'lib-labneh-plate', nameAr: 'صحن لبنة وبيض مسلوق وخضار', nameEn: 'Labneh, boiled eggs & veggie plate', emoji: '🥙', meals: ['breakfast', 'dinner'], tags: ['eggs', 'quick', 'breakfast-idea'],
    prepMin: 5, cookMin: 9, difficulty: 'easy', servings: 1, methods: ['pot', 'no-cook'],
    ingredients: [['لبنة', 60], ['بيض كامل', 110], ['خيار', 100], ['طماطم', 100], ['خبز عربي أسمر', 60], ['زيت زيتون', 5]],
    uncounted: [S.herbs],
    stepsAr: ['اسلق البيض 9 دقائق ثم برّده.', 'رتب اللبنة مع رشة زيت ونعناع.', 'قدّمها مع الخضار المقطعة والخبز.'],
    stepsEn: ['Boil eggs 9 min, then cool.', 'Plate labneh with a drizzle of oil and mint.', 'Serve with cut veggies and bread.'],
    tipsAr: ['قيم اللبنة في قاعدتك تقديرية — راجع الملصق.'], tipsEn: ['Labneh values in your database are estimates — check the label.']
  },
  {
    id: 'lib-white-omelette', nameAr: 'أومليت بياض البيض بالسبانخ والشيدر', nameEn: 'Egg-white spinach & cheddar omelette', emoji: '🥚', meals: ['breakfast', 'dinner'], tags: ['eggs', 'quick', 'breakfast-idea'],
    prepMin: 4, cookMin: 6, difficulty: 'easy', servings: 1, methods: ['pan'],
    ingredients: [['بياض بيض', 198, '6 بياض', '6 whites'], ['بيض كامل', 55], ['سبانخ', 40], ['طماطم', 80], ['جبن شيدر كامل الدسم', 15], ['توست بر (خبز أسمر)', 56], ['زيت زيتون', 3]],
    uncounted: [S.spices],
    stepsAr: ['اقلب السبانخ والطماطم في الزيت دقيقة.', 'أضف البيض المخفوق واتركه يتماسك على نار هادئة.', 'رش الشيدر واطوِ الأومليت، وقدّمه مع التوست.'],
    stepsEn: ['Sauté spinach and tomato 1 min.', 'Add beaten eggs; cook gently until set.', 'Add cheddar, fold and serve with toast.'],
    tipsAr: ['بديل: موزاريلا قليلة الدسم بدل الشيدر لدهون أقل.'], tipsEn: ['Use part-skim mozzarella for less fat.']
  },
  {
    id: 'lib-mango-protein-yogurt', nameAr: 'زبادي البروتين بالمانجو', nameEn: 'Mango protein yogurt', emoji: '🥭', meals: ['snacks', 'breakfast'], tags: ['quick'],
    prepMin: 3, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['زبادي يوناني خالي الدسم', 200], ['واي بروتين (سكوب)', 15], ['مانجو', 100]],
    uncounted: [],
    stepsAr: ['اخلط الزبادي مع نصف سكوب الواي حتى يصبح ناعماً.', 'أضف مكعبات المانجو.'],
    stepsEn: ['Stir half a whey scoop into the yogurt until smooth.', 'Top with mango cubes.'],
    tipsAr: ['جمّده 40 دقيقة ليصبح مثل الآيس كريم.'], tipsEn: ['Freeze 40 min for a frozen-yogurt treat.']
  },
  // ---------------------------------------------------------------- chicken
  {
    id: 'lib-kabsa', nameAr: 'كبسة دجاج صحية', nameEn: 'Healthy chicken kabsa', emoji: '🍛', meals: ['lunch', 'dinner'], tags: ['chicken', 'rice', 'meal-prep'],
    prepMin: 15, cookMin: 40, difficulty: 'medium', servings: 4, methods: ['pot'],
    ingredients: [['صدر دجاج', 600], ['أرز بسمتي نيء/جاف', 300], ['بصل', 100], ['طماطم', 150], ['جزر', 80], ['زيت زيتون', 15]],
    uncounted: [S.garlic, ['بهارات كبسة، هيل، قرفة، لومي', 'kabsa spices, cardamom, cinnamon, dried lime', 5], S.stock],
    stepsAr: ['شوّح البصل في الزيت ثم أضف الدجاج المقطع مكعبات والثوم وبهارات الكبسة.', 'أضف الطماطم والجزر المبشور واتركها 5 دقائق.', 'أضف 600 مل ماء واللومي واتركه يغلي 10 دقائق.', 'أضف الأرز المغسول، غطِّه واتركه على نار هادئة 20 دقيقة.', 'قسّمه 4 حصص متساوية.'],
    stepsEn: ['Sauté onion in oil, add cubed chicken, garlic and kabsa spices.', 'Add tomato and grated carrot; cook 5 min.', 'Add 600 ml water and dried lime; boil 10 min.', 'Add rinsed rice, cover and simmer 20 min.', 'Divide into 4 equal portions.'],
    tipsAr: ['قسّمها في علب للأسبوع (تُحفظ 4 أيام).', 'نسخة الفرن: حمّر الدجاج في الفرن ثم ضعه فوق الأرز.'], tipsEn: ['Portion into boxes for the week (4 days).', 'Oven version: roast the chicken and place it on the rice.']
  },
  {
    id: 'lib-airfryer-chicken-potato', nameAr: 'صدر دجاج بالقلاية الهوائية مع بطاطس وسلطة', nameEn: 'Air-fryer chicken breast with potatoes & salad', emoji: '🍗', meals: ['lunch', 'dinner'], tags: ['chicken', 'quick'],
    prepMin: 10, cookMin: 22, difficulty: 'easy', servings: 1, methods: ['air-fryer', 'oven'],
    ingredients: [['صدر دجاج', 200], ['بطاطس', 250], ['زيت زيتون', 7], ['خيار', 100], ['طماطم', 100]],
    uncounted: [S.garlic, S.lemon, S.spices],
    stepsAr: ['تبّل الدجاج بالثوم والليمون والبابريكا والملح.', 'قطّع البطاطس أصابع واخلطها بنصف الزيت.', 'ضع البطاطس في القلاية 200°م 10 دقائق، ثم أضف الدجاج 12 دقيقة مع التقليب.', 'قدّمها مع سلطة الخيار والطماطم وباقي الزيت.'],
    stepsEn: ['Season chicken with garlic, lemon, paprika and salt.', 'Cut potatoes into wedges; toss with half the oil.', 'Air-fry potatoes 10 min at 200°C, add chicken 12 more min, shaking once.', 'Serve with cucumber-tomato salad and the remaining oil.'],
    tipsAr: ['الفرن: 220°م 25–30 دقيقة.', 'بطاطا حلوة بدل البطاطس.'], tipsEn: ['Oven: 220°C for 25–30 min.', 'Swap for sweet potato.']
  },
  {
    id: 'lib-shawarma-wrap', nameAr: 'راب شاورما دجاج بصلصة الزبادي', nameEn: 'Chicken shawarma wrap with yogurt garlic sauce', emoji: '🌯', meals: ['lunch', 'dinner'], tags: ['chicken', 'sandwich'],
    prepMin: 15, cookMin: 12, difficulty: 'easy', servings: 1, methods: ['pan', 'air-fryer'],
    ingredients: [['صدر دجاج', 150], ['تورتيلا قمح', 45], ['زبادي يوناني خالي الدسم', 50], ['خس', 30], ['طماطم', 50], ['بصل', 20], ['زيت زيتون', 3]],
    uncounted: [S.garlic, S.lemon, ['بهارات شاورما', 'shawarma spices', 3], S.pickles],
    stepsAr: ['تبّل شرائح الدجاج ببهارات الشاورما والليمون والثوم (15 دقيقة على الأقل).', 'اطبخها في مقلاة ساخنة مع الزيت 8–10 دقائق حتى تتحمّر.', 'اخلط الزبادي مع الثوم والليمون كصلصة.', 'ضع الدجاج والخضار والصلصة والمخلل في التورتيلا ولفّها وحمّصها.'],
    stepsEn: ['Marinate chicken strips with shawarma spices, lemon and garlic (≥15 min).', 'Sear in a hot pan with the oil 8–10 min until browned.', 'Mix yogurt with garlic and lemon for the sauce.', 'Fill tortilla with chicken, veg, sauce and pickles; roll and toast.'],
    tipsAr: ['القلاية الهوائية: 200°م 12 دقيقة.', 'بديل: خبز عربي أسمر.'], tipsEn: ['Air fryer: 200°C for 12 min.', 'Use brown Arabic bread instead.']
  },
  {
    id: 'lib-tikka-rice', nameAr: 'دجاج تكا بالزبادي مع رز', nameEn: 'Yogurt chicken tikka with rice', emoji: '🍢', meals: ['lunch', 'dinner'], tags: ['chicken', 'rice', 'meal-prep'],
    prepMin: 15, cookMin: 30, difficulty: 'medium', servings: 4, methods: ['oven', 'air-fryer', 'pan'],
    ingredients: [['صدر دجاج', 500], ['زبادي يوناني قليل الدسم', 150], ['أرز أبيض', 240], ['بصل', 80], ['طماطم', 150], ['زيت زيتون', 10]],
    uncounted: [S.garlic, ['زنجبيل، جرام ماسالا، كركم، شطة', 'ginger, garam masala, turmeric, chili', 5], S.lemon],
    stepsAr: ['انقع الدجاج في الزبادي والبهارات والثوم والزنجبيل ساعة على الأقل.', 'اشوه في الفرن 220°م 18 دقيقة أو القلاية 200°م 14 دقيقة.', 'اطبخ صلصة من البصل والطماطم والبهارات بالزيت وأضف الدجاج.', 'قدّمه مع الأرز المطبوخ (60غ أرز نيء للحصة).'],
    stepsEn: ['Marinate chicken in yogurt, spices, garlic and ginger ≥1 h.', 'Roast at 220°C 18 min or air-fry 200°C 14 min.', 'Cook onion-tomato sauce with spices in the oil; add chicken.', 'Serve with rice (60 g dry rice per serving).'],
    tipsAr: ['كلما طال النقع صار الدجاج أطرى.'], tipsEn: ['Longer marinating = more tender chicken.']
  },
  {
    id: 'lib-bbq-bowl', nameAr: 'بول دجاج باربكيو مع رز وبروكلي وذرة', nameEn: 'BBQ chicken rice bowl', emoji: '🥗', meals: ['lunch', 'dinner'], tags: ['chicken', 'rice', 'quick'],
    prepMin: 8, cookMin: 15, difficulty: 'easy', servings: 1, methods: ['pan', 'air-fryer'],
    ingredients: [['صدر دجاج', 150], ['أرز أبيض', 70], ['صلصة باربكيو', 20], ['بروكلي', 100], ['ذرة حلوة مسلوقة', 50]],
    uncounted: [S.garlic, S.spices],
    stepsAr: ['اطبخ الأرز.', 'اشوِ الدجاج المتبل ثم اخلطه بصلصة الباربكيو في آخر دقيقة.', 'اسلق البروكلي على البخار 4 دقائق.', 'رتب الأرز والدجاج والبروكلي والذرة في وعاء.'],
    stepsEn: ['Cook the rice.', 'Grill the seasoned chicken; toss with BBQ sauce in the last minute.', 'Steam broccoli 4 min.', 'Assemble rice, chicken, broccoli and corn in a bowl.'],
    tipsAr: ['صلصة الباربكيو في قاعدتك تقديرية.'], tipsEn: ['BBQ sauce values in your database are estimates.']
  },
  {
    id: 'lib-fajita', nameAr: 'فاهيتا دجاج بالفلفل', nameEn: 'Chicken fajitas', emoji: '🌮', meals: ['lunch', 'dinner'], tags: ['chicken', 'sandwich'],
    prepMin: 12, cookMin: 12, difficulty: 'easy', servings: 4, methods: ['pan'],
    ingredients: [['صدر دجاج', 400], ['فلفل رومي (حلو)', 240], ['بصل', 120], ['زيت زيتون', 10], ['تورتيلا قمح', 180, '4 أرغفة', '4 tortillas'], ['زبادي يوناني خالي الدسم', 100]],
    uncounted: [S.garlic, S.lemon, ['بهارات فاهيتا (كمون، بابريكا مدخنة، أوريغانو)', 'fajita spices (cumin, smoked paprika, oregano)', 4]],
    stepsAr: ['قطّع الدجاج والفلفل والبصل شرائح.', 'تبّل الدجاج بالبهارات والليمون.', 'حمّر الدجاج في الزيت 6 دقائق، ثم أضف الخضار 5 دقائق.', 'قدّمها في التورتيلا مع الزبادي بدل الكريمة الحامضة.'],
    stepsEn: ['Slice chicken, peppers and onion.', 'Season chicken with spices and lime.', 'Sear chicken 6 min, add veg 5 min.', 'Serve in tortillas with Greek yogurt instead of sour cream.'],
    tipsAr: ['لكارب أقل: قدّمها على خس بدل التورتيلا.'], tipsEn: ['Lower carb: serve in lettuce cups.']
  },
  {
    id: 'lib-chicken-pasta', nameAr: 'مكرونة بالدجاج والكوسا وصلصة الطماطم', nameEn: 'Chicken & zucchini tomato pasta', emoji: '🍝', meals: ['lunch', 'dinner'], tags: ['chicken', 'meal-prep'],
    prepMin: 10, cookMin: 20, difficulty: 'easy', servings: 4, methods: ['pot', 'pan'],
    ingredients: [['صدر دجاج', 400], ['معكرونة نيئة/جافة', 280], ['طماطم', 300], ['كوسا', 200], ['جبن موزاريلا قليلة الدسم', 60], ['زيت زيتون', 10]],
    uncounted: [S.garlic, ['ريحان وأوريغانو', 'basil & oregano', 1], S.spices],
    stepsAr: ['اسلق المكرونة حسب العبوة.', 'حمّر الدجاج المكعبات في الزيت مع الثوم.', 'أضف الكوسا ثم الطماطم المهروسة والأعشاب واتركها 8 دقائق.', 'اخلطها مع المكرونة ورش الموزاريلا.'],
    stepsEn: ['Boil pasta as per pack.', 'Brown cubed chicken in oil with garlic.', 'Add zucchini, then crushed tomato and herbs; simmer 8 min.', 'Toss with pasta and top with mozzarella.'],
    tipsAr: ['أضف سبانخ في آخر دقيقة لمزيد من الخضار.'], tipsEn: ['Stir in spinach at the end for extra veg.']
  },
  {
    id: 'lib-lemon-thighs', nameAr: 'أفخاذ دجاج بالليمون والأعشاب مع بطاطس بالفرن', nameEn: 'Lemon-herb chicken thighs with roast potatoes', emoji: '🍋', meals: ['lunch', 'dinner'], tags: ['chicken', 'meal-prep'],
    prepMin: 10, cookMin: 40, difficulty: 'easy', servings: 4, methods: ['oven', 'air-fryer'],
    ingredients: [['فخذ دجاج بدون جلد', 600], ['بطاطس', 600], ['بصل', 100], ['زيت زيتون', 15]],
    uncounted: [S.garlic, S.lemon, ['روزماري وزعتر', 'rosemary & thyme', 1], S.spices],
    stepsAr: ['اخلط الأفخاذ مع الليمون والثوم والأعشاب والملح.', 'ضع البطاطس والبصل المقطع في صينية مع الزيت.', 'ضع الدجاج فوقها واخبز 220°م 35–40 دقيقة.'],
    stepsEn: ['Toss thighs with lemon, garlic, herbs and salt.', 'Spread potatoes and onion on a tray with the oil.', 'Top with chicken; roast at 220°C for 35–40 min.'],
    tipsAr: ['القلاية الهوائية: 190°م 22 دقيقة على دفعتين.'], tipsEn: ['Air fryer: 190°C 22 min in two batches.']
  },
  {
    id: 'lib-caesar-light', nameAr: 'سلطة سيزر خفيفة بالدجاج', nameEn: 'Light chicken Caesar salad', emoji: '🥬', meals: ['lunch', 'dinner'], tags: ['chicken', 'quick'],
    prepMin: 10, cookMin: 10, difficulty: 'easy', servings: 1, methods: ['pan', 'air-fryer'],
    ingredients: [['صدر دجاج', 150], ['خس', 120], ['توست بر (خبز أسمر)', 28, 'شريحة مكعبات محمصة', '1 slice as croutons'], ['زبادي يوناني خالي الدسم', 40], ['جبن شيدر كامل الدسم', 10]],
    uncounted: [S.garlic, S.lemon, S.mustard],
    stepsAr: ['اشوِ الدجاج وقطعه شرائح.', 'حمّص مكعبات التوست في القلاية 4 دقائق.', 'صلصة: زبادي + ليمون + ثوم + خردل + فلفل.', 'اخلط الخس بالصلصة وأضف الدجاج والخبز والجبن المبشور.'],
    stepsEn: ['Grill and slice the chicken.', 'Air-fry toast cubes 4 min.', 'Dressing: yogurt + lemon + garlic + mustard + pepper.', 'Toss lettuce with dressing; top with chicken, croutons and grated cheese.'],
    tipsAr: ['الصلصة بالزبادي توفر ~150 سعرة مقارنة بصلصة السيزر العادية.'], tipsEn: ['Yogurt dressing saves ~150 kcal vs classic Caesar.']
  },
  {
    id: 'lib-chicken-burger', nameAr: 'برجر دجاج مشوي بالتوست الأسمر', nameEn: 'Grilled chicken burger', emoji: '🍔', meals: ['lunch', 'dinner'], tags: ['chicken', 'sandwich'],
    prepMin: 10, cookMin: 10, difficulty: 'easy', servings: 1, methods: ['pan', 'grill', 'air-fryer'],
    ingredients: [['صدر دجاج', 150, 'مفروم', 'minced'], ['توست بر (خبز أسمر)', 56], ['خس', 30], ['طماطم', 50], ['مايونيز لايت', 15], ['بصل', 20]],
    uncounted: [S.garlic, S.spices, S.pickles],
    stepsAr: ['اخلط الدجاج المفروم مع البصل المبشور والثوم والبهارات وشكّله قرصاً.', 'اشوه 4–5 دقائق لكل جهة.', 'ركّبه في التوست المحمص مع الخس والطماطم والمايونيز لايت.'],
    stepsEn: ['Mix minced chicken with grated onion, garlic and spices; shape a patty.', 'Grill 4–5 min per side.', 'Assemble in toasted bread with lettuce, tomato and light mayo.'],
    tipsAr: ['المايونيز لايت قيمته تقديرية؛ بديل: زبادي بالخردل.'], tipsEn: ['Light mayo is an estimate; swap for mustard-yogurt.']
  },
  {
    id: 'lib-chicken-soup', nameAr: 'شوربة دجاج بالخضار والمكرونة', nameEn: 'Chicken vegetable noodle soup', emoji: '🍲', meals: ['lunch', 'dinner'], tags: ['chicken', 'meal-prep'],
    prepMin: 10, cookMin: 30, difficulty: 'easy', servings: 4, methods: ['pot'],
    ingredients: [['صدر دجاج', 300], ['جزر', 100], ['بطاطس', 200], ['كوسا', 150], ['بصل', 80], ['معكرونة نيئة/جافة', 60]],
    uncounted: [S.garlic, S.stock, S.spices, S.herbs],
    stepsAr: ['اسلق الدجاج مع البصل والبهارات في 1.5 لتر ماء 15 دقيقة ثم قطّعه.', 'أضف الجزر والبطاطس 10 دقائق.', 'أضف الكوسا والمكرونة 8 دقائق، وأعد الدجاج وقدّمها بالبقدونس.'],
    stepsEn: ['Simmer chicken with onion and spices in 1.5 L water 15 min; shred.', 'Add carrot and potato 10 min.', 'Add zucchini and pasta 8 min; return chicken; finish with parsley.'],
    tipsAr: ['مشبعة جداً بسعرات قليلة — مثالية للعشاء.'], tipsEn: ['Very filling for few calories — great for dinner.']
  },
  {
    id: 'lib-stuffed-peppers', nameAr: 'فلفل محشي بالدجاج والرز', nameEn: 'Chicken & rice stuffed peppers', emoji: '🫑', meals: ['lunch', 'dinner'], tags: ['chicken', 'rice', 'meal-prep'],
    prepMin: 20, cookMin: 35, difficulty: 'medium', servings: 4, methods: ['oven', 'air-fryer'],
    ingredients: [['صدر دجاج', 300, 'مفروم', 'minced'], ['أرز أبيض', 100], ['فلفل رومي (حلو)', 480, '4 حبات', '4 peppers'], ['طماطم', 200], ['جبن موزاريلا قليلة الدسم', 40], ['بصل', 60]],
    uncounted: [S.garlic, S.spices, S.herbs],
    stepsAr: ['اسلق الأرز نصف سلق.', 'حمّر الدجاج المفروم مع البصل والثوم والبهارات ثم أضف نصف الطماطم والأرز.', 'احشُ الفلفل وضعه في صينية مع باقي الطماطم.', 'اخبز 190°م 30 دقيقة، ورش الجبن في آخر 5 دقائق.'],
    stepsEn: ['Par-boil the rice.', 'Brown minced chicken with onion, garlic and spices; add half the tomato and the rice.', 'Stuff peppers; place in a dish with remaining tomato.', 'Bake 190°C 30 min; add cheese in the last 5 min.'],
    tipsAr: ['القلاية الهوائية: 180°م 15–18 دقيقة.'], tipsEn: ['Air fryer: 180°C for 15–18 min.']
  },
  {
    id: 'lib-chicken-liver', nameAr: 'كبدة دجاج بالبصل والفلفل', nameEn: 'Chicken liver with onion & peppers', emoji: '🍳', meals: ['breakfast', 'dinner'], tags: ['chicken', 'quick'],
    prepMin: 8, cookMin: 10, difficulty: 'easy', servings: 2, methods: ['pan'],
    ingredients: [['كبد دجاج نيء', 300], ['بصل', 100], ['فلفل رومي (حلو)', 120], ['زيت زيتون', 10], ['خبز عربي أسمر', 120]],
    uncounted: [S.garlic, S.lemon, S.spices],
    stepsAr: ['نظّف الكبدة وقطّعها.', 'حمّر البصل والفلفل في الزيت 4 دقائق.', 'أضف الكبدة والثوم والكمون 5–6 دقائق (لا تُطِل حتى لا تجف).', 'أضف الليمون وقدّمها مع الخبز.'],
    stepsEn: ['Trim and cut the livers.', 'Sauté onion and pepper 4 min.', 'Add liver, garlic and cumin 5–6 min (don’t overcook).', 'Finish with lemon; serve with bread.'],
    tipsAr: ['غنية بالحديد وفيتامين B12.'], tipsEn: ['Rich in iron and vitamin B12.']
  },
  // ---------------------------------------------------------------- fish & seafood
  {
    id: 'lib-tilapia-tray', nameAr: 'سمك بلطي بالفرن مع خضار وبطاطس', nameEn: 'Oven tilapia with veggies & potatoes', emoji: '🐟', meals: ['lunch', 'dinner'], tags: ['fish'],
    prepMin: 12, cookMin: 30, difficulty: 'easy', servings: 2, methods: ['oven'],
    ingredients: [['سمك بلطي/تلابيا', 480], ['بطاطس', 400], ['طماطم', 200], ['بصل', 100], ['زيت زيتون', 10]],
    uncounted: [S.garlic, S.lemon, ['كمون وكزبرة وشطة', 'cumin, coriander, chili', 3]],
    stepsAr: ['قطّع البطاطس شرائح رفيعة واخبزها مع نصف الزيت 15 دقيقة على 210°م.', 'تبّل السمك بالثوم والليمون والكمون.', 'ضع السمك والطماطم والبصل فوق البطاطس واخبز 15 دقيقة أخرى.'],
    stepsEn: ['Slice potatoes thinly; bake with half the oil 15 min at 210°C.', 'Season fish with garlic, lemon and cumin.', 'Lay fish, tomato and onion over the potatoes; bake 15 more min.'],
    tipsAr: ['بديل: قاروس أو أي سمك أبيض.'], tipsEn: ['Swap for sea bass or any white fish.']
  },
  {
    id: 'lib-salmon-rice', nameAr: 'سلمون بالليمون مع رز وبروكلي', nameEn: 'Lemon salmon with rice & broccoli', emoji: '🍣', meals: ['lunch', 'dinner'], tags: ['fish', 'rice', 'quick'],
    prepMin: 5, cookMin: 15, difficulty: 'easy', servings: 1, methods: ['oven', 'air-fryer', 'pan'],
    ingredients: [['سمك سلمون', 150], ['أرز بسمتي نيء/جاف', 60], ['بروكلي', 150]],
    uncounted: [S.garlic, S.lemon, S.spices],
    stepsAr: ['اطبخ الأرز.', 'تبّل السلمون بالليمون والثوم والملح.', 'القلاية الهوائية 200°م 9–10 دقائق (أو الفرن 200°م 12 دقيقة).', 'قدّمه مع البروكلي المطهو بالبخار.'],
    stepsEn: ['Cook the rice.', 'Season salmon with lemon, garlic and salt.', 'Air-fry 200°C 9–10 min (or oven 200°C 12 min).', 'Serve with steamed broccoli.'],
    tipsAr: ['السلمون غني بأوميغا 3 لكنه أعلى دهوناً — مناسب لأيام فيها دهون متبقية.'], tipsEn: ['Rich in omega-3 but higher fat — good when fat budget remains.']
  },
  {
    id: 'lib-shrimp-rice', nameAr: 'روبيان بالثوم مع رز بالطماطم', nameEn: 'Garlic shrimp with tomato rice', emoji: '🍤', meals: ['lunch', 'dinner'], tags: ['fish', 'rice'],
    prepMin: 10, cookMin: 25, difficulty: 'easy', servings: 3, methods: ['pan', 'pot'],
    ingredients: [['روبيان (جمبري) نيء', 400], ['أرز أبيض', 200], ['بصل', 80], ['طماطم', 150], ['زيت زيتون', 15]],
    uncounted: [S.garlic, S.lemon, ['بابريكا وكمون', 'paprika & cumin', 2], S.herbs],
    stepsAr: ['اطبخ الأرز مع الطماطم المهروسة ونصف البصل.', 'شوّح باقي البصل والثوم في الزيت دقيقتين.', 'أضف الروبيان والبابريكا 3–4 دقائق حتى يتحول للون الوردي.', 'أضف الليمون والبقدونس وقدّمه فوق الأرز.'],
    stepsEn: ['Cook rice with crushed tomato and half the onion.', 'Sauté remaining onion and garlic in oil 2 min.', 'Add shrimp and paprika 3–4 min until pink.', 'Finish with lemon and parsley; serve over rice.'],
    tipsAr: ['لا تُطِل طهي الروبيان حتى لا يصبح مطاطياً.'], tipsEn: ['Don’t overcook shrimp or it turns rubbery.']
  },
  {
    id: 'lib-tuna-sandwich', nameAr: 'ساندويتش تونة بالزبادي والخيار', nameEn: 'Tuna yogurt sandwich', emoji: '🥪', meals: ['lunch', 'snacks', 'breakfast'], tags: ['fish', 'sandwich', 'quick'],
    prepMin: 5, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['سمك تونة (معلب بالماء)', 120], ['زبادي يوناني خالي الدسم', 40], ['خيار', 50], ['توست بر (خبز أسمر)', 56], ['خس', 20]],
    uncounted: [S.lemon, S.mustard, S.spices],
    stepsAr: ['صفِّ التونة جيداً.', 'اخلطها مع الزبادي والخردل والليمون والخيار المفروم.', 'ضعها بين شريحتي التوست مع الخس.'],
    stepsEn: ['Drain tuna well.', 'Mix with yogurt, mustard, lemon and diced cucumber.', 'Sandwich between toast slices with lettuce.'],
    tipsAr: ['الزبادي بدل المايونيز يوفر ~100 سعرة.'], tipsEn: ['Yogurt instead of mayo saves ~100 kcal.']
  },
  {
    id: 'lib-tuna-bean-salad', nameAr: 'سلطة تونة بالفاصوليا الحمراء والذرة', nameEn: 'Tuna, kidney bean & corn salad', emoji: '🥗', meals: ['lunch', 'dinner'], tags: ['fish', 'high-fiber', 'quick'],
    prepMin: 8, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['سمك تونة (معلب بالماء)', 120], ['فاصوليا حمراء مطبوخة', 120], ['ذرة حلوة مسلوقة', 60], ['طماطم', 100], ['خيار', 100], ['زيت زيتون', 5]],
    uncounted: [S.lemon, S.herbs, S.spices],
    stepsAr: ['اشطف الفاصوليا والذرة.', 'اخلط الكل مع الليمون والزيت والبقدونس والملح.'],
    stepsEn: ['Rinse beans and corn.', 'Toss everything with lemon, oil, parsley and salt.'],
    tipsAr: ['بديل: حمص بدل الفاصوليا.'], tipsEn: ['Swap beans for chickpeas.']
  },
  {
    id: 'lib-seabass-salad', nameAr: 'قاروس مشوي مع بطاطس وسلطة', nameEn: 'Grilled sea bass with potatoes & salad', emoji: '🐠', meals: ['lunch', 'dinner'], tags: ['fish'],
    prepMin: 10, cookMin: 20, difficulty: 'easy', servings: 1, methods: ['grill', 'oven', 'air-fryer'],
    ingredients: [['سمك قاروس (سي باس) نيء', 250], ['بطاطس', 150], ['خس', 80], ['طماطم', 100], ['خيار', 100], ['زيت زيتون', 5]],
    uncounted: [S.garlic, S.lemon, S.herbs],
    stepsAr: ['تبّل السمك بالليمون والثوم والأعشاب.', 'اشوه 8–10 دقائق أو في الفرن 200°م 15 دقيقة.', 'اسلق البطاطس وقدّمها مع السلطة والزيت.'],
    stepsEn: ['Season fish with lemon, garlic and herbs.', 'Grill 8–10 min or bake 200°C 15 min.', 'Boil potatoes; serve with salad and oil.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-fish-tacos', nameAr: 'تاكو سمك بالقلاية الهوائية', nameEn: 'Air-fryer fish tacos', emoji: '🌮', meals: ['lunch', 'dinner'], tags: ['fish', 'sandwich'],
    prepMin: 12, cookMin: 10, difficulty: 'easy', servings: 3, methods: ['air-fryer', 'oven'],
    ingredients: [['سمك بلطي/تلابيا', 300], ['تورتيلا قمح', 135, '3 أرغفة', '3 tortillas'], ['ملفوف (كرنب)', 120], ['زبادي يوناني خالي الدسم', 60], ['طماطم', 100]],
    uncounted: [S.lemon, ['بابريكا مدخنة وكمون', 'smoked paprika & cumin', 2], S.hot],
    stepsAr: ['تبّل السمك بالبابريكا والكمون والليمون.', 'القلاية 200°م 8–10 دقائق.', 'صلصة: زبادي + ليمون + صلصة حارة.', 'ضع السمك والملفوف والطماطم والصلصة في التورتيلا الدافئة.'],
    stepsEn: ['Season fish with paprika, cumin and lime.', 'Air-fry 200°C 8–10 min.', 'Sauce: yogurt + lime + hot sauce.', 'Fill warm tortillas with fish, cabbage, tomato and sauce.'],
    tipsAr: ['الفرن: 210°م 12 دقيقة.'], tipsEn: ['Oven: 210°C for 12 min.']
  },
  {
    id: 'lib-mackerel-sweetpotato', nameAr: 'ماكريل بالفرن مع بطاطا حلوة', nameEn: 'Baked mackerel with sweet potato', emoji: '🐟', meals: ['lunch', 'dinner'], tags: ['fish'],
    prepMin: 10, cookMin: 30, difficulty: 'easy', servings: 2, methods: ['oven', 'air-fryer'],
    ingredients: [['سمك ماكريل طازج (نيء)', 300], ['بطاطا حلوة نيئة', 400], ['خس', 100]],
    uncounted: [S.garlic, S.lemon, S.spices],
    stepsAr: ['قطّع البطاطا الحلوة واخبزها 15 دقيقة على 210°م.', 'أضف الماكريل المتبل بالثوم والليمون 15 دقيقة.', 'قدّمه مع الخس.'],
    stepsEn: ['Cube sweet potato; bake 15 min at 210°C.', 'Add mackerel seasoned with garlic and lemon for 15 min.', 'Serve with lettuce.'],
    tipsAr: ['الماكريل دسم بطبيعته فلا يحتاج زيتاً.'], tipsEn: ['Mackerel is naturally oily — no extra oil needed.']
  },
  {
    id: 'lib-shrimp-pasta', nameAr: 'باستا الروبيان بالطماطم والسبانخ', nameEn: 'Shrimp, tomato & spinach pasta', emoji: '🍝', meals: ['lunch', 'dinner'], tags: ['fish'],
    prepMin: 10, cookMin: 18, difficulty: 'easy', servings: 3, methods: ['pot', 'pan'],
    ingredients: [['روبيان (جمبري) نيء', 300], ['معكرونة نيئة/جافة', 200], ['طماطم', 300], ['سبانخ', 60], ['زيت زيتون', 10]],
    uncounted: [S.garlic, ['شطة مجروشة وريحان', 'chili flakes & basil', 1]],
    stepsAr: ['اسلق المكرونة.', 'شوّح الثوم والشطة في الزيت، أضف الطماطم 6 دقائق.', 'أضف الروبيان 3 دقائق ثم السبانخ.', 'اخلطها مع المكرونة.'],
    stepsEn: ['Boil pasta.', 'Sauté garlic and chili in oil; add tomato 6 min.', 'Add shrimp 3 min, then spinach.', 'Toss with pasta.'],
    tipsAr: [], tipsEn: []
  },
  // ---------------------------------------------------------------- meat
  {
    id: 'lib-kofta', nameAr: 'كفتة لحم بالقلاية الهوائية مع خبز وسلطة', nameEn: 'Air-fryer beef kofta with bread & salad', emoji: '🍢', meals: ['lunch', 'dinner'], tags: ['meat', 'meal-prep'],
    prepMin: 15, cookMin: 12, difficulty: 'easy', servings: 4, methods: ['air-fryer', 'grill', 'oven'],
    ingredients: [['لحم بقري قليل الدهن 90/10', 500], ['بصل', 100], ['خبز عربي أسمر', 240], ['طماطم', 200], ['خيار', 200], ['زبادي يوناني خالي الدسم', 100]],
    uncounted: [S.garlic, S.herbs, ['بهارات مشكلة وسماق', 'mixed spice & sumac', 3]],
    stepsAr: ['اخلط اللحم مع البصل المبشور والبقدونس والبهارات.', 'شكّلها أصابع على أسياخ.', 'القلاية 200°م 10–12 دقيقة مع التقليب.', 'قدّمها مع الخبز والسلطة وصلصة الزبادي.'],
    stepsEn: ['Mix beef with grated onion, parsley and spices.', 'Shape onto skewers.', 'Air-fry 200°C 10–12 min, turning once.', 'Serve with bread, salad and yogurt sauce.'],
    tipsAr: ['الشواية أو الفرن 220°م 15 دقيقة.'], tipsEn: ['Grill or oven 220°C for 15 min.']
  },
  {
    id: 'lib-beef-rice-bowl', nameAr: 'رز باللحم المفروم والبازلاء والجزر', nameEn: 'Beef, pea & carrot rice', emoji: '🍚', meals: ['lunch', 'dinner'], tags: ['meat', 'rice', 'meal-prep'],
    prepMin: 10, cookMin: 30, difficulty: 'easy', servings: 4, methods: ['pot'],
    ingredients: [['لحم بقري قليل الدهن 90/10', 400], ['أرز أبيض', 240], ['بازلاء مسلوقة', 160], ['جزر', 100], ['بصل', 80], ['زيت زيتون', 5]],
    uncounted: [S.garlic, ['بهارات مشكلة', 'mixed spices', 3], S.stock],
    stepsAr: ['حمّر اللحم مع البصل في الزيت.', 'أضف الجزر والبهارات ثم الأرز و480 مل ماء.', 'اتركه 18 دقيقة على نار هادئة، وأضف البازلاء آخر 5 دقائق.'],
    stepsEn: ['Brown beef with onion in the oil.', 'Add carrot and spices, then rice and 480 ml water.', 'Simmer 18 min; add peas in the last 5 min.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-beef-stirfry', nameAr: 'لحم مقلقل بالخضار مع رز', nameEn: 'Beef & vegetable stir-fry with rice', emoji: '🥘', meals: ['lunch', 'dinner'], tags: ['meat', 'rice'],
    prepMin: 15, cookMin: 15, difficulty: 'easy', servings: 4, methods: ['pan'],
    ingredients: [['لحم بقري قليل الدهن 90/10', 400], ['فلفل رومي (حلو)', 240], ['بصل', 120], ['بروكلي', 200], ['زيت زيتون', 10], ['أرز أبيض', 200]],
    uncounted: [S.garlic, S.soy, ['زنجبيل', 'ginger', 1]],
    stepsAr: ['قطّع اللحم شرائح رفيعة.', 'حمّره في مقلاة ساخنة جداً مع الزيت دقيقتين ثم أخرجه.', 'اقلب الخضار 4 دقائق، أعد اللحم مع الصويا والثوم والزنجبيل.', 'قدّمه فوق الأرز.'],
    stepsEn: ['Slice beef thinly.', 'Sear in a very hot pan 2 min; remove.', 'Stir-fry veg 4 min; return beef with soy, garlic and ginger.', 'Serve over rice.'],
    tipsAr: ['الصويا صوص يرفع الصوديوم — استخدم القليل منه.'], tipsEn: ['Soy sauce adds sodium — use sparingly.']
  },
  {
    id: 'lib-turkey-meatballs', nameAr: 'كرات ديك رومي بصلصة الطماطم مع مكرونة', nameEn: 'Turkey meatballs in tomato sauce with pasta', emoji: '🍝', meals: ['lunch', 'dinner'], tags: ['meat', 'meal-prep'],
    prepMin: 15, cookMin: 25, difficulty: 'medium', servings: 4, methods: ['oven', 'air-fryer', 'pot'],
    ingredients: [['ديك رومي (توركي) مفروم', 500], ['طماطم', 400], ['بصل', 80], ['معكرونة نيئة/جافة', 240]],
    uncounted: [S.garlic, ['أوريغانو وريحان', 'oregano & basil', 1], S.spices],
    stepsAr: ['اخلط اللحم مع نصف البصل المبشور والثوم والأعشاب وشكّل 20 كرة.', 'اخبزها 200°م 15 دقيقة (أو القلاية 10 دقائق).', 'اطبخ الطماطم مع باقي البصل 10 دقائق وضع الكرات فيها.', 'قدّمها مع المكرونة.'],
    stepsEn: ['Mix turkey with half the grated onion, garlic and herbs; roll 20 balls.', 'Bake 200°C 15 min (or air-fry 10 min).', 'Simmer tomato with remaining onion 10 min; add meatballs.', 'Serve with pasta.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-lettuce-burger', nameAr: 'برجر لحم بخبز الخس (قليل الكارب)', nameEn: 'Lettuce-wrapped beef burger (low carb)', emoji: '🥬', meals: ['lunch', 'dinner'], tags: ['meat', 'quick'],
    prepMin: 8, cookMin: 10, difficulty: 'easy', servings: 1, methods: ['pan', 'grill', 'air-fryer'],
    ingredients: [['لحم بقري قليل الدهن 90/10', 150], ['جبن شيدر كامل الدسم', 15], ['خس', 60], ['طماطم', 60], ['بصل', 20], ['مايونيز لايت', 10]],
    uncounted: [S.spices, S.mustard, S.pickles],
    stepsAr: ['شكّل اللحم قرصاً وتبّله بالملح والفلفل.', 'اشوه 4 دقائق لكل جهة وضع الشيدر في آخر دقيقة.', 'لفّه في أوراق الخس مع الطماطم والبصل والصلصة.'],
    stepsEn: ['Shape patty; season with salt and pepper.', 'Grill 4 min per side; add cheddar in the last minute.', 'Wrap in lettuce leaves with tomato, onion and sauce.'],
    tipsAr: ['أضف بطاطس بالقلاية جانباً إن كان عندك كارب متبقٍ.'], tipsEn: ['Add air-fried potatoes on the side if carbs remain.']
  },
  {
    id: 'lib-moussaka-light', nameAr: 'مسقعة خفيفة باللحم بالفرن', nameEn: 'Light baked beef moussaka', emoji: '🍆', meals: ['lunch', 'dinner'], tags: ['meat', 'meal-prep'],
    prepMin: 20, cookMin: 40, difficulty: 'medium', servings: 4, methods: ['oven', 'air-fryer'],
    ingredients: [['لحم بقري قليل الدهن 90/10', 300], ['باذنجان', 500], ['طماطم', 300], ['بصل', 100], ['زيت زيتون', 10], ['خبز عربي أسمر', 120]],
    uncounted: [S.garlic, S.spices, S.cinnamon],
    stepsAr: ['قطّع الباذنجان شرائح، ادهنها بنصف الزيت واشوها في الفرن 220°م 15 دقيقة (بدل القلي).', 'حمّر اللحم مع البصل والثوم والبهارات ثم أضف الطماطم 10 دقائق.', 'رتب الباذنجان واللحم طبقات واخبز 20 دقيقة على 190°م.', 'قدّمها مع الخبز.'],
    stepsEn: ['Slice eggplant, brush with half the oil and roast 220°C 15 min (instead of frying).', 'Brown beef with onion, garlic and spices; add tomato 10 min.', 'Layer eggplant and beef; bake 20 min at 190°C.', 'Serve with bread.'],
    tipsAr: ['شوي الباذنجان بدل قليه يوفر مئات السعرات.'], tipsEn: ['Roasting instead of frying the eggplant saves hundreds of kcal.']
  },
  {
    id: 'lib-beef-liver', nameAr: 'كبدة بقري إسكندراني', nameEn: 'Alexandrian-style beef liver', emoji: '🌶️', meals: ['breakfast', 'dinner'], tags: ['meat', 'quick'],
    prepMin: 10, cookMin: 8, difficulty: 'easy', servings: 2, methods: ['pan'],
    ingredients: [['كبد بقري نيء', 300], ['فلفل رومي (حلو)', 120], ['طماطم', 100], ['زيت زيتون', 10], ['خبز عربي أسمر', 120]],
    uncounted: [S.garlic, S.lemon, ['كمون وشطة', 'cumin & chili', 2]],
    stepsAr: ['قطّع الكبدة شرائح رفيعة.', 'اقلبها في مقلاة ساخنة جداً بالزيت 3 دقائق.', 'أضف الثوم والفلفل والشطة والكمون والطماطم 3 دقائق.', 'أضف الليمون وقدّمها في الخبز.'],
    stepsEn: ['Slice the liver thinly.', 'Sear in a very hot pan with oil 3 min.', 'Add garlic, pepper, chili, cumin and tomato 3 min.', 'Finish with lemon; serve in bread.'],
    tipsAr: [], tipsEn: []
  },
  // ---------------------------------------------------------------- rice, grains & legumes
  {
    id: 'lib-lentil-soup', nameAr: 'شوربة عدس بالكمون', nameEn: 'Cumin lentil soup', emoji: '🥣', meals: ['lunch', 'dinner'], tags: ['high-fiber', 'vegetarian', 'meal-prep'],
    prepMin: 10, cookMin: 30, difficulty: 'easy', servings: 4, methods: ['pot', 'blender'],
    ingredients: [['عدس نيء/جاف', 200], ['جزر', 100], ['بصل', 100], ['بطاطس', 150], ['زيت زيتون', 10]],
    uncounted: [S.garlic, ['كمون وكركم', 'cumin & turmeric', 2], S.lemon, S.stock],
    stepsAr: ['شوّح البصل والثوم في الزيت.', 'أضف العدس والجزر والبطاطس و1.2 لتر ماء والكمون.', 'اتركها 25 دقيقة ثم اخلطها بالخلاط.', 'قدّمها مع الليمون.'],
    stepsEn: ['Sauté onion and garlic in oil.', 'Add lentils, carrot, potato, 1.2 L water and cumin.', 'Simmer 25 min, then blend.', 'Serve with lemon.'],
    tipsAr: ['لبروتين أعلى: قدّمها مع صدر دجاج مشوي.'], tipsEn: ['Pair with grilled chicken breast for more protein.']
  },
  {
    id: 'lib-mujaddara', nameAr: 'مجدرة برغل بالعدس مع زبادي', nameEn: 'Lentil & bulgur mujaddara with yogurt', emoji: '🍚', meals: ['lunch', 'dinner'], tags: ['high-fiber', 'vegetarian', 'meal-prep'],
    prepMin: 10, cookMin: 35, difficulty: 'easy', servings: 4, methods: ['pot', 'pan'],
    ingredients: [['عدس نيء/جاف', 150], ['برغل نيء/جاف', 150], ['بصل', 200], ['زيت زيتون', 15], ['زبادي يوناني خالي الدسم', 200]],
    uncounted: [['كمون', 'cumin', 1], S.stock],
    stepsAr: ['اسلق العدس 15 دقيقة.', 'أضف البرغل والكمون والملح واتركه 15 دقيقة.', 'حمّر البصل شرائح بالزيت حتى يتكرمل.', 'قدّمها مع البصل والزبادي.'],
    stepsEn: ['Boil lentils 15 min.', 'Add bulgur, cumin and salt; cook 15 min.', 'Caramelize sliced onion in the oil.', 'Serve topped with onion and yogurt.'],
    tipsAr: ['البصل بالقلاية الهوائية (180°م 12 دقيقة) يقلل الزيت.'], tipsEn: ['Air-fry the onion (180°C 12 min) to use less oil.']
  },
  {
    id: 'lib-chickpea-salad', nameAr: 'سلطة حمص بالخضار والطحينة', nameEn: 'Chickpea salad with tahini dressing', emoji: '🥗', meals: ['lunch', 'dinner', 'snacks'], tags: ['high-fiber', 'vegetarian', 'quick'],
    prepMin: 10, cookMin: 0, difficulty: 'easy', servings: 3, methods: ['no-cook'],
    ingredients: [['حمص مطبوخ', 300], ['خيار', 200], ['طماطم', 200], ['فلفل رومي (حلو)', 120], ['طحينة', 20]],
    uncounted: [S.lemon, S.garlic, S.herbs],
    stepsAr: ['قطّع الخضار مكعبات صغيرة.', 'صلصة: طحينة + ليمون + ثوم + ماء.', 'اخلط الحمص والخضار والصلصة والبقدونس.'],
    stepsEn: ['Dice the vegetables.', 'Dressing: tahini + lemon + garlic + water.', 'Toss chickpeas, veg, dressing and parsley.'],
    tipsAr: ['أضف علبة تونة أو 120غ دجاج للحصة لتصبح وجبة عالية البروتين.'], tipsEn: ['Add a can of tuna or 120 g chicken per serving for a high-protein meal.']
  },
  {
    id: 'lib-quinoa-chicken', nameAr: 'كينوا بالدجاج والخضار المشكلة', nameEn: 'Chicken & mixed veg quinoa', emoji: '🥘', meals: ['lunch', 'dinner'], tags: ['chicken', 'meal-prep', 'high-fiber'],
    prepMin: 10, cookMin: 20, difficulty: 'easy', servings: 4, methods: ['pot', 'pan'],
    ingredients: [['كينوا نيئة/جافة', 180], ['صدر دجاج', 400], ['خضار مشكلة بالذرة (مجمدة)', 300], ['زيت زيتون', 10]],
    uncounted: [S.garlic, S.spices, S.lemon],
    stepsAr: ['اطبخ الكينوا في ضعف كميتها ماء 15 دقيقة.', 'حمّر الدجاج المكعبات بالزيت والثوم.', 'أضف الخضار المجمدة 6 دقائق ثم الكينوا والليمون.'],
    stepsEn: ['Cook quinoa in twice its volume of water 15 min.', 'Brown cubed chicken with oil and garlic.', 'Add frozen veg 6 min, then quinoa and lemon.'],
    tipsAr: ['بديل اقتصادي: برغل بدل الكينوا.'], tipsEn: ['Budget swap: bulgur instead of quinoa.']
  },
  {
    id: 'lib-black-bean-bowl', nameAr: 'بول فاصوليا سوداء ودجاج ورز وأفوكادو', nameEn: 'Black bean, chicken & avocado rice bowl', emoji: '🥑', meals: ['lunch', 'dinner'], tags: ['chicken', 'rice', 'high-fiber'],
    prepMin: 12, cookMin: 20, difficulty: 'easy', servings: 3, methods: ['pan', 'pot'],
    ingredients: [['فاصوليا سوداء مطبوخة', 200], ['أرز أبيض', 120], ['صدر دجاج', 300], ['ذرة حلوة مسلوقة', 100], ['طماطم', 150], ['أفوكادو', 100]],
    uncounted: [S.lemon, ['كمون وبابريكا', 'cumin & paprika', 2], S.herbs],
    stepsAr: ['اطبخ الأرز.', 'اشوِ الدجاج المتبل بالكمون والبابريكا وقطّعه.', 'سخّن الفاصوليا والذرة.', 'رتب الكل في أوعية مع الطماطم والأفوكادو والليمون.'],
    stepsEn: ['Cook the rice.', 'Grill chicken seasoned with cumin and paprika; slice.', 'Warm beans and corn.', 'Assemble bowls with tomato, avocado and lime.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-egg-fried-rice', nameAr: 'رز مقلي صحي بالبيض والخضار', nameEn: 'Healthy egg fried rice', emoji: '🍳', meals: ['lunch', 'dinner'], tags: ['eggs', 'rice', 'quick'],
    prepMin: 5, cookMin: 12, difficulty: 'easy', servings: 3, methods: ['pan'],
    ingredients: [['أرز أبيض', 200, 'مطبوخ ومبرد مسبقاً', 'cooked & chilled'], ['بيض كامل', 220], ['بياض بيض', 99], ['خضار مشكلة بالذرة (مجمدة)', 300], ['زيت زيتون', 10]],
    uncounted: [S.garlic, S.soy, ['بصل أخضر', 'spring onion', 2]],
    stepsAr: ['اقلب الخضار في الزيت 4 دقائق.', 'أزحها جانباً واخفق البيض حتى ينضج.', 'أضف الأرز البارد والصويا والثوم وقلّب 4 دقائق على نار عالية.'],
    stepsEn: ['Stir-fry veg in oil 4 min.', 'Push aside; scramble the eggs.', 'Add cold rice, soy and garlic; toss 4 min on high heat.'],
    tipsAr: ['أضف 300غ صدر دجاج مكعبات للوصفة لبروتين أعلى.'], tipsEn: ['Add 300 g diced chicken breast for more protein.']
  },
  // ---------------------------------------------------------------- sandwiches & wraps
  {
    id: 'lib-avocado-chicken-toast', nameAr: 'توست أفوكادو بالدجاج المشوي', nameEn: 'Avocado & grilled chicken toast', emoji: '🥑', meals: ['breakfast', 'lunch'], tags: ['chicken', 'sandwich', 'quick'],
    prepMin: 5, cookMin: 8, difficulty: 'easy', servings: 1, methods: ['pan'],
    ingredients: [['توست بر (خبز أسمر)', 56], ['أفوكادو', 50], ['صدر دجاج', 100], ['طماطم', 60]],
    uncounted: [S.lemon, S.spices],
    stepsAr: ['اشوِ الدجاج وقطّعه شرائح.', 'اهرس الأفوكادو مع الليمون والملح.', 'افرده على التوست المحمص وضع الدجاج والطماطم.'],
    stepsEn: ['Grill and slice chicken.', 'Mash avocado with lemon and salt.', 'Spread on toast; top with chicken and tomato.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-egg-salad-sandwich', nameAr: 'ساندويتش سلطة البيض بالزبادي', nameEn: 'Yogurt egg-salad sandwich', emoji: '🥪', meals: ['breakfast', 'lunch'], tags: ['eggs', 'sandwich', 'quick'],
    prepMin: 5, cookMin: 10, difficulty: 'easy', servings: 1, methods: ['pot'],
    ingredients: [['بيض كامل', 110], ['بياض بيض', 66], ['زبادي يوناني خالي الدسم', 40], ['توست بر (خبز أسمر)', 56], ['خس', 30]],
    uncounted: [S.mustard, S.spices],
    stepsAr: ['اسلق البيض والبياض 10 دقائق.', 'اهرسه مع الزبادي والخردل والفلفل.', 'ضعه في التوست مع الخس.'],
    stepsEn: ['Boil eggs and whites 10 min.', 'Mash with yogurt, mustard and pepper.', 'Sandwich in toast with lettuce.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-chicken-hummus-pita', nameAr: 'بيتا الدجاج بالحمص', nameEn: 'Chicken hummus pita', emoji: '🥙', meals: ['lunch', 'dinner'], tags: ['chicken', 'sandwich', 'high-fiber'],
    prepMin: 10, cookMin: 10, difficulty: 'easy', servings: 1, methods: ['pan', 'no-cook'],
    ingredients: [['خبز عربي أسمر', 60], ['صدر دجاج', 120], ['حمص مطبوخ', 60], ['طحينة', 5], ['خيار', 50], ['طماطم', 50]],
    uncounted: [S.lemon, S.garlic, S.spices],
    stepsAr: ['اهرس الحمص مع الطحينة والليمون والثوم كحمص بطحينة سريع.', 'اشوِ الدجاج المتبل.', 'افرد الحمص في الخبز وأضف الدجاج والخضار.'],
    stepsEn: ['Mash chickpeas with tahini, lemon and garlic for quick hummus.', 'Grill the seasoned chicken.', 'Spread hummus in the pita; add chicken and veg.'],
    tipsAr: [], tipsEn: []
  },
  // ---------------------------------------------------------------- low-carb
  {
    id: 'lib-chicken-zucchini', nameAr: 'دجاج بالكوسا والطماطم والموزاريلا (قليل الكارب)', nameEn: 'Chicken, zucchini & mozzarella bake (low carb)', emoji: '🧀', meals: ['lunch', 'dinner'], tags: ['chicken', 'meal-prep'],
    prepMin: 10, cookMin: 25, difficulty: 'easy', servings: 3, methods: ['oven', 'pan'],
    ingredients: [['صدر دجاج', 400], ['كوسا', 400], ['طماطم', 200], ['جبن موزاريلا قليلة الدسم', 60], ['زيت زيتون', 10]],
    uncounted: [S.garlic, ['أوريغانو', 'oregano', 1], S.spices],
    stepsAr: ['حمّر الدجاج المكعبات بالزيت والثوم.', 'أضف الكوسا 4 دقائق ثم الطماطم والأوريغانو.', 'انقلها لصينية ورش الجبن واخبز 200°م 12 دقيقة.'],
    stepsEn: ['Brown cubed chicken with oil and garlic.', 'Add zucchini 4 min, then tomato and oregano.', 'Transfer to a dish, top with cheese, bake 200°C 12 min.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-cauli-rice', nameAr: 'رز القرنبيط المقلي بالدجاج والبيض (قليل الكارب)', nameEn: 'Chicken cauliflower fried "rice" (low carb)', emoji: '🥦', meals: ['lunch', 'dinner'], tags: ['chicken', 'eggs', 'high-fiber'],
    prepMin: 12, cookMin: 15, difficulty: 'easy', servings: 3, methods: ['pan'],
    ingredients: [['قرنبيط', 500], ['صدر دجاج', 400], ['بيض كامل', 110], ['فلفل رومي (حلو)', 120], ['زيت زيتون', 10]],
    uncounted: [S.garlic, S.soy, ['زنجبيل', 'ginger', 1]],
    stepsAr: ['ابشر القرنبيط أو اطحنه نبضات في محضرة الطعام.', 'حمّر الدجاج المكعبات ثم أخرجه.', 'اقلب الفلفل والقرنبيط 6 دقائق، أضف البيض واخفقه.', 'أعد الدجاج مع الصويا والثوم.'],
    stepsEn: ['Grate or pulse cauliflower into rice.', 'Brown diced chicken; set aside.', 'Stir-fry pepper and cauliflower 6 min; scramble in the eggs.', 'Return chicken with soy and garlic.'],
    tipsAr: [], tipsEn: []
  },
  // ---------------------------------------------------------------- snacks
  {
    id: 'lib-veg-yogurt-dip', nameAr: 'خضار مع غموس الزبادي بالأعشاب', nameEn: 'Veggie sticks with herb yogurt dip', emoji: '🥕', meals: ['snacks'], tags: ['quick', 'vegetarian'],
    prepMin: 6, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['زبادي يوناني خالي الدسم', 150], ['جزر', 100], ['خيار', 150], ['فلفل رومي (حلو)', 80]],
    uncounted: [S.garlic, S.herbs, S.lemon],
    stepsAr: ['اخلط الزبادي مع الثوم والنعناع/الشبت والليمون.', 'قطّع الخضار أصابع وقدّمها معه.'],
    stepsEn: ['Mix yogurt with garlic, mint/dill and lemon.', 'Cut veg into sticks and dip.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-protein-shake', nameAr: 'شيك بروتين بالموز والحليب', nameEn: 'Banana milk protein shake', emoji: '🥤', meals: ['snacks', 'breakfast'], tags: ['quick'],
    prepMin: 3, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['blender'],
    ingredients: [['واي بروتين (سكوب)', 30], ['حليب قليل الدسم', 250], ['موز', 100]],
    uncounted: [S.cinnamon],
    stepsAr: ['اخلط الكل في الخلاط مع ثلج.'],
    stepsEn: ['Blend everything with ice.'],
    tipsAr: ['حليب خالي الدسم يوفر ~40 سعرة.'], tipsEn: ['Skim milk saves ~40 kcal.']
  },
  {
    id: 'lib-cottage-berries', nameAr: 'جبن قريش بالفراولة', nameEn: 'Cottage cheese with strawberries', emoji: '🍓', meals: ['snacks'], tags: ['quick', 'vegetarian'],
    prepMin: 3, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['جبن قريش قليل الدسم', 150], ['فراولة', 100]],
    uncounted: [S.cinnamon],
    stepsAr: ['ضع الجبن القريش في وعاء وأضف الفراولة والقرفة.'],
    stepsEn: ['Top cottage cheese with strawberries and cinnamon.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-dates-almonds', nameAr: 'تمر ولوز', nameEn: 'Dates & almonds', emoji: '🌴', meals: ['snacks'], tags: ['quick', 'vegetarian'],
    prepMin: 1, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['تمر', 24, '3 تمرات', '3 dates'], ['لوز', 14, '~10 حبات', '~10 almonds']],
    uncounted: [],
    stepsAr: ['وجبة خفيفة قبل التمرين بساعة.'],
    stepsEn: ['A quick pre-training snack, ~1 h before.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-eggs-cucumber', nameAr: 'بيض مسلوق مع خيار وكمون', nameEn: 'Boiled eggs with cucumber', emoji: '🥚', meals: ['snacks', 'breakfast'], tags: ['eggs', 'quick'],
    prepMin: 2, cookMin: 10, difficulty: 'easy', servings: 1, methods: ['pot'],
    ingredients: [['بيض كامل', 110], ['بياض بيض', 66], ['خيار', 150]],
    uncounted: [S.spices],
    stepsAr: ['اسلق البيض 9–10 دقائق.', 'قدّمه مع الخيار والملح والكمون.'],
    stepsEn: ['Boil eggs 9–10 min.', 'Serve with cucumber, salt and cumin.'],
    tipsAr: ['حضّر 6 بيضات مسلوقة للأسبوع.'], tipsEn: ['Boil 6 eggs ahead for the week.']
  },
  {
    id: 'lib-tuna-cucumber-boats', nameAr: 'قوارب خيار بالتونة', nameEn: 'Tuna cucumber boats', emoji: '🥒', meals: ['snacks'], tags: ['fish', 'quick'],
    prepMin: 6, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['سمك تونة (معلب بالماء)', 80], ['خيار', 200], ['زبادي يوناني خالي الدسم', 30]],
    uncounted: [S.lemon, S.spices],
    stepsAr: ['قسّم الخيار طولياً وفرّغ البذور.', 'املأه بخليط التونة والزبادي والليمون.'],
    stepsEn: ['Halve cucumbers lengthwise and scoop the seeds.', 'Fill with tuna-yogurt-lemon mix.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-apple-pb', nameAr: 'تفاح بزبدة الفول السوداني', nameEn: 'Apple with peanut butter', emoji: '🍎', meals: ['snacks'], tags: ['quick', 'vegetarian'],
    prepMin: 2, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['تفاح', 180], ['زبدة فول سوداني', 16, 'ملعقة', '1 tbsp']],
    uncounted: [S.cinnamon],
    stepsAr: ['قطّع التفاحة شرائح وقدّمها مع زبدة الفول السوداني.'],
    stepsEn: ['Slice the apple; serve with peanut butter.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-crispy-chickpeas', nameAr: 'حمص مقرمش بالقلاية الهوائية', nameEn: 'Air-fryer crispy chickpeas', emoji: '🫘', meals: ['snacks'], tags: ['high-fiber', 'vegetarian'],
    prepMin: 3, cookMin: 15, difficulty: 'easy', servings: 1, methods: ['air-fryer', 'oven'],
    ingredients: [['حمص مطبوخ', 150], ['زيت زيتون', 5]],
    uncounted: [['بابريكا وكمون وملح', 'paprika, cumin, salt', 2]],
    stepsAr: ['جفف الحمص جيداً بمنشفة.', 'اخلطه بالزيت والبهارات.', 'القلاية 200°م 13–15 دقيقة مع الهز كل 5 دقائق.'],
    stepsEn: ['Pat chickpeas very dry.', 'Toss with oil and spices.', 'Air-fry 200°C 13–15 min, shaking every 5 min.'],
    tipsAr: ['الفرن: 210°م 25 دقيقة.'], tipsEn: ['Oven: 210°C for 25 min.']
  },
  {
    id: 'lib-greek-yogurt-dates', nameAr: 'زبادي يوناني بالتمر والجوز', nameEn: 'Greek yogurt with dates & walnuts', emoji: '🥄', meals: ['snacks', 'breakfast'], tags: ['quick', 'vegetarian'],
    prepMin: 3, cookMin: 0, difficulty: 'easy', servings: 1, methods: ['no-cook'],
    ingredients: [['زبادي يوناني قليل الدسم', 200], ['تمر', 16, 'تمرتان', '2 dates'], ['جوز (عين الجمل)', 10]],
    uncounted: [S.cinnamon],
    stepsAr: ['قطّع التمر وأضفه للزبادي مع الجوز المجروش والقرفة.'],
    stepsEn: ['Chop dates; add to yogurt with crushed walnuts and cinnamon.'],
    tipsAr: [], tipsEn: []
  },
  {
    id: 'lib-sweet-potato-fries', nameAr: 'أصابع بطاطا حلوة بالقلاية مع صلصة زبادي', nameEn: 'Air-fryer sweet potato fries with yogurt dip', emoji: '🍠', meals: ['snacks', 'lunch'], tags: ['vegetarian'],
    prepMin: 5, cookMin: 18, difficulty: 'easy', servings: 1, methods: ['air-fryer', 'oven'],
    ingredients: [['بطاطا حلوة نيئة', 200], ['زيت زيتون', 5], ['زبادي يوناني خالي الدسم', 60]],
    uncounted: [['بابريكا وثوم بودرة', 'paprika & garlic powder', 2]],
    stepsAr: ['قطّع البطاطا أصابع واخلطها بالزيت والبهارات.', 'القلاية 200°م 16–18 دقيقة مع الهز.', 'قدّمها مع الزبادي بالثوم.'],
    stepsEn: ['Cut into fries; toss with oil and spices.', 'Air-fry 200°C 16–18 min, shaking.', 'Serve with garlic yogurt.'],
    tipsAr: [], tipsEn: []
  }
];
