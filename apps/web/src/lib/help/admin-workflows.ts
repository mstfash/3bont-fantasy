import type { Capability } from '@fantasy/application';
import type { HelpTopic } from './topics';
export const adminWorkflows = [
  {
    topic: 'results',
    capability: 'results.replay',
    path: '/admin',
    en: [
      'From a competition gameweek, open its result review, then Correct historical gameweek rules. Owner access and fresh staff verification are required.',
      'Change only the selected gameweek’s footballer scoring, captain multipliers or automatic substitutions. Preview the exact rule differences and effects on squads, rankings, H2H and prizes.',
      'Confirm with evidence only when inputs are complete. A changed preview must be reviewed again. Publication is atomic and restarts the original correction window.',
      'Recorded selections, transfer costs, consumed chips, price transactions and future rules remain intact. Prior calculations remain in Calculation history; selected-gameweek playbooks show the revised rules.',
    ],
    ar: [
      'افتح مراجعة نتائج الجولة من البطولة ثم تصحيح قواعد جولة سابقة. يلزم حساب المالك وتحقق حديث للجلسة.',
      'عدّل نقاط اللاعبين أو مضاعفات الكابتن أو التبديلات التلقائية للجولة المختارة فقط. راجع اختلاف القواعد وأثره على الفرق والترتيب والمواجهات والجوائز.',
      'اعتمد بالدليل بعد اكتمال المدخلات. تغيّر المعاينة يتطلب مراجعة جديدة. ينشر التصحيح دفعة واحدة ويعيد بدء نافذة التصحيح الأصلية.',
      'تبقى الاختيارات المسجلة وخصومات الانتقالات والشيبس المستهلكة والأسعار والقواعد المستقبلية كما هي. تبقى الحسابات السابقة في سجل النسخ؛ يعرض دليل الجولة المختارة قواعدها المصححة.',
    ],
  },
  {
    topic: 'configuration',
    capability: 'competition.manage',
    path: '/admin/competitions',
    en: [
      'Create a draft competition and choose its real season.',
      'Set registration, entry limits, squad structure, scoring and chips. Add an affordable eligible player pool and assign fixtures with deadlines.',
      'Review readiness and publish. For later changes, inspect the impact preview and effective gameweeks before confirming.',
      'Open the player playbook for each affected round to verify the announced rules.',
    ],
    ar: [
      'أنشئ بطولة مسودة واختر موسمها الحقيقي.',
      'حدّد التسجيل وحدود الفرق والتكوين والنقاط والخصائص. أضف قائمة لاعبين مؤهلين تسمح بميزانية قانونية وعيّن المباريات ومواعيد الإغلاق.',
      'راجع جاهزية البطولة وانشرها. للتغييرات اللاحقة راجع معاينة الأثر والجولات الفعلية قبل التأكيد.',
      'افتح دليل اللاعب لكل جولة متأثرة للتحقق من القواعد المعلنة.',
    ],
  },
  {
    topic: 'prices',
    capability: 'competition.manage',
    path: '/admin/competitions',
    en: [
      'Open a competition’s price tools. Review starting-price suggestions and preserved pins before publication.',
      'Run a calibration experiment using finalized rounds. Compare affordability and price drift, then record the selected policy.',
      'Preview each price batch and its source versions. A freeze window, changed evidence or an invalid player pool must be resolved before publication.',
    ],
    ar: [
      'افتح أدوات الأسعار داخل البطولة. راجع اقتراحات أسعار البداية والأسعار المثبتة قبل النشر.',
      'شغّل تجربة معايرة بجولات معتمدة وقارن إمكانية تكوين الفريق وتغير الأسعار ثم سجّل السياسة المختارة.',
      'عاين كل دفعة أسعار ونسخ مصادرها. عالج نافذة التجميد أو تغير الأدلة أو مشكلات قائمة اللاعبين قبل النشر.',
    ],
  },
  {
    topic: 'achievements',
    capability: 'competition.manage',
    path: '/admin/competitions',
    en: [
      'Open the competition’s achievements and define the published criteria.',
      'Review versions and earned history. Badges are cosmetic and never modify fantasy points.',
      'After corrections, verify award reconciliation instead of deleting the historical attribution.',
    ],
    ar: [
      'افتح إنجازات البطولة وحدّد الشروط المنشورة.',
      'راجع النسخ وسجل الاستحقاق. الشارات شكلية ولا تعدّل نقاط الفانتازي.',
      'بعد التصحيحات راجع تسوية الاستحقاق بدلاً من حذف تاريخ الإنجاز.',
    ],
  },
  {
    topic: 'catalogue',
    capability: 'facts.manage',
    path: '/admin/catalogue',
    en: [
      'Create or review the real season, clubs and footballers using source evidence.',
      'Keep valuations licensed, dated and separate from fantasy prices.',
      'Preview bulk import differences, fix invalid rows, then apply the reviewed batch.',
    ],
    ar: [
      'أنشئ أو راجع الموسم الحقيقي والأندية واللاعبين مع أدلة المصادر.',
      'احتفظ بترخيص القيم السوقية وتواريخها وافصلها عن أسعار الفانتازي.',
      'عاين فروق الاستيراد الجماعي وأصلح الصفوف غير الصالحة ثم طبّق الدفعة المراجَعة.',
    ],
  },
  {
    topic: 'providers',
    capability: 'facts.manage',
    path: '/admin/providers',
    en: [
      'Validate coverage and rights, then bind the season and map identifiers.',
      'Reconcile quota evidence before enabling the provider account. Review collection cadence, cost and season activation separately.',
      'Inspect captured source bundles. Stage a reviewed match draft; incomplete participation or defensive inputs stay unknown.',
      'Worker automation needs its own deployment activation. Do not interpret saved schedule settings as proof of live collection.',
    ],
    ar: [
      'تحقق من التغطية والحقوق ثم اربط الموسم والمعرّفات.',
      'سوِّ أدلة الحصة قبل تفعيل حساب المزود. راجع وتيرة الجمع والتكلفة وتفعيل الموسم بشكل مستقل.',
      'افحص حزم المصادر المحفوظة وجهّز مسودة مباراة للمراجعة؛ تبقى بيانات المشاركة أو الدفاع الناقصة مجهولة.',
      'تحتاج أتمتة العامل إلى تفعيل تشغيلي مستقل. حفظ الجدول لا يثبت أن الجمع الحي يعمل.',
    ],
  },
  {
    topic: 'matches',
    capability: 'facts.manage',
    path: '/admin/matches',
    en: [
      'Select a fixture and review eligibility, minutes and all scoring facts.',
      'Preview the report or correction with a reason and source evidence. Inspect the shared-match impact across every linked competition before confirming. Restricted competitions remain part of the check; changed dependencies require a fresh preview. Explicit overrides persist until removed.',
      'Inspect overall, classic-league and H2H projections and pending issues. Private league details follow group read access. Reopen finalized rounds only through the reviewed result workflow.',
      'Check standings, affected prizes and delivered-award correction cases after publication.',
    ],
    ar: [
      'اختر مباراة وراجع الأهلية والدقائق وجميع حقائق احتساب النقاط.',
      'عاين التقرير أو التصحيح مع السبب والدليل. راجع أثر المباراة على كل البطولات المرتبطة قبل التأكيد؛ تشمل المراجعة البطولات المحجوبة حسب الصلاحيات. تغيّر البيانات يتطلب معاينة جديدة. تبقى التجاوزات الصريحة حتى إزالتها.',
      'افحص معاينات الترتيب العام والدوريات الكلاسيكية والمواجهات والمشكلات المعلّقة. تخضع تفاصيل الدوريات الخاصة لصلاحية القراءة. أعد فتح الجولات المعتمدة فقط عبر مسار النتائج المراجَع.',
      'راجع الترتيب والجوائز المتأثرة وحالات تصحيح الجوائز المسلّمة بعد النشر.',
    ],
  },
  {
    topic: 'prizes',
    capability: 'prizes.prepare',
    path: '/admin/prizes',
    en: [
      'Publish the pool’s terms, eligibility, period and tie handling before collecting award candidates.',
      'Prepare candidates from the required final results and review exclusions.',
      'Open Result correction projections on the prize page to compare published-score and proposed allocations using current eligibility. Recorded decisions remain separate; held projections cannot authorize delivery.',
      'A different authorized approver must approve. Record external delivery with its receipt.',
      'A later correction creates a review case; never overwrite the original delivery record.',
    ],
    ar: [
      'انشر شروط الجائزة والأهلية والفترة ومعالجة التعادل قبل تجهيز المرشحين.',
      'جهّز المرشحين من النتائج النهائية المطلوبة وراجع الاستبعادات.',
      'افتح معاينات تصحيح النتائج من صفحة الجائزة لمقارنة التوزيع بالنقاط المنشورة والمقترحة وفق الأهلية الحالية. تبقى القرارات المسجلة منفصلة؛ المعاينة المعلّقة لا تجيز التسليم.',
      'يجب أن يوافق مسؤول آخر مخوّل. سجّل التسليم الخارجي بإيصاله.',
      'ينشئ التصحيح اللاحق حالة مراجعة؛ لا تستبدل سجل التسليم الأصلي.',
    ],
  },
  {
    topic: 'prizes',
    capability: 'prizes.approve',
    path: '/admin/prizes',
    en: [
      'Review prepared candidates, terms, eligibility and result revisions.',
      'Inspect correction projections directly from the prize page. Compare recorded awards separately; a hypothetical allocation never changes a delivered award or moves money.',
      'Approve only with current authority and independence from the preparation and recipient conflicts.',
      'If evidence changed, request a fresh proposal rather than approving stale results.',
    ],
    ar: [
      'راجع المرشحين المجهّزين والشروط والأهلية ونسخ النتائج.',
      'افحص معاينات التصحيح مباشرة من صفحة الجائزة وقارن الجوائز المسجلة بشكل منفصل. لا يغيّر التوزيع الافتراضي جائزة مسلّمة ولا ينقل أموالاً.',
      'وافق بصلاحية حالية ومع استقلالك عن الإعداد وتعارض المصالح مع المستفيد.',
      'إذا تغيّرت الأدلة فاطلب مقترحاً جديداً بدلاً من اعتماد نتائج قديمة.',
    ],
  },
  {
    topic: 'staff',
    capability: 'staff.manage',
    path: '/admin/staff',
    en: [
      'Grant the minimum required role and competition scope.',
      'Ask the operator to complete current-session authenticator verification.',
      'Review the audit trail and revoke obsolete access. Preserve at least one owner.',
    ],
    ar: [
      'امنح أقل دور ونطاق بطولة مطلوبين.',
      'اطلب من المسؤول إتمام التحقق بالمصادقة للجلسة الحالية.',
      'راجع سجل العمليات واسحب الصلاحيات القديمة مع إبقاء مالك واحد على الأقل.',
    ],
  },
  {
    topic: 'operations',
    capability: 'operations.read',
    path: '/admin/support',
    en: [
      'Review participant or competition issues using scoped support access.',
      'Escalate worker failures to a global operator who can inspect worker health and issue references.',
      'Resolve the underlying problem before retrying; check the resulting records and audit trail.',
    ],
    ar: [
      'راجع مشكلات المشاركين أو البطولات عبر صلاحية المتابعة المحددة.',
      'صعّد أعطال المهام لمسؤول عام يستطيع فحص حالة التشغيل ومراجع المشكلات.',
      'عالج السبب قبل إعادة المحاولة ثم افحص السجلات الناتجة وسجل العمليات.',
    ],
  },
  {
    topic: 'chat',
    capability: 'moderation.manage',
    path: '/admin/moderation',
    en: [
      'Review reported messages and their room context.',
      'Use the appropriate hide, mute or account action within your role; record reasons.',
      'Keep moderation evidence private and follow retention procedures.',
    ],
    ar: [
      'راجع الرسائل المُبلغ عنها وسياق الغرفة.',
      'استخدم الإخفاء أو الكتم أو إجراء الحساب المناسب ضمن دورك وسجّل الأسباب.',
      'احفظ سرية أدلة الإشراف والتزم بإجراءات الاحتفاظ.',
    ],
  },
  {
    topic: 'sponsors',
    capability: 'sponsors.manage',
    path: '/admin/sponsors',
    en: [
      'Upload permitted artwork and review the protected preview.',
      'Set language content, placement, dates and competition scope.',
      'Approve for publication, check both themes on mobile and desktop, and pause the campaign when required.',
    ],
    ar: [
      'ارفع صوراً مسموحاً بها وراجع المعاينة المحمية.',
      'حدّد محتوى اللغتين والمكان والتواريخ ونطاق البطولة.',
      'اعتمد النشر واختبر المظهرين على الهاتف والحاسوب وأوقف الحملة عند الحاجة.',
    ],
  },
] as const satisfies readonly {
  readonly topic: HelpTopic;
  readonly capability: Capability;
  readonly path: string;
  readonly en: readonly string[];
  readonly ar: readonly string[];
}[];
