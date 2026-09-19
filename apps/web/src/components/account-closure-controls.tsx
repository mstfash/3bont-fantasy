'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  accountClosureCommandSchema,
  accountClosureResultSchema,
  type AccountClosurePreview,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from './reviewed-command-form';
import { formText } from './groups/reviewed-form';
export function AccountClosureControls({
  locale,
  preview,
}: {
  readonly locale: Locale;
  readonly preview: AccountClosurePreview;
}) {
  const ar = locale === 'ar',
    [closed, setClosed] = useState(false);
  if (closed)
    return (
      <section className="group-card">
        <h2>{ar ? 'تم إغلاق حسابك' : 'YOUR ACCOUNT IS CLOSED'}</h2>
        <p>
          {ar
            ? 'انتهت جلسات الدخول وحُذفت بيانات الوصول والأرشيفات. تظهر المشاركات المحفوظة بأسماء محايدة.'
            : 'Your sessions ended and credentials and archives were removed. Retained competition entries now use neutral names.'}
        </p>
        <Link href={`/${locale}`}>
          {ar ? 'الصفحة الرئيسية' : 'Return home'}
        </Link>
      </section>
    );
  return (
    <>
      <section className="group-card">
        <h2>{ar ? 'ما الذي سيتغيّر؟' : 'WHAT WILL CHANGE'}</h2>
        <p>
          {ar
            ? 'الإغلاق نهائي. تُحذف بيانات دخولك وأرشيفاتك ومحتوى رسائلك العادية، وتُستبدل أسماء حسابك وفرقك بأسماء محايدة. لا يمكن استعادة الفرق بتسجيل حساب جديد.'
            : 'Closure is permanent. Your login credentials, archives and ordinary message content are removed, and your account and squad names become neutral labels. Registering again cannot recover these squads.'}
        </p>
        <p>
          {ar
            ? 'يبقى سجل النقاط والتشكيلات المقفلة والعضويات والجوائز المسلّمة. تحتفظ الإدارة بأدلة المنافسة والتدقيق والإشراف المقيّدة وفق سياسة الاحتفاظ؛ الإغلاق لا يمحو كل سجل محفوظ.'
            : 'Points, locked lineups, membership history and fulfilled awards remain. Restricted competition, audit and moderation evidence follows the retention policy; closure does not erase every retained record.'}
        </p>
        <p>
          {ar
            ? 'يمكن تنزيل نسخة من بياناتك قبل الإغلاق. لطلبات المحو الاستثنائية، راجع دعم المشغّل.'
            : 'Download your game data before closing. Contact operator support for exceptional erasure requests.'}{' '}
          <Link href={`/${locale}/profile`}>
            {ar ? 'ملفي والأرشيف' : 'Profile and archive'}
          </Link>
        </p>
        <p>
          {ar ? 'الرسائل التي سيُحذف محتواها' : 'Message bodies to remove'}:{' '}
          {preview.messageCount} ·{' '}
          {ar ? 'الأرشيفات التي ستُحذف' : 'Archives to purge'}:{' '}
          {preview.archiveCount}
        </p>
      </section>
      {preview.entries.length > 0 && (
        <section className="group-card">
          <h2>{ar ? 'مشاركاتك' : 'YOUR ENTRIES'}</h2>
          {preview.entries.map((e) => (
            <p key={e.id}>
              <Link href={`/${locale}/entries/${e.id}`}>{e.name}</Link> ·{' '}
              {e.status === 'retired'
                ? ar
                  ? 'انتهت المشاركة؛ سيبقى السجل'
                  : 'Retired; history retained'
                : e.status === 'draft'
                  ? ar
                    ? 'احذف المسودة أولاً'
                    : 'Discard this draft first'
                  : ar
                    ? 'أنهِ المشاركة أولاً'
                    : 'Retire this entry first'}
            </p>
          ))}
        </section>
      )}
      {preview.groups.length > 0 && (
        <section className="group-card">
          <h2>{ar ? 'سلّم إدارة مجموعاتك' : 'HAND OVER YOUR GROUPS'}</h2>
          {preview.groups.map((g) => (
            <p key={g.id}>
              <Link href={`/${locale}/groups/${g.id}`}>{g.name}</Link>
            </p>
          ))}
        </section>
      )}
      {preview.staffRoles.length > 0 && (
        <section className="group-card">
          <h2>{ar ? 'صلاحيات الإدارة' : 'STAFF ACCESS'}</h2>
          <p>
            {ar
              ? 'اطلب من مالك آخر إزالة صلاحياتك قبل الإغلاق. يجب أن يبقى مالك فعّال للنظام.'
              : 'Ask another owner to remove your staff access before closure. The platform must retain an active owner.'}
          </p>
        </section>
      )}
      {preview.awards.length > 0 && (
        <section className="group-card">
          <h2>{ar ? 'جوائز تحتاج التسوية' : 'PRIZES NEED SETTLEMENT'}</h2>
          {preview.awards.map((a, i) => (
            <p key={`${a.poolId}-${String(i)}`}>
              <Link href={`/${locale}/prizes/${a.poolId}`}>
                {a.name[locale]}
              </Link>{' '}
              ·{' '}
              {a.state === 'correction-open'
                ? ar
                  ? 'مراجعة تصحيح مفتوحة'
                  : 'Open correction review'
                : ar
                  ? 'جائزة غير مسلّمة'
                  : 'Unfulfilled award'}
            </p>
          ))}
        </section>
      )}
      <section className="group-card">
        <h2>{ar ? 'تأكيد الإغلاق' : 'CONFIRM CLOSURE'}</h2>
        {preview.canClose ? (
          <ReviewedCommandForm
            locale={locale}
            label={ar ? 'مراجعة الإغلاق النهائي' : 'REVIEW PERMANENT CLOSURE'}
            endpoint="/api/v1/account/close"
            commandSchema={accountClosureCommandSchema}
            resultSchema={accountClosureResultSchema}
            makeCommand={(form) => ({
              commandId: crypto.randomUUID(),
              expectedFingerprint: preview.fingerprint,
              confirmation: formText(form, 'confirmation'),
            })}
            onSaved={() => {
              setClosed(true);
            }}
          >
            <p>
              {ar
                ? 'يلزم تسجيل دخول جديد خلال آخر ١٥ دقيقة. اكتب CLOSE ثم راجع وأكّد.'
                : 'You must have signed in within the last 15 minutes. Type CLOSE, then review and confirm.'}
            </p>
            <label>
              {ar ? 'اكتب CLOSE' : 'Type CLOSE'}
              <input
                name="confirmation"
                required
                pattern="CLOSE"
                autoComplete="off"
                dir="ltr"
              />
            </label>
          </ReviewedCommandForm>
        ) : (
          <p>
            {ar
              ? 'أكمل الإجراءات الموضّحة أعلاه ثم حدّث هذه الصفحة لمراجعة الإغلاق.'
              : 'Complete the actions above, then refresh this page to review closure.'}
          </p>
        )}
        <a href={`/${locale}/profile/close`}>
          {ar ? 'تحديث المراجعة' : 'Refresh review'}
        </a>
      </section>
    </>
  );
}
