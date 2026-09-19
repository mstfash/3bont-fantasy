'use client';
import { useRouter } from 'next/navigation';
import {
  chatModerationCommandSchema,
  chatCommandResultSchema,
  type ChatSettings,
} from '@fantasy/contracts';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText } from '../groups/reviewed-form';
import type { Locale } from '@/lib/brand';
export function ChatSettingsEditor({
  locale,
  competitionId,
  groupId,
  settings,
  staff,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly groupId: string;
  readonly settings: ChatSettings;
  readonly staff: boolean;
}) {
  const ar = locale === 'ar',
    router = useRouter();
  return (
    <ReviewedCommandForm
      locale={locale}
      label={ar ? 'مراجعة إعدادات الغرفة' : 'Review room settings'}
      endpoint={staff ? '/api/v1/admin/chat' : '/api/v1/chat/moderation'}
      commandSchema={chatModerationCommandSchema}
      resultSchema={chatCommandResultSchema}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        kind: 'configure',
        commandId: crypto.randomUUID(),
        competitionId,
        groupId,
        settings: {
          enabled: form.get('enabled') === 'on',
          revision: settings.revision,
          maximumLength: Number(formText(form, 'maximumLength')),
          burstLimit: Number(formText(form, 'burstLimit')),
          hourlyLimit: Number(formText(form, 'hourlyLimit')),
        },
        reason: formText(form, 'reason'),
      })}
    >
      <label className="confirmation-check">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={settings.enabled}
        />
        {ar ? 'تفعيل المحادثة للأعضاء' : 'Enable member conversation'}
      </label>
      <label>
        {ar ? 'أقصى طول للرسالة' : 'Maximum message length'}
        <input
          name="maximumLength"
          type="number"
          min={100}
          max={1000}
          defaultValue={settings.maximumLength}
          required
        />
      </label>
      <div className="form-pair">
        <label>
          {ar ? 'رسائل خلال ١٠ ثوانٍ' : 'Messages per 10 seconds'}
          <input
            name="burstLimit"
            type="number"
            min={1}
            max={10}
            defaultValue={settings.burstLimit}
            required
          />
        </label>
        <label>
          {ar ? 'رسائل خلال ساعة' : 'Messages per hour'}
          <input
            name="hourlyLimit"
            type="number"
            min={1}
            max={120}
            defaultValue={settings.hourlyLimit}
            required
          />
        </label>
      </div>
      <p>
        {ar
          ? 'تُحسب رسائل الحساب عبر كل الغرف لتجنب تجاوز الحد بالتنقل بينها.'
          : 'Account messages count across rooms to prevent bypassing limits by switching rooms.'}
      </p>
      <label>
        {ar ? 'سبب التغيير' : 'Change reason'}
        <textarea name="reason" minLength={5} maxLength={1000} required />
      </label>
    </ReviewedCommandForm>
  );
}
export function ChatModerationAction({
  locale,
  competitionId,
  groupId,
  staff,
  action,
  messageId,
  reportId,
  accountId,
}: {
  readonly locale: Locale;
  readonly competitionId: string;
  readonly groupId: string;
  readonly staff: boolean;
  readonly action: 'remove' | 'resolve-report' | 'timeout';
  readonly messageId?: string;
  readonly reportId?: string;
  readonly accountId?: string;
}) {
  const ar = locale === 'ar',
    router = useRouter(),
    label =
      action === 'remove'
        ? ar
          ? 'إزالة الرسالة'
          : 'Remove message'
        : action === 'timeout'
          ? ar
            ? 'مراجعة إيقاف الإرسال'
            : 'Review posting timeout'
          : ar
            ? 'مراجعة قرار البلاغ'
            : 'Review report decision';
  return (
    <ReviewedCommandForm
      locale={locale}
      label={label}
      endpoint={staff ? '/api/v1/admin/chat' : '/api/v1/chat/moderation'}
      commandSchema={chatModerationCommandSchema}
      resultSchema={chatCommandResultSchema}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        kind: action,
        commandId: crypto.randomUUID(),
        competitionId,
        groupId,
        reason: formText(form, 'reason'),
        ...(action === 'remove'
          ? { messageId }
          : action === 'resolve-report'
            ? { reportId, decision: formText(form, 'decision') }
            : {
                accountId,
                until:
                  Number(formText(form, 'hours')) === 0
                    ? null
                    : new Date(
                        Date.now() + Number(formText(form, 'hours')) * 3600_000,
                      ).toISOString(),
              }),
      })}
    >
      {action === 'resolve-report' && (
        <label>
          {ar ? 'قرار البلاغ' : 'Report decision'}
          <select name="decision">
            <option value="actioned">
              {ar ? 'تم اتخاذ إجراء' : 'Action taken'}
            </option>
            <option value="dismissed">
              {ar ? 'لا يستلزم إجراءً' : 'No action required'}
            </option>
          </select>
        </label>
      )}
      {action === 'timeout' && (
        <label>
          {ar ? 'مدة إيقاف الإرسال' : 'Posting timeout duration'}
          <select name="hours">
            <option value="1">{ar ? 'ساعة واحدة' : '1 hour'}</option>
            <option value="24">{ar ? '٢٤ ساعة' : '24 hours'}</option>
            <option value="168">{ar ? '٧ أيام' : '7 days'}</option>
            <option value="0">{ar ? 'إلغاء الإيقاف' : 'Lift timeout'}</option>
          </select>
        </label>
      )}
      <label>
        {ar ? 'سبب الإجراء' : 'Action reason'}
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </label>
    </ReviewedCommandForm>
  );
}
