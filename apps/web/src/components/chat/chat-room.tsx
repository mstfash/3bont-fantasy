'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  chatCommandSchema,
  chatCommandResultSchema,
  chatPageSchema,
  type ChatCommand,
  type ChatPage,
} from '@fantasy/contracts';
import { commandError } from '@/lib/command-errors';
import type { Locale } from '@/lib/brand';
export function ChatRoom({
  locale,
  competitionId,
  groupId,
  accountId,
  initial,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly groupId: string;
  readonly accountId: string;
  readonly initial: ChatPage;
}) {
  const ar = locale === 'ar';
  const [data, setData] = useState<ChatPage | null>(initial),
    [before, setBefore] = useState<string | null>(null),
    [refresh, setRefresh] = useState(0),
    [body, setBody] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState<ChatCommand | null>(null);
  const postRef = useRef<ChatCommand | null>(null),
    muted = data?.muted ?? false;
  useEffect(() => {
    const lifetime = new AbortController();
    let delay = 10000,
      timer: ReturnType<typeof setTimeout> | undefined,
      controller: AbortController | undefined;
    async function load() {
      if (document.hidden) return;
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      try {
        const query = new URLSearchParams({
          competitionId,
          groupId,
          ...(before ? { before } : {}),
        });
        const response = await fetch(`/api/v1/chat?${query.toString()}`, {
          cache: 'no-store',
          signal: requestController.signal,
        });
        lifetime.signal.throwIfAborted();
        requestController.signal.throwIfAborted();
        if (response.status === 401 || response.status === 403) {
          setData(null);
          setNotice(
            ar
              ? 'لم تعد الغرفة متاحة لهذا الحساب.'
              : 'This account no longer has access to this room.',
          );
          return;
        }
        if (!response.ok) throw new Error('Chat unavailable');
        const json: unknown = await response.json();
        lifetime.signal.throwIfAborted();
        requestController.signal.throwIfAborted();
        setData(z.object({ result: chatPageSchema }).parse(json).result);
        delay = 10000;
      } catch {
        if (lifetime.signal.aborted || requestController.signal.aborted) return;
        setNotice(
          ar
            ? 'الاتصال متوقف مؤقتاً. الرسائل المعروضة قديمة؛ أعد التحديث.'
            : 'Connection paused. Displayed messages may be stale; refresh to reconnect.',
        );
        delay = Math.min(60000, delay * 2);
      }
      if (!muted)
        timer = setTimeout(() => {
          void load();
        }, delay);
    }
    function visibility() {
      if (timer) clearTimeout(timer);
      controller?.abort();
      if (!document.hidden) void load();
    }
    void load();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      lifetime.abort();
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [competitionId, groupId, before, refresh, muted, ar]);
  async function send(command: ChatCommand) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const parsed = chatCommandSchema.parse(command);
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        const e = z.object({ code: z.string() }).safeParse(json);
        setNotice(
          commandError(e.success ? e.data.code : 'request-unconfirmed', locale),
        );
        setRetry(response.status >= 500 ? command : null);
        if (response.status === 401 || response.status === 403) setData(null);
        return;
      }
      z.object({ result: chatCommandResultSchema }).parse(json);
      setRetry(null);
      if (command.kind === 'post') {
        setBody('');
        postRef.current = null;
        setBefore(null);
      }
      setNotice(ar ? 'تم الحفظ.' : 'Saved.');
      setRefresh((v) => v + 1);
    } catch {
      setRetry(command);
      setNotice(
        ar
          ? 'تعذّر التأكيد؛ أعد نفس الطلب لتجنب التكرار.'
          : 'Not confirmed. Retry the same request to avoid duplicates.',
      );
    } finally {
      setBusy(false);
    }
  }
  const common = { competitionId, groupId };
  function post(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const previous = postRef.current;
    const command =
      previous?.kind === 'post' && previous.body === body
        ? previous
        : {
            ...common,
            kind: 'post' as const,
            commandId: crypto.randomUUID(),
            body,
          };
    postRef.current = command;
    void send(command);
  }
  return (
    <div className="chat-room">
      <p role="status" className="chat-notice">
        {notice}
      </p>
      {retry && (
        <button
          className="button-outline"
          disabled={busy}
          onClick={() => {
            void send(retry);
          }}
        >
          {ar ? 'إعادة نفس الطلب' : 'Retry same request'}
        </button>
      )}
      {data && (
        <>
          <div className="chat-toolbar">
            <button
              className="button-outline"
              onClick={() => {
                setRefresh((v) => v + 1);
              }}
            >
              {ar ? 'تحديث' : 'Refresh'}
            </button>
            <button
              className="button-outline"
              disabled={busy}
              onClick={() => {
                void send({
                  ...common,
                  commandId: crypto.randomUUID(),
                  kind: 'mute',
                  muted: !data.muted,
                });
              }}
            >
              {data.muted
                ? ar
                  ? 'استئناف التحديث التلقائي'
                  : 'Unmute room'
                : ar
                  ? 'كتم الغرفة'
                  : 'Mute room'}
            </button>
            {data.canModerate && (
              <Link href={`/${locale}/groups/${groupId}/moderation`}>
                {ar ? 'إدارة الغرفة ↗' : 'Manage room ↗'}
              </Link>
            )}
          </div>
          <p className="chat-policy">
            {ar
              ? 'الرسائل نصوص فقط وتنتهي بعد ٩٠ يوماً. أدلة البلاغات محفوظة للمراجعين ١٨٠ يوماً. الحظر يخفي الرسائل عنك ولا يمنع الآخرين من قراءة رسائلك.'
              : 'Plain text only. Messages expire after 90 days; report evidence is restricted to reviewers for 180 days. Blocking hides messages from your view; others can still read your messages.'}
          </p>
          {data.muted && (
            <p>
              {ar
                ? 'التحديث التلقائي متوقف في هذه الغرفة. استخدم تحديث لعرض الجديد.'
                : 'Automatic updates are paused in this room. Refresh to see new messages.'}
            </p>
          )}
          {!data.settings.enabled ? (
            <div className="chat-empty">
              {ar
                ? 'الغرفة غير مفعّلة. يمكن للمنظّم تشغيلها.'
                : 'This room is disabled. The organizer can enable it.'}
            </div>
          ) : (
            <>
              <div className="chat-toolbar">
                {data.hasOlder && (
                  <button
                    className="button-outline"
                    onClick={() => {
                      setBefore(data.messages[0]?.sequence ?? null);
                    }}
                  >
                    {ar ? 'رسائل أقدم' : 'Older messages'}
                  </button>
                )}
                {before && (
                  <button
                    className="button-outline"
                    onClick={() => {
                      setBefore(null);
                    }}
                  >
                    {ar ? 'أحدث الرسائل' : 'Latest messages'}
                  </button>
                )}
              </div>
              <ol
                className="chat-messages"
                aria-label={ar ? 'رسائل المجموعة' : 'Group messages'}
              >
                {data.messages.map((message) => (
                  <li
                    className={
                      message.accountId === accountId
                        ? 'chat-message chat-own'
                        : 'chat-message'
                    }
                    key={message.id}
                  >
                    <header>
                      <strong>
                        <bdi>{message.displayName}</bdi>
                      </strong>
                      <time dateTime={message.createdAt}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: 'Africa/Cairo',
                        }).format(new Date(message.createdAt))}
                      </time>
                    </header>
                    <p dir="auto">
                      {message.removed
                        ? ar
                          ? 'أُزيلت الرسالة.'
                          : 'Message removed.'
                        : message.body}
                    </p>
                    {!message.removed && (
                      <div className="chat-message-actions">
                        {message.accountId === accountId ? (
                          <button
                            disabled={busy}
                            onClick={() => {
                              void send({
                                ...common,
                                commandId: crypto.randomUUID(),
                                kind: 'delete',
                                messageId: message.id,
                              });
                            }}
                          >
                            {ar ? 'حذف رسالتي' : 'Delete my message'}
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => {
                                void send({
                                  ...common,
                                  commandId: crypto.randomUUID(),
                                  kind: 'block',
                                  accountId: message.accountId,
                                  blocked: true,
                                });
                              }}
                            >
                              {ar ? 'حظر الرسائل' : 'Block messages'}
                            </button>
                            <details>
                              <summary>{ar ? 'إبلاغ' : 'Report'}</summary>
                              <form
                                className="group-form"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const reason = new FormData(
                                    e.currentTarget,
                                  ).get('reason');
                                  if (typeof reason === 'string')
                                    void send({
                                      ...common,
                                      commandId: crypto.randomUUID(),
                                      kind: 'report',
                                      messageId: message.id,
                                      reason,
                                    });
                                }}
                              >
                                <label>
                                  {ar ? 'سبب البلاغ' : 'Report reason'}
                                  <textarea
                                    name="reason"
                                    required
                                    minLength={5}
                                    maxLength={1000}
                                  />
                                </label>
                                <button
                                  className="button-outline"
                                  disabled={busy}
                                >
                                  {ar ? 'إرسال البلاغ' : 'Submit report'}
                                </button>
                              </form>
                            </details>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {data.messages.length === 0 && (
                <p className="chat-empty">
                  {ar
                    ? 'ابدأ الكلام عن الجولة.'
                    : 'Start the gameweek conversation.'}
                </p>
              )}
              {data.timeoutUntil ? (
                <p>
                  {ar ? 'إرسال الرسائل موقوف حتى' : 'Posting paused until'}{' '}
                  <bdi>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Africa/Cairo',
                    }).format(new Date(data.timeoutUntil))}
                  </bdi>
                </p>
              ) : (
                <form className="group-form chat-composer" onSubmit={post}>
                  <label>
                    {ar ? 'رسالتك' : 'Your message'}
                    <textarea
                      value={body}
                      onChange={(e) => {
                        setBody(e.target.value);
                      }}
                      maxLength={data.settings.maximumLength}
                      required
                      rows={3}
                    />
                  </label>
                  <div className="chat-toolbar">
                    <span>
                      <bdi dir="ltr">
                        {body.length} / {data.settings.maximumLength}
                      </bdi>
                    </span>
                    <button
                      className="button-solid"
                      disabled={busy || !body.trim()}
                    >
                      {busy
                        ? ar
                          ? 'جارٍ الإرسال…'
                          : 'Sending…'
                        : ar
                          ? 'إرسال'
                          : 'Send message'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {data.blocked.length > 0 && (
            <details>
              <summary>
                {ar ? 'الحسابات المحظورة' : 'Blocked accounts'} (
                {data.blocked.length})
              </summary>
              {data.blocked.map((b) => (
                <div className="chat-toolbar" key={b.accountId}>
                  <bdi>{b.displayName}</bdi>
                  <button
                    className="button-outline"
                    disabled={busy}
                    onClick={() => {
                      void send({
                        ...common,
                        kind: 'block',
                        commandId: crypto.randomUUID(),
                        accountId: b.accountId,
                        blocked: false,
                      });
                    }}
                  >
                    {ar ? 'إلغاء الحظر' : 'Unblock'}
                  </button>
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}
