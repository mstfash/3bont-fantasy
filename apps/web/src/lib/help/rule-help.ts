import type { Locale } from '../brand';
export const ruleHelp = {
  squadSize: [
    'Total footballers owned, including starters and reserves. Position quotas must add up to this number.',
    'إجمالي اللاعبين المملوكين، بما فيهم الأساسيون والبدلاء. يجب أن يساويه مجموع حصص المراكز.',
  ],
  starters: [
    'Footballers selected to start a gameweek. Every permitted formation must have exactly this total.',
    'عدد اللاعبين الأساسيين للجولة. يجب أن يساويه مجموع اللاعبين في كل تشكيلة مسموحة.',
  ],
  budget: [
    'The initial fantasy budget for a new squad. It is separate from real-world monetary valuations.',
    'ميزانية الفانتازي عند إنشاء فريق جديد، وهي مستقلة عن القيم السوقية النقدية الحقيقية.',
  ],
  clubCap: [
    'Maximum footballers from a single real club in one squad, including reserves.',
    'أقصى عدد من لاعبي نادٍ حقيقي واحد في الفريق، بما فيهم البدلاء.',
  ],
  quota: [
    'Required squad members at this position. All position quotas must total the squad size.',
    'عدد لاعبي هذا المركز المطلوب في الفريق. يجب أن يساوي مجموع الحصص حجم الفريق.',
  ],
  formation: [
    'Starting players at this position in this permitted formation. The formation must fit the squad quotas.',
    'عدد الأساسيين في هذا المركز ضمن هذه التشكيلة المسموحة. يجب أن تتوافق التشكيلة مع حصص المراكز.',
  ],
  captaincy: [
    'Choose distinct captain and vice-captain among starters when enabled. If disabled, no captain multiplier applies.',
    'عند التفعيل اختر كابتناً ونائباً مختلفين من الأساسيين. عند التعطيل لا يطبّق مضاعف الكابتن.',
  ],
  allowance: [
    'Free transfers credited for each gameweek, subject to the carry cap. Building a new squad before its first eligible deadline has no transfer deductions.',
    'الانتقالات المجانية المضافة لكل جولة مع مراعاة سقف الادخار. تكوين فريق جديد قبل أول موعد مؤهل له لا يسبب خصم انتقالات.',
  ],
  carryCap: [
    'Maximum saved free-transfer balance. It must cover the normal allowance; excess new allowance is not carried beyond the cap.',
    'أقصى رصيد انتقالات مجانية مدّخرة. يجب أن يغطي المخصص المعتاد؛ لا تُدّخر الزيادة فوق السقف.',
  ],
  transferCost: [
    'Positive point cost for each transfer beyond the available free balance. The total is deducted from the squad’s gameweek score.',
    'تكلفة موجبة بالنقاط لكل انتقال يتجاوز الرصيد المجاني، ويُخصم الإجمالي من نقاط الفريق في الجولة.',
  ],
  captainMultiplier: [
    'Multiplies the captain’s whole-round points, including negatives. The vice replaces a captain only after confirmed zero minutes and if the vice played.',
    'يضاعف نقاط الكابتن طوال الجولة، بما فيها السالبة. يحل النائب محله فقط بعد تأكيد صفر دقائق للكابتن ومشاركة النائب.',
  ],
  tripleMultiplier: [
    'Replaces the normal captain multiplier when Triple Captain is used. It does not multiply the normal multiplier again.',
    'يحل محل مضاعف الكابتن المعتاد عند استخدام تريبل كابتن، ولا يضاعف المضاعف المعتاد مرة أخرى.',
  ],
  deadline: [
    'Default minutes before the first kickoff when setting a gameweek deadline. The saved deadline displayed for that round is authoritative.',
    'عدد الدقائق الافتراضي قبل أول مباراة عند إعداد موعد الجولة. الموعد المحفوظ والمعروض للجولة هو المعتمد.',
  ],
  correction: [
    'Hours after complete, settled data before results can become final. Unresolved issues block finalization; later corrections require review.',
    'ساعات بعد اكتمال البيانات واستقرارها قبل اعتماد النتائج. تمنع المشكلات المفتوحة الاعتماد؛ وتحتاج التصحيحات اللاحقة إلى مراجعة.',
  ],
  autoSubs: [
    'Eligible reserves replace confirmed non-playing starters in bench order, preserving a legal formation. Goalkeepers replace only goalkeepers.',
    'يحل البدلاء المؤهلون محل الأساسيين الذين ثبت عدم مشاركتهم بترتيب الدكة مع الحفاظ على تشكيلة قانونية. الحارس لا يستبدله إلا حارس.',
  ],
  chipEnabled: [
    'Makes this chip selectable subject to its availability windows and the squad’s remaining inventory. Only one chip can be used per gameweek.',
    'يتيح اختيار الخاصية وفق نوافذ إتاحتها ورصيد الفريق المتبقي. يمكن استخدام خاصية واحدة فقط في الجولة.',
  ],
  inventory: [
    'Starting allowance for newly created squads. Changing this does not replenish existing squads; use the reviewed equal-grant workflow for grants.',
    'الرصيد الابتدائي للفرق الجديدة. تغييره لا يزوّد الفرق الحالية برصيد؛ استخدم مسار المنح المتساوية للمنح الجديدة.',
  ],
  chipWindow: [
    'Inclusive gameweek range for this chip. With no windows the enabled chip is available throughout the competition, subject to inventory and eligibility.',
    'نطاق جولات شامل للطرفين لإتاحة الخاصية. دون نوافذ تكون الخاصية المفعّلة متاحة طوال البطولة وفق الرصيد والأهلية.',
  ],
  appearanceThreshold: [
    'Minimum played minutes for the full appearance award. Zero minutes never earns appearance points.',
    'أقل دقائق لعب لاستحقاق مكافأة المشاركة الكاملة. صفر دقيقة لا يمنح نقاط مشاركة.',
  ],
  shortAppearance: [
    'Award for playing positive minutes below the full-appearance threshold, per fixture.',
    'نقاط اللعب لدقائق موجبة أقل من حد المشاركة الكاملة، لكل مباراة.',
  ],
  fullAppearance: [
    'Award for meeting the full-appearance minutes threshold, instead of adding the short-appearance award.',
    'نقاط بلوغ حد دقائق المشاركة الكاملة، دون إضافة مكافأة المشاركة القصيرة إليها.',
  ],
  cleanThreshold: [
    'Minimum played minutes needed for clean-sheet points. Conceding while on the pitch or being sent off removes the award.',
    'الحد الأدنى لدقائق اللعب لنقاط الشباك النظيفة. استقبال هدف أثناء اللعب أو الطرد يلغي المكافأة.',
  ],
  concededGroup: [
    'Number of conceded goals per complete scoring group. Count goals while on the pitch and after dismissal, not after a normal substitution.',
    'عدد الأهداف المستقبلة في كل مجموعة مكتملة للاحتساب. تُحسب الأهداف أثناء اللعب وبعد الطرد، وليس بعد التبديل العادي.',
  ],
  savesGroup: [
    'Each complete group of goalkeeper saves earns the configured save award, per fixture. A saved penalty also counts as a save.',
    'كل مجموعة مكتملة من تصديات الحارس تمنح نقاط التصدي المحددة لكل مباراة. التصدي لركلة جزاء يُحتسب أيضاً ضمن التصديات.',
  ],
  savesAward: [
    'Points for each complete group of goalkeeper saves; penalty-save points are added separately.',
    'نقاط كل مجموعة مكتملة من تصديات الحارس؛ تُضاف نقاط التصدي لركلة الجزاء بشكل مستقل.',
  ],
  goal: [
    'Points for each goal scored by a footballer registered at this position. Own goals use their separate adjustment.',
    'نقاط كل هدف للاعب مسجل في هذا المركز. تُطبق على الأهداف العكسية قيمة مستقلة.',
  ],
  cleanAward: [
    'Clean-sheet points for this position when minutes and participation conditions are met. A zero award disables this category for the position.',
    'نقاط الشباك النظيفة لهذا المركز عند تحقق شروط الدقائق والمشاركة. القيمة صفر تعني عدم منح نقاط لهذه الفئة والمركز.',
  ],
  concededAward: [
    'Adjustment for every complete conceded-goal group at this position. Enter a negative value to deduct points.',
    'تعديل النقاط لكل مجموعة مكتملة من الأهداف المستقبلة لهذا المركز. أدخل قيمة سالبة للخصم.',
  ],
  assist: [
    'Points for each confirmed assist, per fixture.',
    'نقاط كل تمريرة حاسمة مؤكدة، لكل مباراة.',
  ],
  yellow: [
    'Adjustment for a yellow card. Enter a negative value for a deduction.',
    'تعديل نقاط الإنذار. أدخل قيمة سالبة للخصم.',
  ],
  straightRed: [
    'Adjustment for a direct red card. A separate earlier yellow also applies. Sending off removes clean-sheet eligibility.',
    'تعديل نقاط الطرد المباشر. يُحتسب الإنذار السابق المنفصل أيضاً. الطرد يلغي أهلية الشباك النظيفة.',
  ],
  secondYellowDismissal: [
    'Total discipline adjustment for dismissal by a second yellow, replacing the yellow-card deductions.',
    'إجمالي تعديل النقاط عند الطرد بالإنذار الثاني، بدلاً من جمع خصومات الإنذارات.',
  ],
  penaltySave: [
    'Additional points for a saved penalty. The save also counts toward the goalkeeper’s save total; shootouts are excluded.',
    'نقاط إضافية للتصدي لركلة جزاء. يُضاف التصدي أيضاً لإجمالي تصديات الحارس، وتُستبعد ركلات الترجيح.',
  ],
  penaltyMiss: [
    'Adjustment when the taker fails to score a penalty, excluding shootouts.',
    'تعديل نقاط اللاعب عند إهدار ركلة جزاء، مع استبعاد ركلات الترجيح.',
  ],
  ownGoal: [
    'Adjustment for an own goal, which may also affect clean sheets and conceded-goal totals.',
    'تعديل نقاط الهدف العكسي، وقد يؤثر أيضاً على الشباك النظيفة وإجمالي الأهداف المستقبلة.',
  ],
  priceMin: [
    'Lowest allowed fantasy price under the policy. Validate squad affordability and the player pool before publishing prices.',
    'أقل سعر فانتازي تسمح به السياسة. تحقّق من إمكانية تكوين فريق وتوافر اللاعبين قبل نشر الأسعار.',
  ],
  priceMax: [
    'Highest allowed fantasy price under the policy. Fantasy units are independent of real-world valuation currency.',
    'أعلى سعر فانتازي تسمح به السياسة. وحدات الفانتازي مستقلة عن عملة القيمة السوقية الحقيقية.',
  ],
  priceFreeze: [
    'Hours before a deadline during which price publication is blocked by the policy.',
    'الساعات السابقة لموعد الإغلاق التي تمنع فيها السياسة نشر تغييرات الأسعار.',
  ],
} as const;
export type RuleHelpKey = keyof typeof ruleHelp;
export function ruleHelpText(key: RuleHelpKey, locale: Locale) {
  return ruleHelp[key][locale === 'ar' ? 1 : 0];
}
