/**
 * Library-recipe ingredients → USDA FoodData Central (SR Legacy) reference rows, chosen by hand.
 * Used ONLY when the user's own food list has no food with that exact Arabic name. State is matched to how the
 * recipe weighs the ingredient (e.g. "أرز أبيض" is dry weight, "أرز أبيض مطبوخ" cooked; "…نيء/جاف" is dry/raw). `null` = no reliable
 * USDA equivalent exists → the ingredient is shown as missing and its nutrition is never estimated.
 * Every id was checked against public/fooddb/usda.json (tests/cardio-goals.test.ts verifies they exist).
 */
export const RECIPE_REF: Record<string, string | null> = {
  'زيت زيتون': 'S171413',            // Oil, olive, salad or cooking
  'طماطم': 'S170457',                // Tomatoes, red, ripe, raw, year round average
  'بصل': 'S170000',                  // Onions, raw
  'صدر دجاج': 'S171077',             // Chicken breast, skinless, boneless, meat only, raw
  'زبادي يوناني خالي الدسم': 'S170894', // Yogurt, Greek, plain, nonfat
  'بيض كامل': 'S171287',             // Egg, whole, raw, fresh
  'خيار': 'S168409',                 // Cucumber, with peel, raw
  'فلفل رومي (حلو)': 'S170108',      // Peppers, sweet, red, raw
  'أرز أبيض': 'S169756',             // Rice, white, long-grain, raw (the food table's "أرز أبيض" is raw/dry)
  'أرز أبيض مطبوخ': 'S168878',       // Rice, white, long-grain, enriched, cooked
  'خس': 'S169247',                   // Lettuce, cos or romaine, raw
  'توست بر (خبز أسمر)': 'S172688',   // Bread, whole-wheat, commercially prepared
  'بياض بيض': 'S172183',             // Egg, white, raw, fresh
  'خبز عربي أسمر': 'S174916',        // Bread, pita, whole-wheat
  'بطاطس': 'S170026',                // Potatoes, flesh and skin, raw
  'جزر': 'S170393',                  // Carrots, raw
  'لحم بقري قليل الدهن 90/10': 'S174030', // Beef, ground, 90% lean / 10% fat, raw
  'جبن موزاريلا قليلة الدسم': 'S170847', // Cheese, mozzarella, part skim milk
  'زبادي يوناني قليل الدسم': 'S170903', // Yogurt, Greek, plain, lowfat
  'سمك تونة (معلب بالماء)': 'S171986', // Tuna, light, canned in water, without salt, drained solids (matches the owner table)
  'تمر': 'S168191',                  // Dates, medjool
  'سبانخ': 'S168462',                // Spinach, raw
  'فراولة': 'S167762',               // Strawberries, raw
  'تورتيلا قمح': 'S167535',          // Tortillas, flour, shelf stable
  'طحينة': 'S170189',                // Tahini, from roasted and toasted kernels
  'ذرة حلوة مسلوقة': 'S169999',      // Corn, sweet, yellow, cooked, boiled, drained, without salt
  'معكرونة نيئة/جافة': 'S169736',    // Pasta, dry, enriched
  'كوسا': 'S169291',                 // Zucchini, includes skin, raw
  'واي بروتين (سكوب)': 'S173180',    // Beverages, protein powder whey based
  'جبن شيدر كامل الدسم': 'S173414',  // Cheese, cheddar
  'أرز بسمتي نيء/جاف': 'S168877',    // Rice, white, long-grain, raw, enriched
  'موز': 'S173944',                  // Bananas, raw
  'بروكلي': 'S170379',               // Broccoli, raw
  'روبيان (جمبري) نيء': 'S175179',   // Shrimp, raw
  'حمص مطبوخ': 'S173757',            // Chickpeas, cooked, boiled, without salt
  'حليب قليل الدسم': 'S170872',      // Milk, lowfat, 1% milkfat
  'لوز': 'S170567',                  // Nuts, almonds
  'جبن قريش قليل الدسم': 'S173417',  // Cheese, cottage, lowfat, 1% milkfat
  'فخذ دجاج بدون جلد': 'S173627',    // Chicken thigh, meat only, raw
  'سمك بلطي/تلابيا': 'S175176',      // Fish, tilapia, raw
  'بطاطا حلوة نيئة': 'S168482',      // Sweet potato, raw, unprepared
  'عدس نيء/جاف': 'S172420',          // Lentils, raw
  'خضار مشكلة بالذرة (مجمدة)': 'S170471', // Vegetables, mixed, frozen, unprepared
  'أفوكادو': 'S171705',              // Avocados, raw, all commercial varieties
  'زبدة': 'S173410',                 // Butter, salted
  'مانجو': 'S169910',                // Mangos, raw
  'صلصة باربكيو': 'S174523',         // Sauce, barbecue
  'مايونيز لايت': 'S173594',         // Salad dressing, mayonnaise, light
  'سمك سلمون': 'S175167',            // Fish, salmon, Atlantic, farmed, raw
  'فاصوليا حمراء مطبوخة': 'S175194', // Beans, kidney, red, cooked, boiled, without salt
  'سمك قاروس (سي باس) نيء': 'S175142', // Fish, sea bass, mixed species, raw
  'ديك رومي (توركي) مفروم': 'S172850', // Turkey, ground, 93% lean, raw
  'تفاح': 'S171688',                 // Apples, raw, with skin
  'زبدة فول سوداني': 'S172470',      // Peanut butter, smooth, without salt
  'جوز (عين الجمل)': 'S170187',      // Nuts, walnuts, english
  'فول مطبوخ': 'S173753',            // Broadbeans (fava), cooked, boiled, without salt
  'لبنة': null,                      // Labneh — no USDA equivalent; must be added/approved by the user
  'كبد دجاج نيء': 'S171060',         // Chicken liver, raw
  'ملفوف (كرنب)': 'S169975',         // Cabbage, raw
  'سمك ماكريل طازج (نيء)': 'S175119', // Fish, mackerel, Atlantic, raw
  'بازلاء مسلوقة': 'S170420',        // Peas, green, cooked, boiled, drained, without salt
  'باذنجان': 'S169228',              // Eggplant, raw
  'كبد بقري نيء': 'S169451',         // Beef liver, raw
  'برغل نيء/جاف': 'S170688',         // Bulgur, dry
  'كينوا نيئة/جافة': 'S168874',      // Quinoa, uncooked
  'فاصوليا سوداء مطبوخة': 'S173735', // Beans, black, cooked, boiled, without salt
  'قرنبيط': 'S169986',               // Cauliflower, raw
  'بذور الشيا': 'S170554',           // Chia seeds, dried
  'سمسم': 'S170150',                 // Sesame seeds, whole, dried
  // ---- seasonings, sauces and marinade ingredients (Cooking Guide) — counted like every other ingredient
  'ملح': 'S173468',                  // Salt, table (0 kcal; sodium)
  'فلفل أسود مطحون': 'S170931',      // Spices, pepper, black
  'كمون مطحون': 'S170923',           // Spices, cumin seed
  'بابريكا': 'S171329',              // Spices, paprika
  'شطة مطحونة (فلفل أحمر حار)': 'S170932', // Spices, pepper, red or cayenne
  'كركم مطحون': 'S172231',           // Spices, turmeric, ground
  'قرفة مطحونة': 'S171320',          // Spices, cinnamon, ground
  'زنجبيل مطحون': 'S170926',         // Spices, ginger, ground
  'كاري بودرة': 'S170924',           // Spices, curry powder
  'هيل مطحون': 'S170919',            // Spices, cardamom
  'قرنفل مطحون': 'S171321',          // Spices, cloves, ground
  'بهار حلو مطحون': 'S171315',       // Spices, allspice, ground
  'كزبرة ناشفة مطحونة': 'S170922',   // Spices, coriander seed
  'جوزة الطيب مطحونة': 'S171326',    // Spices, nutmeg, ground
  'بودرة ثوم': 'S171325',            // Spices, garlic powder
  'بودرة بصل': 'S171327',            // Spices, onion powder
  'زعتر مجفف': 'S170938',            // Spices, thyme, dried
  'أوريجانو مجفف': 'S171328',        // Spices, oregano, dried
  'روزماري مجفف': 'S171333',         // Spices, rosemary, dried
  'ريحان مجفف': 'S171317',           // Spices, basil, dried
  'نعناع مجفف': 'S172239',           // Spearmint, dried
  'ثوم': 'S169230',                  // Garlic, raw
  'زنجبيل طازج': 'S169231',          // Ginger root, raw
  'عصير ليمون': 'S167747',           // Lemon juice, raw
  'عصير ليم (لايم)': 'S168156',      // Lime juice, raw
  'بقدونس طازج': 'S170416',          // Parsley, fresh
  'كزبرة خضراء طازجة': 'S169997',    // Coriander (cilantro) leaves, raw
  'نعناع طازج': 'S173475',           // Spearmint, fresh
  'شبت طازج': 'S172233',             // Dill weed, fresh
  'ريحان طازج': 'S172232',           // Basil, fresh
  'بصل أخضر': 'S170005',             // Onions, spring or scallions, raw
  'فلفل حار أخضر': 'S170497',        // Peppers, hot chili, green, raw
  'صويا صوص قليل الصوديوم': 'S172473', // Soy sauce (shoyu), low sodium
  'صلصة حارة (سريراتشا)': 'S171186', // Sauce, hot chile, sriracha
  'خل أبيض': 'S172237',              // Vinegar, distilled
  'خل أحمر': 'S172240',              // Vinegar, red wine
  'خل بلسمي': 'S172241',             // Vinegar, balsamic
  'خردل': 'S172234',                 // Mustard, prepared, yellow
  'عسل': 'S169640',                  // Honey
  'فانيليا سائلة': 'S173471',        // Vanilla extract
  'كاكاو خام بودرة': 'S169593',      // Cocoa, dry powder, unsweetened
  'مخلل خيار': 'S168558',            // Pickles, cucumber, dill
  'معجون طماطم': 'S170459',          // Tomato products, canned, paste, without salt added
  'طماطم مهروسة معلبة': 'S170501',   // Tomatoes, crushed, canned
  'جبن بارميزان مبشور': 'S171247',   // Cheese, parmesan, grated
  'جبن كريمي قليل الدسم': 'S169079', // Cheese, cream, low fat
  'مرق دجاج قليل الصوديوم': 'S172888', // Soup, chicken broth, reduced sodium, ready to serve
  'نشا ذرة': 'S169698',              // Cornstarch
  'فطر (مشروم) أبيض': 'S169251',     // Mushrooms, white, raw
  'معكرونة قمح كامل نيئة/جافة': 'S169738', // Pasta, whole-wheat, dry
  'زيت أفوكادو': 'S173573',          // Oil, avocado
  'زيت كانولا': 'S172336',           // Oil, canola
  'زبدة غير مملحة': 'S173430',       // Butter, without salt
  'زبادي عادي قليل الدسم': 'S170886', // Yogurt, plain, low fat
  'بازلاء مجمدة': 'S170016',         // Peas, green, frozen, unprepared
  'كسكس نيء/جاف': 'S169699'          // Couscous, dry
};
