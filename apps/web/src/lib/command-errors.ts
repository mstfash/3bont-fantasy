import type { Locale } from './brand';
const messages: Readonly<Record<string, { ar: string; en: string }>> = {
  'provider-collection-expired': {
    ar: 'تباعدت المصادر زمنياً. ستُجمع دفعة جديدة وفق الجدول؛ راجع الحصة والتأخير.',
    en: 'The source bundle expired. A new batch follows the schedule; check quota and delays.',
  },
  'provider-collection-retries-exhausted': {
    ar: 'تعذّر المورد بعد ثلاث محاولات. راجع ردود المزود قبل الدورة التالية.',
    en: 'The resource failed after three attempts. Review provider responses before the next cycle.',
  },
  'provider-collection-response-unavailable': {
    ar: 'الرد غير صالح أو لم يتأكد. تنتظر الدفعة إعادة محاولة محسوبة.',
    en: 'The response is invalid or unconfirmed. The batch is waiting for a budgeted retry.',
  },
  'provider-collection-mapping-changed': {
    ar: 'تغير ربط المباراة أو أُوقف. راجع هويات المصدر قبل دورة جديدة.',
    en: 'The fixture mapping changed or was retired. Review provider identities before a new collection.',
  },
  'provider-collection-fixture-changed': {
    ar: 'تغير الموعد أو نطاق المباراة. لن تُرسل طلبات من الخطة القديمة.',
    en: 'The fixture timing or scope changed. The old plan cannot dispatch new requests.',
  },
  'provider-collection-settings-changed': {
    ar: 'تغيرت إعدادات الجمع. راجع الجدول الحالي.',
    en: 'Collection settings changed. Review the current schedule.',
  },
  'provider-synthetic-live-traffic-blocked': {
    ar: 'موسم اختباري: حُجبت الطلبات إلى المزود الحقيقي.',
    en: 'Synthetic season: traffic to the live provider was blocked.',
  },
  'provider-collection-attempt-pending': {
    ar: 'المحاولة السابقة لم تنتهِ بعد. لا يُرسل طلب مكرر الآن.',
    en: 'The earlier attempt is still pending. No duplicate request is sent yet.',
  },
  'schedule-changed': {
    ar: 'أُلغيت الدفعة عند تغيير جدول الجمع أو إيقافه.',
    en: 'The batch was cancelled when the schedule changed or paused.',
  },
  'provider-schedule-changed': {
    ar: 'تغير جدول الجمع. حدّث الصفحة وراجع الإعدادات الجديدة.',
    en: 'The collection schedule changed. Refresh and review the current settings.',
  },
  'normalization-binding-missing': {
    ar: 'اربط الموسم بالمزود أولاً.',
    en: 'Bind this season to the provider first.',
  },
  'normalization-mapping-missing': {
    ar: 'أكمل ربط معرّفات الأندية واللاعبين والمباراة.',
    en: 'Complete the active club, footballer and fixture identity mappings.',
  },
  'normalization-source-invalid': {
    ar: 'الرد غير مكتمل أو يحتوي حقولًا غير مدعومة. راجع المصادر.',
    en: 'A response is incomplete or has unsupported fields. Review the sources.',
  },
  'normalization-source-scope': {
    ar: 'الردود لا تخص المباراة أو الأندية أو الموسم المحدد.',
    en: 'The responses do not match this fixture, clubs or season.',
  },
  'normalization-evidence-unavailable': {
    ar: 'اختر أربعة ردود ناجحة محفوظة من حساب المزود نفسه.',
    en: 'Choose four saved successful responses from the same provider account.',
  },
  'normalization-source-window': {
    ar: 'الردود متباعدة بأكثر من عشر دقائق. اختر مجموعة متقاربة زمنيًا.',
    en: 'The responses are more than ten minutes apart. Select a closer set.',
  },
  'normalization-status-needs-review': {
    ar: 'المسودة تدعم نهاية الوقت الأصلي فقط. الحالات الاستثنائية تحتاج تقريرًا يدويًا.',
    en: 'This draft adapter supports ordinary full time only. Exceptional statuses need a manual report.',
  },
  'normalization-kickoff-changed': {
    ar: 'موعد البداية في المصدر مختلف. راجع موعد المباراة أولاً.',
    en: 'The source kickoff differs. Reconcile the fixture time first.',
  },
  'normalization-lineup-conflict': {
    ar: 'إحصائيات اللاعبين لا تتطابق مع قوائم الأندية. راجع المصادر.',
    en: 'Player statistics conflict with the team lineups. Reconcile the sources.',
  },
  'normalization-duplicate-player': {
    ar: 'يوجد لاعب مكرر في الردود. راجع المصادر.',
    en: 'A player is duplicated in the responses. Review the sources.',
  },
  'normalization-preview-changed': {
    ar: 'تغيرت بيانات المباراة أو روابط المصدر. أنشئ معاينة جديدة قبل الحفظ.',
    en: 'The fixture or source mappings changed. Generate a fresh preview before saving.',
  },
  'normalization-scope-too-large': {
    ar: 'عدد روابط الموسم يتجاوز الحد المسموح للمراجعة.',
    en: 'The season has too many mappings for this review.',
  },
  'competition-changed': {
    ar: 'تغيرت البطولة. حدّث الصفحة ثم راجع التعديل من جديد.',
    en: 'The competition changed. Reload this page and review your changes again.',
  },
  'entry-limit-below-existing': {
    ar: 'لا يمكن تخفيض الحد تحت عدد فرق أحد الحسابات الموجودة.',
    en: 'The limit cannot be lower than an account’s existing entry count.',
  },
  'structural-rules-frozen': {
    ar: 'تكوين الفريق والترتيب ثابتان بعد أول موعد إغلاق. استخدم بطولة جديدة.',
    en: 'Squad structure and ranking are fixed after the first deadline. Use a new competition.',
  },
  'competition-impact-changed': {
    ar: 'تغير أثر التعديل منذ المعاينة. اضغط مراجعة وحفظ للحصول على معاينة جديدة.',
    en: 'The impact changed since your preview. Choose Review & Save to review it again.',
  },
  'calibration-needs-finalized-rounds': {
    ar: 'أكمل جولة واحدة على الأقل قبل بدء التجربة.',
    en: 'Finalize at least one gameweek before starting this experiment.',
  },
  'calibration-results-under-review': {
    ar: 'توجد نتائج قيد المراجعة. حسمها أولاً ثم أعد التجربة.',
    en: 'Resolve the results under review before starting a new experiment.',
  },
  'calibration-sample-too-large-or-empty': {
    ar: 'يلزم مجموعة من ١ إلى ١٠٠٠ لاعب وبحد أقصى ١٠٠ جولة.',
    en: 'Use a pool of 1\u20131,000 players and at most 100 gameweeks.',
  },
  'calibration-policy-or-calendar-invalid': {
    ar: 'راجع ترتيب مواعيد الجولات وحدود الأسعار وإعدادات التجربة.',
    en: 'Check the deadline order, current prices against the proposed bounds, and policy settings.',
  },
  'calibration-hourly-limit': {
    ar: 'بلغت البطولة حد ١٢ تقريراً في الساعة. جرّب لاحقاً.',
    en: 'This competition has reached 12 reports in one hour. Try again later.',
  },
  'calibration-report-too-large': {
    ar: 'تجاوز التقرير الحد المسموح. قلّل عدد السياسات المقارنة.',
    en: 'The report is too large. Compare fewer policies.',
  },
  'finalized-calculation-unavailable': {
    ar: 'دليل إحدى الجولات النهائية غير متاح. راجع نتائجها.',
    en: 'A finalized round calculation is unavailable. Review its results.',
  },
  'finalized-calculation-incomplete': {
    ar: 'توجد بيانات غير مكتملة في جولة نهائية. راجع النتائج أولاً.',
    en: 'A finalized round has incomplete data. Review its results first.',
  },
  'provider-identity-evidence-unavailable': {
    ar: 'يلزم دليل محفوظ من طلب ناجح لهذا المزود.',
    en: 'A saved successful response from this provider is required.',
  },
  'provider-identity-evidence-invalid': {
    ar: 'الدليل غير مكتمل أو غير متسق. راجع استجابة المزود.',
    en: 'The evidence is incomplete or inconsistent. Review the provider response.',
  },
  'provider-identity-scope-mismatch': {
    ar: 'الدليل يخص موردًا أو دوريًا أو موسمًا آخر.',
    en: 'The evidence belongs to another resource, league or season.',
  },
  'provider-identity-source-missing': {
    ar: 'معرّف المصدر غير موجود في الدليل المحدد.',
    en: 'The source ID is missing from the selected evidence.',
  },
  'provider-season-already-bound': {
    ar: 'الموسم أو مفتاح المزود مرتبط بالفعل.',
    en: 'This app season or provider season key is already bound.',
  },
  'provider-binding-unavailable': {
    ar: 'ربط الموسم غير متاح.',
    en: 'The season binding is unavailable.',
  },
  'provider-identity-target-unavailable': {
    ar: 'السجل المقابل غير موجود في هذا الموسم.',
    en: 'The target record does not exist in this season.',
  },
  'provider-fixture-clubs-mismatch': {
    ar: 'اربط ناديَي المباراة أولاً وتحقق من صاحب الأرض والضيف.',
    en: 'Map both clubs first and verify the home/away pairing.',
  },
  'provider-identity-has-fixtures': {
    en: 'Retire this club’s active fixture mappings before changing its identity.',
    ar: 'أوقف ربط المباريات النشط لهذا النادي قبل تغيير هويته.',
  },
  'provider-identity-changed': {
    ar: 'تغيّر إصدار الربط أو حالته. حدّث الصفحة.',
    en: 'The mapping version or state changed. Refresh the page.',
  },
  'provider-identity-relink-review-required': {
    ar: 'يلزم تأكيد مراجعة تغيير السجل المقابل.',
    en: 'Confirm that you reviewed the target change.',
  },
  'provider-identity-target-conflict': {
    ar: 'هناك هوية مصدر أخرى مرتبطة بهذا السجل. راجع الروابط وأوقف الربط الخاطئ أولاً.',
    en: 'Another source identity maps to this record. Review the mappings and retire an incorrect link first.',
  },
  'provider-identity-scope-too-large': {
    ar: 'النطاق أكبر من حد المراجعة. يلزم تضييقه قبل المتابعة.',
    en: 'This scope exceeds the review limit and must be narrowed.',
  },
  'closure-fresh-sign-in-required': {
    ar: 'سجّل الخروج ثم ادخل مجددًا، وراجع الإغلاق خلال ١٥ دقيقة.',
    en: 'Sign out and sign in again, then review closure within 15 minutes.',
  },
  'closure-review-changed': {
    ar: 'تغيّرت بيانات حسابك منذ المراجعة. حدّث الصفحة وراجع من جديد.',
    en: 'Your account changed since this review. Refresh and review again.',
  },
  'closure-blocked': {
    ar: 'أكمل إجراءات الفرق والمجموعات والصلاحيات والجوائز قبل الإغلاق.',
    en: 'Resolve squad, group, staff and prize obligations before closure.',
  },
  'handover-recipient-unavailable': {
    ar: 'العضو المختار غير متاح. يلزم حساب فعّال وعضوية وفريق نشط.',
    en: 'The selected member is unavailable. An active account, membership and squad are required.',
  },
  'handover-changed': {
    ar: 'تغيّر عرض الإدارة أو أُلغي. حدّث الصفحة.',
    en: 'The ownership offer changed or was withdrawn. Refresh the page.',
  },
  'handover-expired-or-changed': {
    ar: 'انتهى العرض أو تغيّرت المجموعة. اطلب عرضًا جديدًا.',
    en: 'The offer expired or the group changed. Ask for a new offer.',
  },
  'archive-unavailable': {
    ar: 'الأرشيف غير متاح أو انتهت صلاحيته. راجع حالته واطلب نسخة جديدة عند الحاجة.',
    en: 'The archive is unavailable or expired. Review its status and request a new copy if needed.',
  },
  'archive-already-queued': {
    ar: 'لديك طلب أرشيف قيد الانتظار. انتظر اكتماله.',
    en: 'You already have a queued archive. Wait for it to finish.',
  },
  'archive-request-limit': {
    ar: 'وصلت إلى حد ٣ طلبات خلال ٢٤ ساعة. حاول لاحقًا.',
    en: 'You reached 3 requests in 24 hours. Try again later.',
  },
  'archive-too-large': {
    ar: 'الأرشيف أكبر من الحد. اختر بطولة أو فترة أقصر.',
    en: 'The archive exceeds the size limit. Choose a competition or shorter date range.',
  },
  'archive-time-limit': {
    ar: 'انتهت مهلة تجهيز الأرشيف. جرّب نطاقًا أصغر أو راجع الدعم.',
    en: 'Archive preparation timed out. Try a smaller scope or contact support.',
  },
  'archive-build-failed': {
    ar: 'تعذّر تجهيز الأرشيف. يمكنك إعادة الطلب أو مراجعة الدعم.',
    en: 'The archive could not be prepared. Request it again or contact support.',
  },
  'profile-changed': {
    ar: 'تغيّر اسم حسابك في جلسة أخرى. حدّث الصفحة قبل المحاولة.',
    en: 'Your profile changed in another session. Refresh before trying again.',
  },
  'scoring-failed': {
    ar: 'تعذّرت معالجة نتائج الجولة. راجع مرجعها وسجل التشغيل.',
    en: 'Gameweek results could not be processed. Inspect the round reference and run log.',
  },
  'achievement-reconciliation-failed': {
    ar: 'تعذّرت مراجعة إنجازات البطولة. راجع مرجعها.',
    en: 'Competition achievements could not be reconciled. Inspect the competition reference.',
  },
  'prize-correction-failed': {
    ar: 'تعذّرت مراجعة تغييرات الجائزة. راجع مرجع المقترح.',
    en: 'Prize changes could not be reconciled. Inspect the proposal reference.',
  },
  'initial-prices-draft-only': {
    ar: 'اقتراح أسعار البداية متاح للبطولات المسودة فقط.',
    en: 'Starting-price suggestions are only available for draft competitions.',
  },
  'initial-price-review-expired': {
    ar: 'انتهت صلاحية مراجعة الأسعار. احسب الاقتراحات مجددًا.',
    en: 'The price review expired. Calculate the suggestions again.',
  },
  'initial-price-source-changed': {
    ar: 'تغيّرت مصادر التقييم. حدّث الصفحة واحسب الاقتراحات مجددًا.',
    en: 'Valuation sources changed. Refresh and calculate the suggestions again.',
  },
  'initial-price-positions-changed': {
    ar: 'تغيّرت المراكز منذ المراجعة. احسب الاقتراحات مجددًا.',
    en: 'Positions changed since review. Calculate the suggestions again.',
  },
  'import-preview-changed': {
    ar: 'تغيّرت السجلات منذ المراجعة. صدّر أحدث نسخة وراجع الدفعة مجددًا.',
    en: 'Records changed since review. Export the latest version and review the batch again.',
  },
  'import-row-limit': {
    ar: 'يتجاوز الموسم حد ١٠٠٠ سجل للدفعة.',
    en: 'This season exceeds the 1,000-record batch limit.',
  },
  'import-command-id-conflict': {
    ar: 'يجب أن يختلف معرّف الدفعة عن معرّفات السجلات.',
    en: 'The batch identifier must differ from record command identifiers.',
  },
  'prize-correction-unavailable': {
    ar: 'حالة مراجعة الجائزة غير متاحة.',
    en: 'This award correction case is unavailable.',
  },
  'prize-correction-changed': {
    ar: 'تغيّرت أدلة المراجعة. حدّث الصفحة وانتظر تحديث الحالة ثم راجعها من جديد.',
    en: 'Review evidence changed. Refresh after the case updates and review again.',
  },
  'prize-correction-unsettled': {
    ar: 'يلزم اكتمال النتائج النهائية والأهلية قبل إغلاق المراجعة.',
    en: 'Final results and complete eligibility are required before resolving this review.',
  },
  'provider-settings-changed': {
    ar: 'تغيّرت إعدادات المزود. حدّث الصفحة وراجعها.',
    en: 'Provider settings changed. Refresh and review again.',
  },
  'provider-reset-unverified': {
    ar: 'أدخل موعد إعادة تعيين سابقاً ومؤكّداً من المزود.',
    en: 'Enter a past reset instant confirmed by the provider.',
  },
  'provider-reset-in-use': {
    ar: 'لا يمكن تغيير مرجع الفترة بعد تسجيل استهلاك فيها.',
    en: 'The reset anchor cannot change after usage is recorded in this window.',
  },
  'provider-usage-cannot-decrease': {
    ar: 'لا يمكن تقليل الاستهلاك المسجّل.',
    en: 'Recorded consumption cannot decrease.',
  },
  'provider-window-changed': {
    ar: 'تغيّرت فترة الميزانية. حدّث الصفحة وراجع الاستهلاك الحالي.',
    en: 'The quota window changed. Refresh and review current usage.',
  },
  'provider-quota-unverified': {
    ar: 'الطلبات متوقفة حتى تأكيد الحدود والفترة والاستهلاك.',
    en: 'Requests are paused until limits, the window and usage are verified.',
  },
  'entry-changed': {
    ar: 'تغيّر الفريق. حدّث الصفحة وراجع الطلب من جديد.',
    en: 'The squad changed. Refresh and review again.',
  },
  'entry-draft-only': {
    ar: 'يمكن حذف المسودات غير المفعّلة فقط.',
    en: 'Only unactivated drafts can be discarded.',
  },
  'entry-draft-has-history': {
    ar: 'لهذه المسودة سجل مشاركة يمنع حذفها.',
    en: 'This draft has participation history and cannot be discarded.',
  },
  'entry-already-retired': {
    ar: 'لا يمكن إنهاء المشاركة إلا لفريق نشط.',
    en: 'Only an active squad can retire.',
  },
  'prize-entry-retired-during-window': {
    ar: 'انتهت مشاركة الفريق قبل موعد جولة ضمن فترة الجائزة.',
    en: 'The squad retired before a round deadline in this prize window.',
  },
  'chat-disabled': {
    ar: 'الغرفة غير مفعّلة حالياً.',
    en: 'This room is currently disabled.',
  },
  'chat-message-too-long': {
    ar: 'الرسالة تتجاوز طول الغرفة المسموح.',
    en: 'Your message exceeds the room length limit.',
  },
  'chat-timeout': {
    ar: 'إرسال الرسائل موقوف مؤقتاً لهذا الحساب في الغرفة.',
    en: 'Posting is temporarily paused for this account in this room.',
  },
  'chat-rate-limit': {
    ar: 'أرسلت رسائل بسرعة كبيرة. انتظر قبل المحاولة.',
    en: 'You have reached the message limit. Wait before trying again.',
  },
  'chat-report-rate-limit': {
    ar: 'وصلت إلى حد البلاغات في الساعة.',
    en: 'You have reached the hourly report limit.',
  },
  'chat-message-unavailable': {
    ar: 'الرسالة غير متاحة أو انتهت مدة الاحتفاظ بها.',
    en: 'The message is unavailable or has expired.',
  },
  'chat-report-unavailable': {
    ar: 'البلاغ غير متاح أو تمت مراجعته.',
    en: 'The report is unavailable or already reviewed.',
  },
  'chat-member-unavailable': {
    ar: 'العضو غير متاح في هذه الغرفة.',
    en: 'This member is unavailable in this room.',
  },
  'chat-cannot-block-self': {
    ar: 'لا يمكنك حظر حسابك.',
    en: 'You cannot block your own account.',
  },
  'chat-settings-changed': {
    ar: 'تغيّرت إعدادات الغرفة. حدّث الصفحة وأعد المراجعة.',
    en: 'Room settings changed. Refresh and review again.',
  },
  'chat-timeout-window': {
    ar: 'اختر مدة إيقاف مستقبلية لا تتجاوز ٣٠ يوماً.',
    en: 'Choose a future timeout of at most 30 days.',
  },
  'account-cannot-suspend-self': {
    ar: 'لا يمكن إيقاف حسابك من هذه الصفحة.',
    en: 'You cannot suspend your own account here.',
  },
  'account-unavailable': {
    ar: 'الحساب غير متاح.',
    en: 'This account is unavailable.',
  },
  'account-moderation-changed': {
    ar: 'تغيّرت حالة الحساب. حدّث الصفحة وأعد المراجعة.',
    en: 'Account status changed. Refresh and review again.',
  },
  'account-staff-protected': {
    ar: 'الحساب يحمل صلاحيات تشغيل. يجب على المالك إدارة صلاحياته أولاً.',
    en: 'This account has staff privileges. An owner must manage those privileges first.',
  },
  'account-suspension-window': {
    ar: 'اختر نهاية إيقاف مستقبلية خلال سنة.',
    en: 'Choose a future suspension end within one year.',
  },
  'sponsor-image-size': {
    ar: 'حجم الصورة غير مسموح. الحد ٤ ميجابايت قبل التجهيز.',
    en: 'Image size is not allowed. Upload at most 4 MB.',
  },
  'sponsor-image-format': {
    ar: 'استخدم PNG أو JPEG أو WebP ثابتة.',
    en: 'Use a static PNG, JPEG or WebP image.',
  },
  'sponsor-image-dimensions': {
    ar: 'راجع الأبعاد؛ الصور المتحركة غير مدعومة.',
    en: 'Check image dimensions; animated artwork is not supported.',
  },
  'sponsor-image-invalid': {
    ar: 'تعذّر قراءة الصورة بشكل آمن. اختر ملفاً صالحاً.',
    en: 'The image could not be decoded safely. Choose a valid file.',
  },
  'sponsor-campaign-unavailable': {
    ar: 'الحملة غير متاحة ضمن هذا النطاق.',
    en: 'This campaign is unavailable in this scope.',
  },
  'sponsor-campaign-changed': {
    ar: 'تغيّرت الحملة. حدّث الصفحة وأعد المراجعة.',
    en: 'The campaign changed. Refresh and review again.',
  },
  'sponsor-pause-before-edit': {
    ar: 'أوقف الحملة قبل تعديل المحتوى المنشور.',
    en: 'Pause the campaign before editing published content.',
  },
  'sponsor-publication-unavailable': {
    ar: 'الحملة منشورة بالفعل أو انتهى موعدها.',
    en: 'The campaign is already published or has ended.',
  },
  'sponsor-assets-scope': {
    ar: 'اختر صوراً معتمدة من نطاق هذه الحملة.',
    en: 'Choose approved artwork from this campaign’s scope.',
  },
  'access-denied': {
    ar: 'لا تملك صلاحية هذا الإجراء أو رمز الدعوة غير صالح.',
    en: 'You do not have access to this action, or the invitation is invalid.',
  },
  'sign-in-required': {
    ar: 'سجّل دخولك بحساب موثّق للمتابعة.',
    en: 'Sign in with a verified account to continue.',
  },
  'staff-verification-required': {
    ar: 'جدّد التحقق بكلمة المرور ورمز المصادقة من صفحة الأمان.',
    en: 'Verify your password and authenticator again on the Security page.',
  },
  'group-entry-limit': {
    ar: 'وصل حسابك للحد المسموح من الفرق في هذه المجموعة.',
    en: 'Your account has reached this group’s entry limit.',
  },
  'group-entry-limit-exceeds-competition': {
    ar: 'حد المجموعة لا يمكن أن يتجاوز حد الفرق في البطولة.',
    en: 'The group entry limit cannot exceed the competition limit.',
  },
  'group-start-must-be-unlocked': {
    ar: 'اختر جولة قادمة لم تُغلق لبدء احتساب النقاط.',
    en: 'Choose a future unlocked gameweek for the scoring start.',
  },
  'group-changed': {
    ar: 'تغيّرت المجموعة. حدّث الصفحة وراجع الطلب.',
    en: 'The group changed. Refresh and review your request.',
  },
  'organizer-group-limit': {
    ar: 'وصلت إلى حد المجموعات التي يمكنك تنظيمها.',
    en: 'You have reached the organizer group limit.',
  },
  'group-unavailable': {
    ar: 'المجموعة غير متاحة.',
    en: 'This group is unavailable.',
  },
  'active-owned-entry-required': {
    ar: 'اختر فريقاً مفعّلاً تملكه في هذه البطولة.',
    en: 'Choose an active squad you own in this competition.',
  },
  'already-joined': {
    ar: 'هذا الفريق عضو بالفعل أو طلبه ينتظر الموافقة.',
    en: 'This squad is already a member or has a pending request.',
  },
  'membership-removed': {
    ar: 'أزال المنظّم هذه العضوية؛ لا يمكن إعادة طلبها بهذا الفريق.',
    en: 'The organizer removed this membership. This squad cannot reapply.',
  },
  'membership-changed': {
    ar: 'تغيّرت حالة العضوية. حدّث الصفحة قبل اتخاذ الإجراء.',
    en: 'Membership changed. Refresh before taking action.',
  },
  'organizer-must-retain-membership': {
    ar: 'يجب أن يحتفظ المنظّم بفريق عضو واحد على الأقل.',
    en: 'The organizer must retain at least one active squad membership.',
  },
  'edition-rounds-must-be-unlocked': {
    ar: 'كل جولات النسخة يجب أن تكون قادمة ولم تُغلق.',
    en: 'Every edition gameweek must be in the future and unlocked.',
  },
  'edition-deadline-passed': {
    ar: 'انتهى موعد إحدى الجولات. لا يمكن قبول التسجيل أو نشر هذا الجدول.',
    en: 'A gameweek deadline has passed. Registration or publication cannot be accepted.',
  },
  'edition-registration-closed': {
    ar: 'التسجيل في هذه النسخة غير مفتوح.',
    en: 'Registration for this edition is closed.',
  },
  'edition-roster-changed': {
    ar: 'تغيّرت قائمة الفرق. حدّث الصفحة وراجع الجدول من جديد.',
    en: 'The roster changed. Refresh and review the schedule again.',
  },
  'edition-needs-complete-cycle': {
    ar: 'عدد الجولات لا يكفي لدورة كاملة لجميع الفرق.',
    en: 'The window is too short for a complete round-robin cycle.',
  },
  'edition-changed': {
    ar: 'تغيّرت النسخة. حدّث الصفحة وراجع الإجراء.',
    en: 'The edition changed. Refresh and review the action.',
  },
  'edition-roster-limit': {
    ar: 'وصلت النسخة للحد المسموح من الفرق.',
    en: 'This edition has reached its roster limit.',
  },
  'edition-draft-limit': {
    ar: 'لديك خمس نسخ غير منشورة بالفعل.',
    en: 'This group already has five unpublished editions.',
  },
  'already-registered': {
    ar: 'الفريق مسجّل في هذه النسخة بالفعل.',
    en: 'This squad is already registered in the edition.',
  },
  'catalogue-changed': {
    ar: 'تغيّر السجل بواسطة تعديل آخر. حدّث الصفحة قبل الحفظ.',
    en: 'Another edit changed this record. Refresh before saving.',
  },
  'season-dates-invalid': {
    ar: 'نهاية الموسم يجب أن تكون بعد بدايته.',
    en: 'The season must end after it starts.',
  },
  'synthetic-provenance-frozen': {
    ar: 'لا يمكن تحويل سجل تجريبي إلى سجل حقيقي أو العكس.',
    en: 'A record cannot be changed between fictional and real provenance.',
  },
  'footballer-identity-frozen': {
    ar: 'موسم اللاعب وصفة بياناته التجريبية ثابتان.',
    en: 'A footballer’s season and fictional-data provenance are fixed.',
  },
  'club-outside-season': {
    ar: 'اختر نادياً من نفس الموسم.',
    en: 'Choose a club in the same season.',
  },
  'valuation-date-in-future': {
    ar: 'تاريخ التقييم لا يمكن أن يكون في المستقبل.',
    en: 'The valuation date cannot be in the future.',
  },
  'economic-rules-need-future-round': {
    ar: 'حدّد جولة قادمة لم يبدأ تعديلها لتغييرات الانتقالات والشرائح.',
    en: 'Choose a future unopened editing round for transfer and chip availability changes.',
  },
  'economic-round-already-open': {
    ar: 'بدأ تعديل هذه الجولة بالفعل. اختر جولة لاحقة.',
    en: 'This round is already open for editing. Choose a later round.',
  },
  'economic-rules-need-notice': {
    ar: 'يلزم ٤٨ ساعة على الأقل قبل فتح تعديل الجولة المختارة.',
    en: 'Allow at least 48 hours before the selected round opens for editing.',
  },
  'economic-rules-must-follow-scheduled-changes': {
    ar: 'اختر نفس جولة آخر تغيير معلن أو جولة بعدها.',
    en: 'Choose the latest announced economic transition or a later round.',
  },
  'chip-inventory-needs-equal-grant': {
    ar: 'لا يمكن استبدال مخزون الفرق المفعّلة. الزيادة تتطلب منحة متساوية مستقلة.',
    en: 'Activated squads keep their chip inventories. Increases require a separate equal grant.',
  },
  'starting-budget-already-allocated': {
    ar: 'تم تخصيص ميزانية البداية لفرق قائمة، فلا يمكن تغييرها.',
    en: 'Existing squads have already received their starting budget.',
  },
  'structural-change-invalidates-entry': {
    ar: 'هذا التغيير يجعل فريقاً قائماً غير صالح. حافظ على القواعد أو أنشئ بطولة جديدة.',
    en: 'This change would invalidate an existing squad. Keep the rules or create a new competition.',
  },
  'structural-rules-need-notice': {
    ar: 'لا يوجد إخطار كافٍ قبل أول موعد إغلاق لتغيير تكوين الفرق.',
    en: 'There is not enough notice before the first deadline to change squad structure.',
  },
  'rules-need-future-notice': {
    ar: 'لا توجد جولة قادمة تسمح بإخطار ٤٨ ساعة. أضف جولات قادمة أولاً.',
    en: 'No future round allows 48 hours’ notice. Add future rounds first.',
  },
  'last-owner-protected': {
    ar: 'لا يمكن سحب صلاحية آخر مالك غير موقوف. امنح مالكاً آخر الصلاحية أولاً.',
    en: 'The last verified, unsuspended owner with two-factor authentication cannot be removed. Assign another ready owner first.',
  },
  'staff-account-unavailable': {
    ar: 'الحساب غير متاح أو موقوف.',
    en: 'This account is unavailable or suspended.',
  },
  'staff-grant-exists': {
    ar: 'يمتلك الحساب هذا الدور في نفس النطاق بالفعل.',
    en: 'This account already has that role in this scope.',
  },
  'staff-grant-changed': {
    ar: 'تغيّرت الصلاحية. حدّث القائمة.',
    en: 'This permission has changed. Refresh the list.',
  },
  'prize-results-not-final': {
    ar: 'النتائج لم تصبح نهائية ومكتملة لكل الجولات المحتسبة.',
    en: 'Every scoring round must have complete finalized results.',
  },
  'prize-results-under-review': {
    ar: 'هناك مراجعة مفتوحة للنتائج. تُعلّق الجوائز حتى تنتهي.',
    en: 'Results have an open review. Awards are held until it is resolved.',
  },
  'prize-facts-changed': {
    ar: 'تغيّرت بيانات المباريات بعد النتيجة النهائية. راجع التصحيح قبل متابعة الجوائز.',
    en: 'Match facts changed after finalization. Review the correction before proceeding.',
  },
  'prize-proposal-stale': {
    ar: 'تغيّرت النتائج أو الأهلية عن المقترح. ألغِ المقترح غير المسلّم وأعد حسابه.',
    en: 'Results or eligibility differ from this proposal. Void an unfulfilled proposal and prepare it again.',
  },
  'prize-preview-changed': {
    ar: 'تغيّرت المعاينة. حدّث الصفحة وراجع المقترح الجديد.',
    en: 'The preview changed. Refresh and review the new calculation.',
  },
  'prize-proposal-blocked': {
    ar: 'تعذّر حساب جوائز قابلة للاعتماد؛ راجع الأهلية والنتائج وتسوية التعادل.',
    en: 'Awards cannot be approved yet. Review eligibility, complete results and tie settlement.',
  },
  'prize-self-award': {
    ar: 'لا يمكن لمسؤول إعداد أو مراجعة أو اعتماد أو تسجيل تسليم جائزة لنفسه.',
    en: 'An operator cannot prepare, review, approve or record fulfillment of their own award.',
  },
  'prize-distinct-approver-required': {
    ar: 'يجب أن يعتمد الجائزة حساب آخر غير الذي أعدّها.',
    en: 'Approval requires a different account from the preparer.',
  },
  'prize-terms-frozen': {
    ar: 'الشروط المنشورة ثابتة. أنشئ جائزة مستقبلية جديدة لتغييرها.',
    en: 'Published terms are frozen. Create a new future pool for different terms.',
  },
  'prize-publication-closed': {
    ar: 'انتهى وقت نشر الشروط؛ يجب النشر قبل إغلاق الأهلية وأول جولة.',
    en: 'Publish terms before the eligibility cutoff and opening round.',
  },
  'prize-cutoff-after-opening': {
    ar: 'إغلاق الأهلية يجب أن يسبق أو يساوي موعد أول جولة.',
    en: 'Eligibility must close no later than the first scoring deadline.',
  },
  'prize-cutoff-protected': {
    ar: 'هذا التعديل سيقصّر مدة الأهلية المعلنة للجائزة.',
    en: 'This change would shorten the published award eligibility period.',
  },
  'prize-invalid-interval': {
    ar: 'اختر نطاق جولات صالحاً ضمن البطولة والمجموعة.',
    en: 'Choose a valid scoring interval within the competition and group.',
  },
  'prize-pool-changed': {
    ar: 'تغيّرت الجائزة. حدّث الصفحة قبل الحفظ.',
    en: 'The award pool changed. Refresh before saving.',
  },
  'prize-proposal-changed': {
    ar: 'تغيّر المقترح. حدّث الصفحة قبل المتابعة.',
    en: 'The proposal changed. Refresh before continuing.',
  },
  'prize-proposal-already-exists': {
    ar: 'يوجد مقترح حالي. راجعه أو ألغِ المقترح غير المسلّم أولاً.',
    en: 'A current proposal exists. Review it or void it before fulfillment to prepare another.',
  },
  'prize-transition-unavailable': {
    ar: 'هذا الإجراء غير متاح في المرحلة الحالية.',
    en: 'This action is unavailable at the current stage.',
  },
  'prize-email-not-verified': {
    ar: 'البريد غير مؤكّد',
    en: 'Email not verified',
  },
  'prize-account-suspended': { ar: 'الحساب موقوف', en: 'Account suspended' },
  'prize-eligibility-excluded': {
    ar: 'مستبعد بعد مراجعة الأهلية',
    en: 'Excluded after eligibility review',
  },
  'prize-incomplete-entry-results': {
    ar: 'نتائج الفريق غير مكتملة',
    en: 'Squad results incomplete',
  },
  'staff-verified-account-required': {
    ar: 'يجب أن يكون الحساب مسجّلاً وبريده مؤكّداً قبل منحه صلاحيات.',
    en: 'Staff access requires a registered account with verified email.',
  },
  'staff-owner-mfa-required': {
    ar: 'فعّل المصادقة الثنائية للحساب قبل منحه دور المالك.',
    en: 'Enable two-factor authentication on the account before assigning the owner role.',
  },
  'achievement-definition-frozen': {
    ar: 'التعريف المنشور ثابت. أنشئ نسخة مستقبلية جديدة.',
    en: 'Published definitions are frozen. Create a new future version.',
  },
  'achievement-changed': {
    ar: 'تغيّر التعريف. حدّث الصفحة وراجع النسخة الحالية.',
    en: 'The definition changed. Refresh and review its current revision.',
  },
  'achievement-use-latest-version': {
    ar: 'حرّر أحدث مسودة أو ابدأ من أحدث نسخة منشورة.',
    en: 'Edit the latest draft or start from the latest published version.',
  },
  'achievement-historical-confirmation-required': {
    ar: 'منح النسخة الأولى بأثر رجعي يحتاج مراجعة صريحة. النسخ اللاحقة تبدأ مستقبلاً.',
    en: 'Retrospective first-version awards need explicit review. Later versions must start in the future.',
  },
  'achievement-version-must-be-future': {
    ar: 'ابدأ النسخة الجديدة في جولة مستقبلية وبعد بداية النسخة السابقة.',
    en: 'Start the new version in a future round after the preceding version’s start.',
  },
  'achievement-retirement-must-be-future': {
    ar: 'يمكن تقصير نافذة المنح المستقبلية فقط، دون تغيير الجولات التي أُغلقت.',
    en: 'Only shorten the future granting window, preserving already locked rounds.',
  },
  'achievement-window-unavailable': {
    ar: 'أضف جولة ضمن نافذة الإنجاز قبل نشره.',
    en: 'Add a gameweek within the achievement window before publishing.',
  },
  'achievement-publication-unavailable': {
    ar: 'انشر البطولة أولاً، ثم انشر مسودة الإنجاز.',
    en: 'Publish the competition first, then publish the achievement draft.',
  },
  'achievement-window-has-earned-grants': {
    ar: 'هناك إنجازات تفعيل مكتسبة بالفعل ضمن النافذة. اختر موعداً لاحقاً للحفاظ عليها.',
    en: 'Activation badges have already been earned in that window. Choose a later boundary to preserve them.',
  },
  'invalid-request': {
    ar: 'راجع الحقول المطلوبة والاختيارات المسموحة.',
    en: 'Check required fields and supported choices.',
  },
  'idempotency-conflict': {
    ar: 'تغيّر محتوى طلب سابق. حدّث الصفحة وابدأ مراجعة جديدة.',
    en: 'An earlier request was changed. Refresh and start a new review.',
  },
};
export function commandError(code: string, locale: Locale): string {
  return (
    messages[code]?.[locale] ??
    (locale === 'ar'
      ? 'تعذّر تأكيد الطلب. حدّث الصفحة وراجع الحالة قبل المحاولة.'
      : 'The request was not confirmed. Refresh and review its status before retrying.')
  );
}
