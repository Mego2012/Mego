/**
 * Exercise library (built in) + custom exercises (kv "exercise:<id>").
 * Rep ranges, sets and rest are evidence-based starting points for hypertrophy/strength retention
 * (ACSM progression models; Schoenfeld et al. volume/rep-range work). No exercise photos are bundled — no freely
 * licensed photo set of these exact movements was available — the UI shows the target-muscle diagram instead.
 */
import { db } from './db';
import { kvSet, uid } from './repo';
import { normalizeText } from './normalize';

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'forearms'] as const;
export type Muscle = (typeof MUSCLES)[number];
/** Muscles that "Legs" covers in a split. */
export const LEGS: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves'];
export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'pullup_bar', 'dip_bars', 'ez_bar', 'smith'] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export interface Exercise {
  id: string;
  nameAr: string;
  nameEn: string;
  primary: Muscle;
  secondary: Muscle[];
  equipment: Equipment[];
  category: 'compound' | 'isolation';
  /** Bodyweight movement: load = body weight + added weight. */
  bodyweight?: boolean;
  /** Recommended starting prescription. */
  reps: [number, number];
  sets: number;
  restSec: number;
  /** Lower-body compound → larger load steps. */
  lower?: boolean;
  alternatives: string[];
  howEn: string;
  howAr: string;
  custom?: boolean;
}

const X = (id: string, nameAr: string, nameEn: string, primary: Muscle, secondary: Muscle[], equipment: Equipment[], category: Exercise['category'],
  reps: [number, number], sets: number, restSec: number, alternatives: string[], howEn: string, howAr: string, extra: Partial<Exercise> = {}): Exercise =>
  ({ id, nameAr, nameEn, primary, secondary, equipment, category, reps, sets, restSec, alternatives, howEn, howAr, ...extra });

