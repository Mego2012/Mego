# MEGO — Image licences

Generated from the repository on 18 November 2026. 37 dish photos and 74 single-food photos ship with the app.

## Rules applied

* **Only free licences that allow commercial use and modification:** CC0, public domain, CC BY, CC BY-SA. No NC (non-commercial) or ND (no-derivatives) licences, no stock or unlicensed images. The unit test `tests/photos.test.ts` fails the build if a shipped photo lacks a free licence, an author or a source page.
* **Every photo was chosen by a person looking at it** (contact sheets) and checking its title/description against the recipe ingredients. Candidates showing a different dish, branded fast-food packaging or mostly side dishes were rejected.
* **Honest labelling:** a dish photo is an *example of this kind of dish*, not a photo of the MEGO recipe. Under the recipe cover the app says so in Arabic and English ("Example photo of this kind of dish, not of this exact recipe…"), with the author and licence linked to the source page. The image alt text is "Example photo of {dish}" / "صورة توضيحية لطبق {dish}".
* **Ingredient mosaics are never presented as dish photos.** Recipes without a dish photo keep the mosaic of their own ingredient photos (marked decorative, `aria-hidden`) or a drawn placeholder.
* **Fallback:** if a dish photo fails to load (offline before caching, broken link), the component falls back to the ingredient mosaic automatically.
* **Processing:** centre-cropped to a square, resized to 400×400 px, WebP quality 72 (CC BY-SA "adapted" — the licence is kept and credited). Files: `public/dish-img/`; pipeline: `scripts/dish-photos/` (candidates → hand selection → build).
* **Credits in the app:** Settings → Photo credits → "Dish photos" lists every photo with author, licence link and source page.

## Dish photos shipped

