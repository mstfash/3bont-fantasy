import type { readChatModeration } from '@fantasy/application';
import type { Locale } from '@/lib/brand';
import {
  ChatSettingsEditor,
  ChatModerationAction,
} from './moderation-controls';
import '@/styles/chat.css';
export function ChatModerationPanel({
  locale,
  data,
  staff,
}: {
  readonly locale: Locale;
  readonly data: Awaited<ReturnType<typeof readChatModeration>>;
  readonly staff: boolean;
}) {
  const ar = locale === 'ar',
    common = {
      locale,
      competitionId: data.group.competitionId,
      groupId: data.group.id,
      staff,
    };
  return (
    <>
      <section className="group-card">
        <h2>{ar ? 'إعدادات الغرفة' : 'Room settings'}</h2>
        <ChatSettingsEditor {...common} settings={data.settings} />
      </section>
      <section>
        <h2>{ar ? 'البلاغات وأدلة الإزالة' : 'Reports & removal evidence'}</h2>
        <p>
          {ar
            ? 'أدلة خاصة بالمراجعين، تنتهي بعد ١٨٠ يوماً. إزالة رسالة لا تحذف الأدلة المحتفظ بها.'
            : 'Restricted review evidence expires after 180 days. Removing a message does not erase retained evidence.'}
        </p>
        {data.reports.length === 0 && (
          <p>{ar ? 'لا توجد بلاغات.' : 'No reports.'}</p>
        )}
        <div className="group-grid">
          {data.reports.map((report) => (
            <article className="group-card" key={report.id}>
              <span className="eyebrow">
                {report.state === 'open'
                  ? ar
                    ? 'للمراجعة'
                    : 'OPEN'
                  : report.state === 'actioned'
                    ? ar
                      ? 'تم الإجراء'
                      : 'ACTIONED'
                    : ar
                      ? 'مغلق دون إجراء'
                      : 'DISMISSED'}
              </span>
              <blockquote className="chat-evidence" dir="auto">
                {report.body}
              </blockquote>
              <p className="chat-evidence">{report.reason}</p>
              <p>
                {ar ? 'التاريخ' : 'Received'}:{' '}
                <bdi>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Africa/Cairo',
                  }).format(report.created_at)}
                </bdi>
              </p>
              {report.resolution && (
                <p className="chat-evidence">
                  {ar ? 'قرار المراجعة: ' : 'Review decision: '}
                  {report.resolution}
                </p>
              )}
              {report.state === 'open' && (
                <>
                  <details>
                    <summary>
                      {ar
                        ? 'إزالة المحتوى من الغرفة'
                        : 'Remove content from room'}
                    </summary>
                    <ChatModerationAction
                      {...common}
                      action="remove"
                      messageId={report.message_id}
                    />
                  </details>
                  <details>
                    <summary>
                      {ar ? 'إيقاف الكاتب مؤقتاً' : 'Timeout author'}
                    </summary>
                    <ChatModerationAction
                      {...common}
                      action="timeout"
                      accountId={report.author_id}
                    />
                  </details>
                  <ChatModerationAction
                    {...common}
                    action="resolve-report"
                    reportId={report.id}
                  />
                </>
              )}
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2>{ar ? 'إيقاف الإرسال النشط' : 'Active posting timeouts'}</h2>
        <div className="group-grid">
          {data.timeouts.map((t) => (
            <article className="group-card" key={t.account_id}>
              <h3>
                <bdi>{t.display_name}</bdi>
              </h3>
              <p>{t.reason}</p>
              <p>
                <bdi>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: 'Africa/Cairo',
                  }).format(t.until_at)}
                </bdi>
              </p>
              <ChatModerationAction
                {...common}
                action="timeout"
                accountId={t.account_id}
              />
            </article>
          ))}
        </div>
      </section>
      <details>
        <summary>
          {ar
            ? 'سجل المراجعة (آخر ٥٠ إجراءً)'
            : 'Review history (latest 50 actions)'}
        </summary>
        {data.history.map((h) => (
          <div className="group-card" key={h.id}>
            <p>
              {h.action === 'configure'
                ? ar
                  ? 'إعدادات الغرفة'
                  : 'Room settings'
                : h.action === 'remove'
                  ? ar
                    ? 'إزالة رسالة'
                    : 'Message removal'
                  : h.action === 'timeout'
                    ? ar
                      ? 'إيقاف الإرسال'
                      : 'Posting timeout'
                    : ar
                      ? 'قرار بلاغ'
                      : 'Report decision'}
            </p>
            <p className="chat-evidence">{h.reason}</p>
            <time>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Africa/Cairo',
              }).format(h.created_at)}
            </time>
          </div>
        ))}
      </details>
    </>
  );
}