export const EXERCISES: Exercise[] = [
  // chest
  X('bench_press', 'ضغط صدر بالبار', 'Barbell bench press', 'chest', ['triceps', 'shoulders'], ['barbell'], 'compound', [6, 10], 3, 150, ['db_bench', 'machine_chest_press', 'smith_bench', 'pushup'],
    'Shoulder blades pinned back, bar to lower chest, press up and slightly back. Use a spotter or safety pins.', 'لوحا الكتف للخلف، أنزل البار لأسفل الصدر ثم ادفعه للأعلى وقليلاً للخلف. استخدم مساعداً أو مساند أمان.'),
  X('db_bench', 'ضغط صدر بالدمبل', 'Dumbbell bench press', 'chest', ['triceps', 'shoulders'], ['dumbbell'], 'compound', [8, 12], 3, 120, ['bench_press', 'machine_chest_press', 'pushup'],
    'Lower the dumbbells to chest level with elbows about 45° from the body, then press together.', 'أنزل الدمبلز لمستوى الصدر والمرفقان بزاوية 45° تقريباً عن الجسم، ثم ادفع للأعلى.'),
  X('incline_db_press', 'ضغط صدر علوي بالدمبل', 'Incline dumbbell press', 'chest', ['shoulders', 'triceps'], ['dumbbell'], 'compound', [8, 12], 3, 120, ['incline_bench', 'smith_incline', 'machine_chest_press'],
    'Bench at 30–45°. Lower to upper chest, press up without locking hard.', 'المقعد بزاوية 30–45°. أنزل لأعلى الصدر ثم ادفع دون قفل المرفقين بقوة.'),
  X('incline_bench', 'ضغط صدر علوي بالبار', 'Incline barbell press', 'chest', ['shoulders', 'triceps'], ['barbell'], 'compound', [6, 10], 3, 150, ['incline_db_press', 'smith_incline'],
    'Bench at 30°. Bar to upper chest, press straight up.', 'المقعد بزاوية 30°. أنزل البار لأعلى الصدر ثم ادفع للأعلى مباشرة.'),
  X('smith_bench', 'ضغط صدر سميث', 'Smith machine bench press', 'chest', ['triceps', 'shoulders'], ['smith'], 'compound', [6, 10], 3, 120, ['bench_press', 'db_bench'],
    'Set the bench so the bar touches lower chest; press with controlled tempo.', 'اضبط المقعد ليلمس البار أسفل الصدر؛ ادفع بإيقاع متحكم.'),
  X('smith_incline', 'ضغط علوي سميث', 'Smith machine incline press', 'chest', ['shoulders', 'triceps'], ['smith'], 'compound', [8, 12], 3, 120, ['incline_db_press', 'incline_bench'],
    'Incline bench under the bar; lower to upper chest and press.', 'مقعد مائل تحت البار؛ أنزل لأعلى الصدر ثم ادفع.'),
  X('machine_chest_press', 'جهاز ضغط الصدر', 'Machine chest press', 'chest', ['triceps', 'shoulders'], ['machine'], 'compound', [8, 12], 3, 90, ['db_bench', 'pushup'],
    'Handles at mid-chest, press out, return slowly until a stretch.', 'المقابض بمنتصف الصدر، ادفع للأمام وعد ببطء حتى تشعر بالتمدد.'),
  X('cable_fly', 'تفتيح صدر بالكيبل', 'Cable fly', 'chest', ['shoulders'], ['cable'], 'isolation', [10, 15], 3, 75, ['pec_deck', 'db_fly'],
    'Slight elbow bend, bring hands together in an arc, slow return.', 'ثنية خفيفة بالمرفقين، اجمع اليدين بقوس ثم ارجع ببطء.'),
  X('pec_deck', 'جهاز الفراشة', 'Pec deck', 'chest', ['shoulders'], ['machine'], 'isolation', [10, 15], 3, 75, ['cable_fly', 'db_fly'],
    'Squeeze the pads together, control the stretch back.', 'اضغط الوسادتين معاً وتحكّم في الرجوع.'),
  X('db_fly', 'تفتيح صدر بالدمبل', 'Dumbbell fly', 'chest', ['shoulders'], ['dumbbell'], 'isolation', [10, 15], 3, 75, ['cable_fly', 'pec_deck'],
    'Lower in a wide arc to a comfortable stretch, keep elbows slightly bent.', 'أنزل بقوس واسع حتى تمدد مريح مع ثني بسيط للمرفقين.'),
  X('pushup', 'ضغط أرضي', 'Push-up', 'chest', ['triceps', 'shoulders', 'abs'], ['bodyweight'], 'compound', [8, 20], 3, 90, ['db_bench', 'machine_chest_press'],
    'Body in a straight line, chest to just above the floor, press up.', 'الجسم مستقيم، أنزل الصدر قرب الأرض ثم ادفع.', { bodyweight: true }),
  // back
  X('pullup', 'عقلة (سحب للأعلى)', 'Pull-up', 'back', ['biceps', 'forearms'], ['pullup_bar'], 'compound', [5, 10], 3, 120, ['lat_pulldown', 'assisted_pullup'],
    'Hang with straight arms, pull until the chin passes the bar, lower under control. Add weight once you reach the top of the range.', 'تعلّق بذراعين مستقيمتين، اسحب حتى يتجاوز الذقن البار ثم انزل بتحكم. أضف وزناً عند الوصول لأعلى النطاق.', { bodyweight: true }),
  X('assisted_pullup', 'عقلة بالمساعدة', 'Assisted pull-up', 'back', ['biceps'], ['machine'], 'compound', [6, 12], 3, 90, ['pullup', 'lat_pulldown'],
    'Use the least assistance that allows the rep range; reduce it over time.', 'استخدم أقل مساعدة تسمح بنطاق التكرار وقلّلها مع الوقت.'),
  X('lat_pulldown', 'سحب أمامي (لات)', 'Lat pulldown', 'back', ['biceps'], ['cable', 'machine'], 'compound', [8, 12], 3, 90, ['pullup', 'assisted_pullup'],
    'Pull the bar to upper chest, elbows down and back, control the return.', 'اسحب البار لأعلى الصدر والمرفقان للأسفل والخلف، وتحكّم في الرجوع.'),
  X('barbell_row', 'تجديف بالبار', 'Barbell row', 'back', ['biceps', 'hamstrings'], ['barbell'], 'compound', [6, 10], 3, 120, ['db_row', 'seated_cable_row', 'chest_supported_row'],
    'Hinge to about 45°, back neutral, row to lower ribs.', 'انحنِ نحو 45° والظهر محايد، واسحب نحو أسفل الأضلاع.'),
  X('db_row', 'تجديف دمبل بيد واحدة', 'One-arm dumbbell row', 'back', ['biceps'], ['dumbbell'], 'compound', [8, 12], 3, 90, ['barbell_row', 'seated_cable_row'],
    'Support on a bench, row the dumbbell toward the hip.', 'استند على مقعد واسحب الدمبل نحو الورك.'),
  X('seated_cable_row', 'تجديف كيبل جالس', 'Seated cable row', 'back', ['biceps'], ['cable'], 'compound', [8, 12], 3, 90, ['db_row', 'chest_supported_row'],
    'Chest up, pull the handle to the stomach, squeeze shoulder blades.', 'الصدر مرفوع، اسحب المقبض نحو البطن واضغط لوحي الكتف.'),
  X('chest_supported_row', 'تجديف مدعوم بالصدر', 'Chest-supported row', 'back', ['biceps'], ['machine', 'dumbbell'], 'compound', [8, 12], 3, 90, ['seated_cable_row', 'db_row'],
    'Chest on the pad removes lower-back load; row and pause.', 'الصدر على الوسادة يخفف الضغط عن أسفل الظهر؛ اسحب وتوقف لحظة.'),
  X('straight_arm_pulldown', 'سحب بذراع مستقيمة', 'Straight-arm pulldown', 'back', [], ['cable'], 'isolation', [10, 15], 3, 75, ['lat_pulldown'],
    'Arms almost straight, sweep the bar to the thighs.', 'الذراعان شبه مستقيمتين، اسحب البار نحو الفخذين.'),
  // shoulders
  X('ohp', 'ضغط كتف بالبار', 'Overhead press', 'shoulders', ['triceps', 'abs'], ['barbell'], 'compound', [6, 10], 3, 150, ['db_shoulder_press', 'machine_shoulder_press'],
    'Brace, press the bar overhead in a straight line, head through at the top.', 'شد الجذع وادفع البار فوق الرأس بخط مستقيم.'),
  X('db_shoulder_press', 'ضغط كتف بالدمبل', 'Dumbbell shoulder press', 'shoulders', ['triceps'], ['dumbbell'], 'compound', [8, 12], 3, 120, ['ohp', 'machine_shoulder_press'],
    'Seated or standing, press from ear level to overhead.', 'جالساً أو واقفاً، ادفع من مستوى الأذن إلى فوق الرأس.'),
  X('machine_shoulder_press', 'جهاز ضغط الكتف', 'Machine shoulder press', 'shoulders', ['triceps'], ['machine'], 'compound', [8, 12], 3, 90, ['db_shoulder_press'],
    'Handles at shoulder height, press up, slow return.', 'المقابض بمستوى الكتف، ادفع للأعلى وارجع ببطء.'),
  X('lateral_raise', 'رفرفة جانبي', 'Lateral raise', 'shoulders', [], ['dumbbell'], 'isolation', [12, 20], 3, 60, ['cable_lateral_raise'],
    'Raise to shoulder height leading with the elbows, no swinging.', 'ارفع لمستوى الكتف بقيادة المرفقين ودون أرجحة.'),
  X('cable_lateral_raise', 'رفرفة جانبي بالكيبل', 'Cable lateral raise', 'shoulders', [], ['cable'], 'isolation', [12, 20], 3, 60, ['lateral_raise'],
    'Cable from the low pulley across the body, raise to shoulder height.', 'الكيبل من البكرة السفلية عبر الجسم، ارفع لمستوى الكتف.'),
  X('rear_delt_fly', 'رفرفة خلفي', 'Rear delt fly', 'shoulders', ['back'], ['dumbbell', 'machine'], 'isolation', [12, 20], 3, 60, ['face_pull'],
    'Hinged or on the reverse pec deck, move the arms out and back.', 'منحنياً أو على جهاز الفراشة العكسي، حرّك الذراعين للخارج والخلف.'),
  X('face_pull', 'سحب للوجه', 'Face pull', 'shoulders', ['back'], ['cable'], 'isolation', [12, 15], 3, 60, ['rear_delt_fly'],
    'Rope at face height, pull toward the eyes with elbows high.', 'الحبل بمستوى الوجه، اسحب نحو العينين والمرفقان مرتفعان.'),
  // biceps
  X('barbell_curl', 'بايسبس بالبار', 'Barbell curl', 'biceps', ['forearms'], ['barbell', 'ez_bar'], 'isolation', [8, 12], 3, 75, ['db_curl', 'cable_curl'],
    'Elbows at the sides, curl without swinging, lower slowly.', 'المرفقان بجانب الجسم، ارفع دون أرجحة وأنزل ببطء.'),
  X('db_curl', 'بايسبس بالدمبل', 'Dumbbell curl', 'biceps', ['forearms'], ['dumbbell'], 'isolation', [10, 15], 3, 60, ['barbell_curl', 'cable_curl'],
    'Supinate as you curl, full range.', 'لفّ الكف للأعلى أثناء الرفع، بمدى كامل.'),
  X('hammer_curl', 'بايسبس مطرقة', 'Hammer curl', 'biceps', ['forearms'], ['dumbbell'], 'isolation', [10, 15], 3, 60, ['db_curl'],
    'Neutral grip (thumbs up), curl to shoulder level.', 'قبضة محايدة (الإبهام للأعلى)، ارفع لمستوى الكتف.'),
  X('incline_db_curl', 'بايسبس مائل بالدمبل', 'Incline dumbbell curl', 'biceps', [], ['dumbbell'], 'isolation', [10, 15], 3, 60, ['db_curl', 'cable_curl'],
    'Lie back on a 45° bench, arms hanging, curl from the stretch.', 'استلقِ على مقعد 45° والذراعان متدليتان، ارفع من وضع التمدد.'),
  X('cable_curl', 'بايسبس بالكيبل', 'Cable curl', 'biceps', [], ['cable'], 'isolation', [10, 15], 3, 60, ['db_curl'],
    'Constant tension from the low pulley; keep elbows fixed.', 'شد مستمر من البكرة السفلية مع تثبيت المرفقين.'),
  X('preacher_curl', 'بايسبس ارتكاز', 'Preacher curl', 'biceps', [], ['ez_bar', 'machine'], 'isolation', [8, 12], 3, 75, ['incline_db_curl', 'cable_curl'],
    'Arms on the pad, curl up and lower to almost straight.', 'الذراعان على الوسادة، ارفع ثم أنزل حتى الاستقامة تقريباً.'),
  // triceps
  X('dips', 'متوازي (ديبس)', 'Dips', 'triceps', ['chest', 'shoulders'], ['dip_bars'], 'compound', [6, 12], 3, 120, ['close_grip_bench', 'machine_dip', 'pushup'],
    'Lower until upper arms are about parallel, press up; lean slightly forward for more chest. Add weight once you reach the top of the range.', 'انزل حتى يصبح العضد موازياً تقريباً ثم ادفع؛ ميل خفيف للأمام يُشرك الصدر أكثر. أضف وزناً عند الوصول لأعلى النطاق.', { bodyweight: true }),
  X('machine_dip', 'جهاز المتوازي', 'Machine dip', 'triceps', ['chest'], ['machine'], 'compound', [8, 12], 3, 90, ['dips', 'close_grip_bench'],
    'Press the handles down to full extension, control upward.', 'ادفع المقابض للأسفل حتى الامتداد الكامل وتحكّم في الصعود.'),
  X('close_grip_bench', 'ضغط ضيق بالبار', 'Close-grip bench press', 'triceps', ['chest', 'shoulders'], ['barbell'], 'compound', [6, 10], 3, 120, ['dips', 'machine_dip'],
    'Hands shoulder-width, elbows tucked, bar to lower chest.', 'اليدان بعرض الكتفين والمرفقان قريبان من الجسم، أنزل البار لأسفل الصدر.'),
  X('rope_pushdown', 'تراي بالحبل', 'Rope pushdown', 'triceps', [], ['cable'], 'isolation', [10, 15], 3, 60, ['overhead_ext', 'skullcrusher'],
    'Elbows fixed at the sides, push down and spread the rope.', 'ثبّت المرفقين بجانب الجسم، ادفع للأسفل وافتح الحبل.'),
  X('overhead_ext', 'تمديد تراي خلف الرأس', 'Overhead triceps extension', 'triceps', [], ['cable', 'dumbbell'], 'isolation', [10, 15], 3, 60, ['rope_pushdown', 'skullcrusher'],
    'Elbows up, lower behind the head to a deep stretch, extend.', 'المرفقان للأعلى، أنزل خلف الرأس حتى تمدد عميق ثم مدّ الذراعين.'),
  X('skullcrusher', 'تراي مستلقٍ (سكل كراشر)', 'Skull crusher', 'triceps', [], ['ez_bar', 'dumbbell'], 'isolation', [8, 12], 3, 75, ['overhead_ext', 'rope_pushdown'],
    'Lower the bar toward the forehead/behind the head, extend without flaring elbows.', 'أنزل البار نحو الجبهة أو خلف الرأس ثم مدّ دون فتح المرفقين.'),
  // legs
  X('squat', 'سكوات بالبار', 'Back squat', 'quads', ['glutes', 'hamstrings', 'abs'], ['barbell'], 'compound', [5, 8], 3, 180, ['hack_squat', 'leg_press', 'smith_squat'],
    'Brace, sit down between the hips to at least parallel, drive up. Use safety pins.', 'شد الجذع وانزل حتى الموازاة على الأقل ثم ادفع للأعلى. استخدم مساند الأمان.', { lower: true }),
  X('smith_squat', 'سكوات سميث', 'Smith machine squat', 'quads', ['glutes'], ['smith'], 'compound', [6, 10], 3, 150, ['squat', 'hack_squat'],
    'Feet slightly forward, squat to depth with control.', 'القدمان للأمام قليلاً، انزل للعمق بتحكم.', { lower: true }),
  X('hack_squat', 'هاك سكوات', 'Hack squat', 'quads', ['glutes'], ['machine'], 'compound', [8, 12], 3, 120, ['leg_press', 'squat'],
    'Back on the pad, descend deep, push through the whole foot.', 'الظهر على الوسادة، انزل بعمق وادفع بكامل القدم.', { lower: true }),
  X('leg_press', 'ضغط أرجل', 'Leg press', 'quads', ['glutes'], ['machine'], 'compound', [8, 15], 3, 120, ['hack_squat', 'squat'],
    'Lower until knees are near the chest without the lower back rounding, press.', 'أنزل حتى تقترب الركبتان من الصدر دون تقوّس أسفل الظهر ثم ادفع.', { lower: true }),
  X('rdl', 'رفعة رومانية', 'Romanian deadlift', 'hamstrings', ['glutes', 'back'], ['barbell', 'dumbbell'], 'compound', [6, 10], 3, 150, ['leg_curl', 'hip_thrust'],
    'Soft knees, push the hips back with a neutral spine until a hamstring stretch, stand up.', 'ركبتان مرنتان، ادفع الورك للخلف والظهر محايد حتى تمدد الخلفية ثم قف.', { lower: true }),
  X('leg_curl', 'ثني أرجل (خلفية)', 'Leg curl', 'hamstrings', [], ['machine'], 'isolation', [10, 15], 3, 75, ['rdl'],
    'Curl the pad fully, lower slowly.', 'اثنِ الوسادة بالكامل وأنزل ببطء.'),
  X('leg_extension', 'تمديد الأرجل (أمامي)', 'Leg extension', 'quads', [], ['machine'], 'isolation', [10, 15], 3, 75, ['bulgarian_split'],
    'Extend to straight, brief pause, slow return.', 'مدّ حتى الاستقامة مع توقف قصير ثم ارجع ببطء.'),
  X('bulgarian_split', 'سكوات بلغاري', 'Bulgarian split squat', 'quads', ['glutes'], ['dumbbell', 'bodyweight'], 'compound', [8, 12], 3, 90, ['walking_lunge', 'leg_press'],
    'Rear foot on a bench, lower the back knee, drive through the front foot.', 'القدم الخلفية على مقعد، أنزل الركبة الخلفية وادفع بالقدم الأمامية.', { lower: true }),
  X('walking_lunge', 'طعن متحرك', 'Walking lunge', 'quads', ['glutes'], ['dumbbell', 'bodyweight'], 'compound', [10, 14], 3, 90, ['bulgarian_split'],
    'Long steps, back knee toward the floor, stay upright.', 'خطوات طويلة والركبة الخلفية نحو الأرض مع استقامة الجذع.', { lower: true }),
  X('hip_thrust', 'دفع الورك', 'Hip thrust', 'glutes', ['hamstrings'], ['barbell', 'machine'], 'compound', [8, 12], 3, 90, ['rdl'],
    'Upper back on a bench, drive the hips up to full extension, pause.', 'أعلى الظهر على مقعد، ادفع الورك للأعلى حتى الامتداد الكامل مع توقف.', { lower: true }),
  X('calf_raise', 'سمانة واقف', 'Standing calf raise', 'calves', [], ['machine', 'smith'], 'isolation', [10, 20], 3, 60, ['seated_calf'],
    'Full stretch at the bottom, pause at the top.', 'تمدد كامل بالأسفل وتوقف بالأعلى.'),
  X('seated_calf', 'سمانة جالس', 'Seated calf raise', 'calves', [], ['machine'], 'isolation', [12, 20], 3, 60, ['calf_raise'],
    'Knees bent, raise and lower through a full range.', 'الركبتان مثنيتان، ارفع وأنزل بمدى كامل.'),
  // abs
  X('cable_crunch', 'كرنش بالكيبل', 'Cable crunch', 'abs', [], ['cable'], 'isolation', [10, 15], 3, 60, ['crunch_machine', 'hanging_leg_raise'],
    'Kneel, curl the ribs toward the hips; hips stay still.', 'اجثُ على ركبتيك وقرّب الأضلاع نحو الورك دون تحريك الورك.'),
  X('crunch_machine', 'جهاز البطن', 'Ab crunch machine', 'abs', [], ['machine'], 'isolation', [10, 15], 3, 60, ['cable_crunch'],
    'Curl forward against the pads, slow return.', 'انحنِ للأمام ضد الوسائد وارجع ببطء.'),
  X('hanging_leg_raise', 'رفع الأرجل معلقاً', 'Hanging leg raise', 'abs', ['forearms'], ['pullup_bar'], 'isolation', [8, 15], 3, 60, ['cable_crunch'],
    'Hang, curl the pelvis up raising the knees or legs, no swinging.', 'تعلّق وارفع الحوض والركبتين أو الساقين دون أرجحة.', { bodyweight: true }),
  X('ab_wheel', 'عجلة البطن', 'Ab wheel rollout', 'abs', ['shoulders'], ['bodyweight'], 'isolation', [6, 12], 3, 60, ['cable_crunch'],
    'Roll forward keeping the lower back neutral, pull back with the abs.', 'تدحرج للأمام مع حياد أسفل الظهر ثم ارجع بعضلات البطن.', { bodyweight: true })
];

