import type { Locale } from '../brand';

export const helpTopics = {
  play: [
    'Playing fantasy',
    'Choose a competition, read its gameweek rules, build a legal squad and save before the displayed deadline. Each competition can use different settings.',
    'اللعب في الفانتازي',
    'اختر بطولة، واقرأ قواعد الجولة، وكوّن فريقاً قانونياً واحفظه قبل الموعد المعروض. قد تختلف إعدادات كل بطولة.',
  ],
  squad: [
    'Squad and lineup',
    'Your squad is your entry in this competition. Arrange starters, bench order and captaincy using this round’s rules. Review transfers and chip effects before confirming; unsaved edits do not count.',
    'الفريق والتشكيلة',
    'فريقك هو مشاركتك في هذه البطولة. رتّب الأساسيين والبدلاء والكابتن وفق قواعد الجولة. راجع الانتقالات والخصائص قبل التأكيد؛ التعديلات غير المحفوظة لا تُحتسب.',
  ],
  market: [
    'Prices and valuations',
    'Fantasy prices use your game budget. Real-world valuations are separate sourced information and do not automatically reprice your squad. Review the current sale quote before confirming a transfer.',
    'الأسعار والقيم السوقية',
    'أسعار الفانتازي تخص ميزانية اللعبة. القيم السوقية الحقيقية معلومات مستقلة بمصادرها ولا تغيّر سعر فريقك تلقائياً. راجع سعر البيع الحالي قبل تأكيد الانتقال.',
  ],
  groups: [
    'Leagues and invitations',
    'Groups compare entries from the same competition. Private groups need a valid invitation and may require organizer approval. The group’s entry cap and membership rules apply.',
    'الدوريات والدعوات',
    'تقارن المجموعات فرقاً من البطولة نفسها. تتطلب المجموعات الخاصة دعوة سارية وقد تحتاج موافقة المنظّم. تُطبّق حدود المشاركات وشروط العضوية الخاصة بالمجموعة.',
  ],
  h2h: [
    'Head-to-head',
    'Register an eligible squad before the edition closes. Published matchups use gameweek net points. Read the edition’s schedule and forfeits; joining a classic group does not register you automatically.',
    'المواجهات المباشرة',
    'سجّل فريقاً مؤهلاً قبل إغلاق النسخة. تستخدم المواجهات المنشورة صافي نقاط الجولة. راجع الجدول والانسحابات؛ الانضمام لمجموعة عادية لا يسجّلك تلقائياً.',
  ],
  chat: [
    'Community and moderation',
    'Rooms require current membership. Report harmful messages; blocking hides another member for you. Moderation actions have separate scope and retained evidence.',
    'المجتمع والإشراف',
    'تتطلب الغرف عضوية سارية. أبلغ عن الرسائل المسيئة؛ الحظر يخفي العضو عنك. إجراءات الإشراف لها صلاحيات محددة وأدلة محفوظة.',
  ],
  prizes: [
    'Prizes and eligibility',
    'Read the published pool’s eligibility, period and tie policy. Final points alone do not guarantee an award. Preparation, independent approval and recorded delivery are separate steps; corrections can reopen review.',
    'الجوائز والأهلية',
    'اقرأ شروط الأهلية والفترة وسياسة التعادل المنشورة للجائزة. النقاط النهائية وحدها لا تضمن الفوز. الإعداد والموافقة المستقلة وتسجيل التسليم خطوات منفصلة، وقد تُعاد المراجعة عند التصحيح.',
  ],
  achievements: [
    'Achievements',
    'Badges recognize the published achievement criteria. They do not add fantasy points. Corrected results may update the award while preserving its history.',
    'الإنجازات',
    'تعبّر الشارات عن استيفاء شروط الإنجاز المنشورة، ولا تضيف نقاط فانتازي. قد تغيّر النتائج المصححة الاستحقاق مع حفظ تاريخه.',
  ],
  profile: [
    'Profile and data',
    'Keep your display name current. Personal exports belong only to you and expire. Closing an account has a separate review, including active squads and group ownership.',
    'الملف والبيانات',
    'حدّث اسم العرض. ملفات تصدير بياناتك خاصة بك وتنتهي صلاحيتها. إغلاق الحساب له مراجعة مستقلة تشمل الفرق النشطة وملكية المجموعات.',
  ],
  security: [
    'Account security',
    'Verify your email to sign in. Staff administration also requires a recent authenticator check for the current session. Keep recovery codes private; signing in again may require verification again.',
    'أمان الحساب',
    'فعّل بريدك الإلكتروني للدخول. تتطلب الإدارة أيضاً تحققاً حديثاً بتطبيق المصادقة للجلسة الحالية. احتفظ برموز الاسترداد بسرية؛ قد يلزم تحقق جديد بعد تسجيل الدخول.',
  ],
  administration: [
    'Operating the competition',
    'Start with the admin handbook. Your current role controls available actions. Review each proposed change and its effective gameweeks before confirming; saving a draft is not publishing it.',
    'تشغيل البطولة',
    'ابدأ بدليل الإدارة. يحدد دورك الحالي الإجراءات المتاحة. راجع كل تغيير والجولات التي يسري عليها قبل التأكيد؛ حفظ المسودة لا يعني نشرها.',
  ],
  configuration: [
    'Competition configuration',
    'Structural settings freeze after the first deadline. Other changes have their own notice and scheduling rules. The impact preview identifies affected gameweeks; public guides read the saved version for each round.',
    'إعداد البطولة',
    'تثبت إعدادات تكوين الفريق بعد أول موعد إغلاق. للتغييرات الأخرى قواعد إعلان وجدولة خاصة بها. توضح معاينة الأثر الجولات المتأثرة، وتعرض الأدلة العامة النسخة المحفوظة لكل جولة.',
  ],
  catalogue: [
    'Football catalogue',
    'Maintain real seasons, clubs, footballers and licensed valuations. Review identifiers, sources and import differences before applying a batch. Catalogue changes do not silently assign fantasy rounds or reprice squads.',
    'دليل كرة القدم',
    'أدر المواسم والأندية واللاعبين الحقيقيين والقيم السوقية المرخّصة. راجع المعرّفات والمصادر وفروق الاستيراد قبل التنفيذ. لا تعيّن تغييرات الدليل جولات الفانتازي أو أسعار الفرق تلقائياً.',
  ],
  providers: [
    'Provider collection',
    'Coverage, rights, identity mappings, quota reconciliation and explicit activation are required. An owner-approved season policy can accept complete finished-match reports. Missing or ambiguous data stays held for review; collection alone does not publish match facts.',
    'جمع بيانات المزود',
    'يلزم التحقق من التغطية والحقوق وربط المعرّفات وتسوية الحصة والتفعيل الصريح. تسمح سياسة موسم يوافق عليها المالك بقبول التقارير المكتملة للمباريات المنتهية. تبقى البيانات الناقصة أو الملتبسة للمراجعة؛ الجمع وحده لا ينشر حقائق المباراة.',
  ],
  matches: [
    'Match reports and corrections',
    'Review eligibility, minutes and every required statistic before marking data complete. Persistent overrides survive provider sync. Final results require a separate audited reopening before a correction can change standings.',
    'تقارير المباريات والتصحيحات',
    'راجع الأهلية والدقائق وكل الإحصاءات المطلوبة قبل اعتبار البيانات مكتملة. تبقى التجاوزات اليدوية بعد المزامنة. تتطلب النتائج النهائية إعادة فتح مسجلة قبل أن يغيّر التصحيح الترتيب.',
  ],
  results: [
    'Points and finality',
    'Points can change while results are provisional or under review. Captaincy, legal substitutions and transfer deductions use the locked gameweek rules. Check the breakdown and finality state before interpreting ranks.',
    'النقاط واعتماد النتائج',
    'قد تتغير النقاط ما دامت النتائج مؤقتة أو قيد المراجعة. تستخدم الكابتنية والبدائل القانونية وخصومات الانتقالات قواعد الجولة المغلقة. راجع التفاصيل وحالة الاعتماد قبل قراءة الترتيب.',
  ],
  prices: [
    'Price review',
    'Review source rounds, bounds, pinned prices and affordability before publishing a price batch. An enabled policy still needs validated calibration and operational processing; market valuations remain separate.',
    'مراجعة الأسعار',
    'راجع الجولات المصدر وحدود الأسعار والأسعار المثبتة وإمكانية تكوين فريق قبل نشر الدفعة. تحتاج السياسة المفعّلة إلى معايرة معتمدة وتنفيذ تشغيلي؛ وتبقى القيم السوقية مستقلة.',
  ],
  staff: [
    'Staff access and audit',
    'Grant only the needed role and competition scope. Staff actions require current authority and recent session verification. Revoked access takes effect on writes; the last owner cannot be removed.',
    'صلاحيات التشغيل والسجل',
    'امنح الدور ونطاق البطولة المطلوبين فقط. تتطلب إجراءات الإدارة صلاحية حالية وتحققاً حديثاً للجلسة. يسري سحب الصلاحية على الكتابة، ولا يمكن إزالة آخر مالك.',
  ],
  support: [
    'Participant support',
    'Find the relevant account or competition within your assigned scope. Support views omit private future lineups and identity secrets. Use the reviewed moderation workflow for account restrictions and record the reason.',
    'متابعة المشاركين',
    'ابحث عن الحساب أو البطولة ضمن نطاقك. لا تكشف المتابعة التشكيلات المستقبلية الخاصة أو أسرار الهوية. استخدم مسار الإشراف المراجَع لقيود الحساب وسجّل السبب.',
  ],
  accounts: [
    'Account review',
    'Review the account and supporting evidence before suspending or restoring access. Suspension revokes sessions and blocks new sign-ins; it does not erase competitive history or automatically resolve prize eligibility.',
    'مراجعة الحسابات',
    'راجع الحساب والأدلة قبل تعليق الوصول أو استعادته. يُلغي التعليق الجلسات ويمنع الدخول الجديد، لكنه لا يمحو تاريخ المنافسة أو يحسم أهلية الجوائز تلقائياً.',
  ],
  operations: [
    'Worker health',
    'Inspect recent task status, issue references and stale runs. A healthy web page does not prove deadline or scoring jobs are running. Resolve the cause before retrying work; automatic collection has a separate activation switch.',
    'حالة التشغيل',
    'راجع حالة المهام ومراجع المشكلات والمهام المتأخرة. عمل الصفحة لا يثبت تشغيل مهام الإغلاق أو احتساب النقاط. عالج السبب قبل إعادة المحاولة؛ وللجمع التلقائي مفتاح تفعيل مستقل.',
  ],
  sponsors: [
    'Sponsor publication',
    'Upload permitted artwork, preview both languages and confirm placement and dates before approval. Draft or paused campaigns are not public. Aggregate reporting does not expose individual participant activity.',
    'نشر الرعاية',
    'ارفع صوراً مسموحاً باستخدامها، وعاين اللغتين وحدّد المكان والتواريخ قبل الموافقة. الحملات المسودة أو المتوقفة لا تُعرض للعامة. التقارير المجمّعة لا تكشف نشاط الأفراد.',
  ],
  review: [
    'Review and confirm',
    'Review the proposed values and consequences before confirming. Editing invalidates a previous review. If a request has an uncertain outcome, retry the same request so the server can return its existing receipt.',
    'المراجعة والتأكيد',
    'راجع القيم المقترحة وآثارها قبل التأكيد. يلغي التعديل المعاينة السابقة. إذا كانت نتيجة الطلب غير مؤكدة، أعد الطلب نفسه ليستطيع الخادم إرجاع إيصال تنفيذه إن كان محفوظاً.',
  ],
} as const;
export type HelpTopic = keyof typeof helpTopics;
export function helpCopy(topic: HelpTopic, locale: Locale) {
  const copy = helpTopics[topic];
  return {
    title: copy[locale === 'ar' ? 2 : 0],
    text: copy[locale === 'ar' ? 3 : 1],
  };
}
export function pageHelpTopic(path: string): HelpTopic {
  if (path.includes('/admin/providers')) return 'providers';
  if (path.includes('/admin/catalogue')) return 'catalogue';
  if (path.includes('/prices')) return 'prices';
  if (path.includes('/admin/matches')) return 'matches';
  if (path.includes('/admin/competitions')) return 'configuration';
  if (/\/(staff|audit)(\/|$)/u.test(path)) return 'staff';
  if (path.includes('/admin/accounts')) return 'accounts';
  if (path.includes('/admin/support')) return 'support';
  if (path.includes('/admin/operations')) return 'operations';
  if (path.includes('/sponsors')) return 'sponsors';
  if (path.includes('/prizes')) return 'prizes';
  if (/\/(chat|moderation)(\/|$)/u.test(path)) return 'chat';
  if (path.includes('/head-to-head')) return 'h2h';
  if (path.includes('/achievements')) return 'achievements';
  if (path.includes('/groups')) return 'groups';
  if (path.includes('/admin')) return 'administration';
  if (path.includes('/entries')) return 'squad';
  if (path.includes('/profile')) return 'profile';
  if (
    /\/(security|login|register|forgot-password|reset-password|resend-verification)(\/|$)/u.test(
      path,
    )
  )
    return 'security';
  if (path.includes('/standings')) return 'results';
  return 'play';
}
