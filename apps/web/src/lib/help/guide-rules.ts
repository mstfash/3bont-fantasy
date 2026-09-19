import type {
  Competition,
  CompetitionRules,
  Gameweek,
} from '@fantasy/contracts';
import type { Locale } from '../brand';
/** An explicit historical selection must never silently fall through to current rules. */
export function guideGameweek(
  rounds: readonly Gameweek[],
  requested: string | undefined,
  now: number,
) {
  if (requested !== undefined) {
    const round = rounds.find((item) => item.id === requested);
    if (!round) throw new RangeError('Unknown guide gameweek');
    return round;
  }
  return (
    rounds.find(
      (round) =>
        round.status === 'upcoming' && Date.parse(round.deadline) > now,
    ) ?? rounds.at(-1)
  );
}
export function playingSteps(
  rules: CompetitionRules,
  locale: Locale,
): readonly string[] {
  const ar = locale === 'ar';
  const n = (value: number) => value.toLocaleString(locale);
  return [
    ar
      ? `كوّن فريقاً من ${n(rules.squad.squadSize)} لاعباً بميزانية بداية ${n(rules.squad.startingBudget / 10)}، وبحد أقصى ${n(rules.squad.clubCap)} من النادي الواحد. راعِ حصص المراكز والتشكيلات أدناه.`
      : `Build a squad of ${n(rules.squad.squadSize)} footballers with a starting budget of ${n(rules.squad.startingBudget / 10)} and at most ${n(rules.squad.clubCap)} from one club. Follow the position quotas and formations below.`,
    ar
      ? `اختر ${n(rules.squad.starterCount)} أساسياً ورتّب البدلاء.${rules.squad.captaincyEnabled ? ` اختر كابتناً ونائباً مختلفين؛ مضاعف الكابتن ×${n(rules.gameweek.captainMultiplier)} يشمل النقاط السالبة.` : ' الكابتنية غير مفعّلة في هذه الجولة.'}`
      : `Choose ${n(rules.squad.starterCount)} starters and order your reserves.${rules.squad.captaincyEnabled ? ` Choose distinct captain and vice-captain; the captain’s ×${n(rules.gameweek.captainMultiplier)} multiplier includes negative points.` : ' Captaincy is disabled for this gameweek.'}`,
    ar
      ? `راجع الانتقالات قبل التأكيد: المخصص المعتاد ${n(rules.transfer.allowance)} لكل جولة، وسقف الادخار ${n(rules.transfer.carryCap)}، وتكلفة كل انتقال إضافي ${n(rules.transfer.extraTransferCost / 1000)} نقطة. رصيد فريقك الفعلي هو المرجع.`
      : `Review transfers before confirming: the normal allowance is ${n(rules.transfer.allowance)} per gameweek, the carry cap is ${n(rules.transfer.carryCap)}, and each extra transfer costs ${n(rules.transfer.extraTransferCost / 1000)} points. Check your squad’s actual balance.`,
    ar
      ? 'احفظ قبل الموعد المعروض. يجب أن يقبل الخادم التغيير قبل الإغلاق؛ وقت الضغط على جهازك لا يكفي. لا تنتقل الطلبات المتأخرة تلقائياً لجولة أخرى.'
      : 'Save before the displayed deadline. The server must accept the change before the cutoff; your device’s click time is not enough. Late requests are not silently moved to another round.',
    rules.gameweek.automaticSubstitutions
      ? ar
        ? 'بعد استقرار جميع مباريات الجولة، قد يحل بديل شارك محل أساسي ثبتت له صفر دقائق، بترتيب الدكة مع الحفاظ على تشكيلة مسموحة. الحارس يستبدله حارس فقط.'
        : 'After all gameweek fixtures settle, a reserve who played may replace a starter with confirmed zero minutes, in bench order while preserving a permitted formation. Only a goalkeeper can replace a goalkeeper.'
      : ar
        ? 'التبديلات التلقائية غير مفعّلة في هذه الجولة؛ لا تعتمد على دخول البدلاء تلقائياً.'
        : 'Automatic substitutions are disabled for this gameweek; do not rely on reserves coming on automatically.',
    ar
      ? `تابع تفاصيل النقاط وحالة النتائج. نافذة التصحيح ${n(rules.correctionWindowHours)} ساعة بعد اكتمال البيانات واستقرار المباريات؛ المشكلات المفتوحة تمنع الاعتماد النهائي.`
      : `Follow the points breakdown and result status. The correction window is ${n(rules.correctionWindowHours)} hours after complete data and settled fixtures; unresolved issues prevent finalization.`,
  ];
}
export function competitionFacts(
  competition: Competition,
  rules: CompetitionRules,
  locale: Locale,
) {
  const ar = locale === 'ar';
  return [
    [
      ar
        ? 'حد الفرق للحساب في البطولة'
        : 'Entries per account in this competition',
      competition.entryLimit.toLocaleString(locale),
    ],
    [
      ar
        ? 'الإغلاق الافتراضي قبل أول مباراة'
        : 'Default deadline before first kickoff',
      `${rules.deadlineOffsetMinutes.toLocaleString(locale)} ${ar ? 'دقيقة؛ راجع الموعد المحفوظ للجولة' : 'minutes; check the saved gameweek deadline'}`,
    ],
    [
      ar ? 'التعادل في الترتيب' : 'Ranking ties',
      rules.ranking === 'shared'
        ? ar
          ? 'مراكز مشتركة: ١، ١، ٣'
          : 'Shared ranks: 1, 1, 3'
        : ar
          ? 'خصومات انتقالات أقل، ثم أهداف أكثر؛ التعادل الباقي مشترك'
          : 'Fewer transfer deductions, then more goals; remaining ties share rank',
    ],
    [
      ar ? 'حدود سعر الفانتازي' : 'Fantasy price bounds',
      `${(rules.pricing.minimum / 10).toLocaleString(locale)}–${(rules.pricing.maximum / 10).toLocaleString(locale)}`,
    ],
    [
      ar ? 'سياسة التحديث التلقائي للأسعار' : 'Automatic price policy',
      rules.pricing.automaticUpdates
        ? ar
          ? 'مفعّلة في هذه النسخة؛ التنفيذ يحتاج معايرة واعتماداً وتشغيلاً'
          : 'Enabled in this version; execution requires calibration, approval and processing'
        : ar
          ? 'غير مفعّلة؛ تُراجع دفعات الأسعار قبل نشرها'
          : 'Disabled; price batches are reviewed before publication',
    ],
    [
      ar ? 'معايرة الأداء للأسعار' : 'Performance price calibration',
      ar
        ? `آخر ${rules.pricing.observedGameweeks.toLocaleString(locale)} جولات، بحد أدنى ${rules.pricing.minimumMinutes.toLocaleString(locale)} دقيقة إجمالية. ارتفاع عند متوسط ${(rules.pricing.riseAt / 1000).toLocaleString(locale)} نقطة أو أكثر؛ انخفاض عند ${(rules.pricing.fallAt / 1000).toLocaleString(locale)} أو أقل. خطوة التغيير ${(rules.pricing.step / 10).toLocaleString(locale)} وحدة ضمن الحدود، مع الحفاظ على الأسعار المثبتة.`
        : `Latest ${rules.pricing.observedGameweeks.toLocaleString(locale)} rounds, at least ${rules.pricing.minimumMinutes.toLocaleString(locale)} total minutes. Rise at an average of ${(rules.pricing.riseAt / 1000).toLocaleString(locale)} points or more; fall at ${(rules.pricing.fallAt / 1000).toLocaleString(locale)} or less. A step of ${(rules.pricing.step / 10).toLocaleString(locale)} units stays within bounds and preserves pinned prices.`,
    ],
    [
      ar
        ? 'تجميد نشر الأسعار قبل الموعد'
        : 'Price publication freeze before deadline',
      `${rules.pricing.freezeHours.toLocaleString(locale)} ${ar ? 'ساعة' : 'hours'}`,
    ],
  ] as const;
}