| Recipe id | Recipe (EN / AR) | Photo (source page) | Author | Licence |
| --- | --- | --- | --- | --- |
| `lib-baked-apples` | Cinnamon baked apples with walnuts / تفاح بالفرن بالقرفة والجوز | [Baked apple 02.JPG](https://commons.wikimedia.org/wiki/File:Baked_apple_02.JPG) | Andrey Korzun | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-beef-potato-stew` | Beef, potato & carrot stew / يخنة لحم وبطاطس وجزر | [Beef stew with potatoes and carrots - Massachusetts.jpg](https://commons.wikimedia.org/wiki/File:Beef_stew_with_potatoes_and_carrots_-_Massachusetts.jpg) | Daderot | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| `lib-beef-shawarma` | Beef shawarma wraps / شاورما لحم بخبز أسمر | [Beef Shawarma.jpg](https://commons.wikimedia.org/wiki/File:Beef_Shawarma.jpg) | Hill93 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-beef-stirfry` | Beef & vegetable stir-fry with rice / لحم مقلقل بالخضار مع رز | [Cooking stir fry beef, Terrytown, Louisiana, February 2016 Skillet.jpg](https://commons.wikimedia.org/wiki/File:Cooking_stir_fry_beef,_Terrytown,_Louisiana,_February_2016_Skillet.jpg) | Infrogmation of New Orleans | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-caesar-light` | Light chicken Caesar salad / سلطة سيزر خفيفة بالدجاج | [Chicken Caesar salad - Auckland, New Zealand.jpg](https://commons.wikimedia.org/wiki/File:Chicken_Caesar_salad_-_Auckland,_New_Zealand.jpg) | Daderot | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| `lib-chicken-biryani` | Light chicken biryani / برياني دجاج خفيف | [Chicken Biryani 4.jpg](https://commons.wikimedia.org/wiki/File:Chicken_Biryani_4.jpg) | Gaurav Dhwaj Khadka | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-chicken-burger` | Grilled chicken burger / برجر دجاج مشوي بالتوست الأسمر | [Grilled Chicken Burger, Dôme Byford, 2026 (01).jpg](https://commons.wikimedia.org/wiki/File:Grilled_Chicken_Burger,_D%C3%B4me_Byford,_2026_(01).jpg) | Bahnfrend | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-chicken-curry` | Light yogurt chicken curry with rice / كاري دجاج خفيف بالزبادي مع رز | [Chicken Curry with Rice.jpg](https://commons.wikimedia.org/wiki/File:Chicken_Curry_with_Rice.jpg) | Gaurav Dhwaj Khadka | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-chicken-lettuce-cups` | Chicken lettuce cups / كؤوس خس بالدجاج المقلقل | [Slow Cooker Asian Chicken Lettuce Wraps (36167537862).jpg](https://commons.wikimedia.org/wiki/File:Slow_Cooker_Asian_Chicken_Lettuce_Wraps_(36167537862).jpg) | A Healthier Michigan from Detroit, United States | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) |
| `lib-chicken-soup` | Chicken vegetable noodle soup / شوربة دجاج بالخضار والمكرونة | [Chicken Noodle Soup US.jpg](https://commons.wikimedia.org/wiki/File:Chicken_Noodle_Soup_US.jpg) | Nichijyou123 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-chickpea-salad` | Chickpea salad with tahini dressing / سلطة حمص بالخضار والطحينة | [Chickpea Chop Salad (9484308160).jpg](https://commons.wikimedia.org/wiki/File:Chickpea_Chop_Salad_(9484308160).jpg) | Cajsa Lilliehook from Portland | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) |
| `lib-egg-fried-rice` | Healthy egg fried rice / رز مقلي صحي بالبيض والخضار | [Egg Fried Rice.jpg](https://commons.wikimedia.org/wiki/File:Egg_Fried_Rice.jpg) | Gaurav Dhwaj Khadka | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-fajita` | Chicken fajitas / فاهيتا دجاج بالفلفل | [Chicken fajitas - La Hacienda - Sarah Stierch.jpg](https://commons.wikimedia.org/wiki/File:Chicken_fajitas_-_La_Hacienda_-_Sarah_Stierch.jpg) | Missvain | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) |
| `lib-ful` | Ful medames with tahini & lemon / فول مدمس بالطحينة والليمون | [Ful medames.jpg](https://commons.wikimedia.org/wiki/File:Ful_medames.jpg) | Zachbe at en.wikipedia | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| `lib-kofta` | Air-fryer beef kofta with bread & salad / كفتة لحم بالقلاية الهوائية مع خبز وسلطة | [Kafta shish kebab and grilled vegetables on salad - Cambridge, MA.jpg](https://commons.wikimedia.org/wiki/File:Kafta_shish_kebab_and_grilled_vegetables_on_salad_-_Cambridge,_MA.jpg) | Daderot | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| `lib-lentil-soup` | Cumin lentil soup / شوربة عدس بالكمون | [Homemade Lentil Soup - Lavash 2025-02-10.jpg](https://commons.wikimedia.org/wiki/File:Homemade_Lentil_Soup_-_Lavash_2025-02-10.jpg) | Andy Li | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| `lib-masala-omelette` | Masala omelette / أومليت مسالا بالبصل والطماطم | [Indian Omelette Odisha.jpg](https://commons.wikimedia.org/wiki/File:Indian_Omelette_Odisha.jpg) | Saileshpat | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-moussaka-light` | Light baked beef moussaka / مسقعة خفيفة باللحم بالفرن | [Meat Moussaka - Kouzina, Brighton 2023-11-24.jpg](https://commons.wikimedia.org/wiki/File:Meat_Moussaka_-_Kouzina,_Brighton_2023-11-24.jpg) | Andy Li | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| `lib-mujaddara` | Lentil & bulgur mujaddara with yogurt / مجدرة برغل بالعدس مع زبادي | [Mjadra.jpg](https://commons.wikimedia.org/wiki/File:Mjadra.jpg) | Sabinem1 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-nice-cream` | Banana-date "nice cream" / آيس كريم الموز والتمر | [Vegan ice cream, banana nice cream.jpg](https://commons.wikimedia.org/wiki/File:Vegan_ice_cream,_banana_nice_cream.jpg) | Nitsan Simantov | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-oven-mandi` | Oven chicken mandi / مندي دجاج بالفرن | [Chicken Mandi.jpg](https://commons.wikimedia.org/wiki/File:Chicken_Mandi.jpg) | Maharana7573 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-protein-pancakes` | Banana protein pancakes (no oats) / بان كيك البروتين بالموز (بدون شوفان) | [Banana on pancake.jpg](https://commons.wikimedia.org/wiki/File:Banana_on_pancake.jpg) | Brandon Martin-Anderson | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) |
| `lib-salmon-rice` | Lemon salmon with rice & broccoli / سلمون بالليمون مع رز وبروكلي | [Healthy Entree (8514368701).jpg](https://commons.wikimedia.org/wiki/File:Healthy_Entree_(8514368701).jpg) | Prayitno / Thank you for (12 millions +) view from Los Angeles, USA | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |
| `lib-sayadieh` | Sea bass sayadieh / صيادية قاروس | [Fish Sayadieh.jpg](https://commons.wikimedia.org/wiki/File:Fish_Sayadieh.jpg) | young shanahan | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |
| `lib-shakshuka` | Pepper & tomato shakshuka / شكشوكة بالفلفل والطماطم | [Shakshuka by Calliopejen1.jpg](https://commons.wikimedia.org/wiki/File:Shakshuka_by_Calliopejen1.jpg) | Calliopejen1 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) |
| `lib-shawarma-wrap` | Chicken shawarma wrap with yogurt garlic sauce / راب شاورما دجاج بصلصة الزبادي | [Handmade Chicken Shawarma Wrap - Lavash.jpg](https://commons.wikimedia.org/wiki/File:Handmade_Chicken_Shawarma_Wrap_-_Lavash.jpg) | Andy Li | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| `lib-shish-tawook` | Shish tawook skewers with bread / أسياخ شيش طاووق مع خبز | [Tavuk Şiş.jpg](https://commons.wikimedia.org/wiki/File:Tavuk_%C5%9Ei%C5%9F.jpg) | Garrett Ziegler | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-stuffed-peppers` | Chicken & rice stuffed peppers / فلفل محشي بالدجاج والرز | [Stuffed Peppers Florentine.jpg](https://commons.wikimedia.org/wiki/File:Stuffed_Peppers_Florentine.jpg) | Roundhere44 | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| `lib-stuffed-zucchini` | Meat-stuffed zucchini (no rice, low carb) / كوسا محشية باللحم بدون رز (قليلة الكارب) | [Stuffed squash 2025 JORDAN (2).jpg](https://commons.wikimedia.org/wiki/File:Stuffed_squash_2025_JORDAN_(2).jpg) | Justwiki | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) |
| `lib-sweet-potato-fries` | Air-fryer sweet potato fries with yogurt dip / أصابع بطاطا حلوة بالقلاية مع صلصة زبادي | [Baked Sweet Potato Fries With Rosemary and Parmesan - 8420845814.jpg](https://commons.wikimedia.org/wiki/File:Baked_Sweet_Potato_Fries_With_Rosemary_and_Parmesan_-_8420845814.jpg) | Thriving Vegetarian | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |
| `lib-tikka-rice` | Yogurt chicken tikka with rice / دجاج تكا بالزبادي مع رز | [Chicken-Tikka.jpg](https://commons.wikimedia.org/wiki/File:Chicken-Tikka.jpg) | Minaxibose1992 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib-tuna-melt` | Tuna melt on whole-wheat toast / تونا ميلت بالتوست الأسمر | [Tuna Melt 2.jpg](https://commons.wikimedia.org/wiki/File:Tuna_Melt_2.jpg) | mosespreciado | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |
| `lib-turkey-meatballs` | Turkey meatballs in tomato sauce with pasta / كرات ديك رومي بصلصة الطماطم مع مكرونة | [Spaghetti and meatballs 1.jpg](https://commons.wikimedia.org/wiki/File:Spaghetti_and_meatballs_1.jpg) | jeffreyw | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) |
| `lib-turkish-eggs` | Turkish eggs on garlic yogurt / بيض تركي على زبادي بالثوم | [Çılbır with duck-fat sautéed Ramps (14826584557).jpg](https://commons.wikimedia.org/wiki/File:%C3%87%C4%B1lb%C4%B1r_with_duck-fat_saut%C3%A9ed_Ramps_(14826584557).jpg) | Premshree Pillai from Brooklyn, NY, US | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) |
| `lib4-healthy-chicken-pizza` | Healthy chicken pizza on wholemeal flatbread / بيتزا صحية بالدجاج على خبز عربي أسمر | [Chicken Pizza made in Uganda.jpg](https://commons.wikimedia.org/wiki/File:Chicken_Pizza_made_in_Uganda.jpg) | James Moore200 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib4-light-bechamel-pasta-bake` | High-protein light béchamel pasta bake with beef / مكرونة بالبشاميل الخفيفة باللحم (عالية البروتين) | [Pastitsio homemade.jpg](https://commons.wikimedia.org/wiki/File:Pastitsio_homemade.jpg) | Sam Bailey | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |
| `lib4-spicy-arrabbiata-chicken-pasta` | Spicy arrabbiata chicken pasta / مكرونة أرابياتا حارة بالدجاج | [Penne Arrabbiata.jpg](https://commons.wikimedia.org/wiki/File:Penne_Arrabbiata.jpg) | Petar Milošević | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) |

## Prioritised recipes without a dish photo (deliberately)

| Recipe id | Recipe | Why not |
| --- | --- | --- |
| `lib-kabsa` | Healthy chicken kabsa | Wikimedia Commons search was rate-limited (HTTP 429) every time it was tried on 18 Nov 2026; no candidate could be reviewed |
| `lib-fish-tacos` | Air-fryer fish tacos | every freely licensed candidate showed meat tacos (carnitas / al pastor), not fish |
| `lib-hummus-veg` | Hummus with veggie sticks | rejected after review: the square crop shows only the vegetable sticks, the hummus is cut off |
| `lib4-egyptian-chicken-rice` | Egyptian-style chicken with vermicelli rice | search failed (rate limit); a photo of plain vermicelli rice alone would not show the dish |
| `lib4-creamy-chicken-mozzarella-pasta` | Creamy chicken mozzarella pasta | best candidate is a mushroom cream pasta; the recipe has spinach and no mushrooms |
| `lib4-garlic-parmesan-chicken-pasta` | Garlic parmesan chicken pasta | best candidate is an unidentified restaurant product shot; dish cannot be confirmed from its record |
| `lib-mango-chia` | Mango chia pudding | no freely licensed photo found |
| `lib4-yogurt-banana-honey` | Greek yogurt with banana, honey & cinnamon | only candidate was a breakfast table with many dishes |
| `lib-yogurt-bowl` | Greek yogurt berry & banana bowl | rejected after review: the photo shows purple blueberry yogurt; the recipe is white Greek yogurt with strawberries and banana |
| `lib-airfryer-nuggets` | Air-fryer chicken nuggets | candidates were dominated by fries or novelty-shaped nuggets |

## Other recipes

The remaining 101 library recipes are home-style combinations (for example "chicken with rice and salad" variants) for which no single public photo would truthfully represent the recipe. They were not searched in this round and show their ingredient mosaic. Priority for this round was the best-known named dishes in the library (Arab, Mediterranean and international classics), because those are where a genuine example photo of the same dish exists.

## Single-food photos (existing, unchanged)

74 single-food photos (Wikimedia Commons, same licence rules, 320 px WebP) are listed with author, licence and source in `public/food-img/CREDITS.md` and in Settings → Photo credits.

## Brand assets

The MEGO logo, icons and drawn placeholders are original work made for MEGO.

*Technical licence record, not legal advice. CC BY-SA requires attribution and share-alike for the adapted image files; the in-app credits and this file provide the attribution.*
