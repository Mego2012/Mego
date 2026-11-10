/**
 * Library-recipe ingredients → USDA FoodData Central (SR Legacy) reference rows, chosen by hand.
 * Used ONLY when the user's own food list has no food with that exact Arabic name. State is matched to how the
 * recipe weighs the ingredient (e.g. "أرز أبيض" is dry weight, "أرز أبيض مطبوخ" cooked; "…نيء/جاف" is dry/raw). `null` = no reliable
 * USDA equivalent exists → the ingredient is shown as missing and its nutrition is never estimated.
 * Every id was checked against public/fooddb/usda.json (tests/recipes-ref.test.ts verifies they exist).
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
  'سمسم': 'S170150'                  // Sesame seeds, whole, dried
};