export const exerciseKey = (id: string) => 'exercise:' + id;

export async function customExercises(): Promise<Exercise[]> {
  return (await db.kv.where('key').startsWith('exercise:').toArray()).map((r) => r.value as Exercise).filter((e) => e && e.id);
}

export async function allExercises(): Promise<Exercise[]> {
  return [...EXERCISES, ...(await customExercises())];
}

export function findExercise(id: string, list: Exercise[] = EXERCISES): Exercise | undefined {
  return list.find((e) => e.id === id) ?? EXERCISES.find((e) => e.id === id);
}

export function searchExercises(list: Exercise[], q: string, muscle?: Muscle | ''): Exercise[] {
  const nq = normalizeText(q);
  return list.filter((e) => (!muscle || e.primary === muscle || e.secondary.includes(muscle))
    && (!nq || normalizeText(`${e.nameAr} ${e.nameEn} ${e.primary}`).includes(nq)));
}

/** Alternatives for an exercise, keeping the same primary muscle, filtered to the equipment the user has. */
export function alternativesFor(id: string, list: Exercise[], equipment?: Equipment[]): Exercise[] {
  const ex = findExercise(id, list);
  if (!ex) return [];
  const has = (e: Exercise) => !equipment?.length || e.equipment.some((q) => equipment.includes(q) || q === 'bodyweight');
  const named = ex.alternatives.map((a) => findExercise(a, list)).filter((e): e is Exercise => !!e && has(e));
  const same = list.filter((e) => e.id !== id && e.primary === ex.primary && e.category === ex.category && has(e) && !named.includes(e));
  return [...named, ...same].slice(0, 5);
}

export async function saveCustomExercise(e: Omit<Exercise, 'id' | 'custom' | 'alternatives' | 'howEn' | 'howAr'> & { id?: string; howEn?: string; howAr?: string }): Promise<Exercise> {
  if (!e.nameAr.trim() && !e.nameEn.trim()) throw new Error('name');
  if (!MUSCLES.includes(e.primary)) throw new Error('muscle');
  if (!(e.reps[0] >= 1 && e.reps[1] >= e.reps[0] && e.reps[1] <= 50) || !(e.sets >= 1 && e.sets <= 10)) throw new Error('prescription');
  const rec: Exercise = { ...e, id: e.id ?? 'c_' + uid(), custom: true, alternatives: [], howEn: e.howEn ?? '', howAr: e.howAr ?? '' };
  await kvSet(exerciseKey(rec.id), rec);
  return rec;
}
