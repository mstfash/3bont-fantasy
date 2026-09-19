'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { readProviderIdentityAdministration } from '@fantasy/application';
import {
  providerIdentityCommandSchema,
  providerIdentityResultSchema,
  type ProviderIdentity,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from '../reviewed-command-form';
import { formText } from '../groups/reviewed-form';
type Info = Awaited<ReturnType<typeof readProviderIdentityAdministration>>;
export function ProviderIdentityControls({
  locale,
  info,
}: {
  readonly locale: Locale;
  readonly info: Info;
}) {
  const ar = locale === 'ar',
    router = useRouter(),
    [selected, setSelected] = useState(
      String(info.candidates[0]?.externalId ?? ''),
    );
  if (!info.selectedEvidenceId || !info.candidates.length)
    return (
      <p>
        {ar
          ? 'يلزم دليل ناجح صالح يحتوي المعرّفات المطلوبة.'
          : 'Successful, valid source evidence containing the required IDs is needed.'}
      </p>
    );
  const current = info.mappings.find((m) => String(m.externalId) === selected);
  return (
    <ReviewedCommandForm
      locale={locale}
      label={ar ? 'مراجعة ربط الهوية' : 'REVIEW IDENTITY MAPPING'}
      endpoint="/api/v1/admin/providers/identities"
      commandSchema={providerIdentityCommandSchema}
      resultSchema={providerIdentityResultSchema}
      makeCommand={(form) =>
        info.binding
          ? {
              kind: 'map-entity',
              commandId: crypto.randomUUID(),
              bindingId: info.binding.id,
              entityKind: info.kind,
              externalId: Number(formText(form, 'externalId')),
              entityId: formText(form, 'entityId'),
              expectedRevision: current?.revision ?? 0,
              targetChangeReviewed: form.has('targetChangeReviewed'),
              evidenceId: info.selectedEvidenceId,
              reason: formText(form, 'reason'),
            }
          : {
              kind: 'bind-season',
              commandId: crypto.randomUUID(),
              seasonId: formText(form, 'seasonId'),
              leagueId: Number(formText(form, 'externalId')),
              seasonYear: info.selectedYear,
              evidenceId: info.selectedEvidenceId,
              rightsReference: formText(form, 'rightsReference'),
              reason: formText(form, 'reason'),
            }
      }
      onSaved={(result) => {
        if (!info.binding)
          router.push(
            `/${locale}/admin/providers/identities?binding=${result.binding.id}&kind=club`,
          );
        else router.refresh();
      }}
    >
      <label>
        {ar ? 'هوية المزود من الدليل' : 'Provider identity from evidence'}
        <select
          name="externalId"
          value={selected}
          onChange={(event) => {
            setSelected(event.currentTarget.value);
          }}
        >
          {info.candidates.map((c) => (
            <option key={c.externalId} value={c.externalId}>
              {c.label} · {c.externalId}
            </option>
          ))}
        </select>
      </label>
      {info.binding ? (
        <>
          <label>
            {ar ? 'السجل المقابل في التطبيق' : 'Matching app record'}
            <select
              key={selected}
              name="entityId"
              defaultValue={current?.entityId ?? info.targets[0]?.id ?? ''}
              required
            >
              {info.targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name[locale]}
                </option>
              ))}
            </select>
          </label>
          <p>
            {ar ? 'الربط الحالي' : 'Current mapping'}:{' '}
            {current
              ? `${info.targets.find((t) => t.id === current.entityId)?.name[locale] ?? current.entityId} · v${String(current.revision)} · ${current.state === 'active' ? (ar ? 'فعّال' : 'Active') : ar ? 'متقاعد' : 'Retired'}`
              : ar
                ? 'غير مرتبط'
                : 'Unmapped'}
          </p>
          <label className="confirmation-check">
            <input type="checkbox" name="targetChangeReviewed" />
            {ar
              ? 'راجعت تغيير السجل المقابل؛ تصحيح البيانات التاريخية إجراء مستقل.'
              : 'I reviewed any target change; correcting historical data is a separate action.'}
          </label>
        </>
      ) : (
        <>
          <label>
            {ar ? 'موسم التطبيق' : 'App season'}
            <select name="seasonId" required>
              {info.seasons
                .filter((s) => !info.bindings.some((b) => b.seasonId === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name[locale]}
                    {s.synthetic ? (ar ? ' · تجريبي' : ' · Synthetic') : ''}
                  </option>
                ))}
            </select>
          </label>
          <p>
            {ar ? 'مفتاح موسم المزود' : 'Provider season key'}:{' '}
            {info.selectedYear}
          </p>
          <label>
            {ar
              ? 'مرجع السماح باستخدام المصدر'
              : 'Source-use authorization reference'}
            <input
              name="rightsReference"
              required
              minLength={5}
              maxLength={1000}
            />
          </label>
        </>
      )}
      <label>
        {ar ? 'سبب الربط والمراجعة' : 'Mapping review reason'}
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </label>
    </ReviewedCommandForm>
  );
}
export function RetireProviderIdentity({
  locale,
  mapping,
}: {
  readonly locale: Locale;
  readonly mapping: ProviderIdentity;
}) {
  const router = useRouter(),
    ar = locale === 'ar';
  return (
    <details>
      <summary>{ar ? 'إيقاف الربط' : 'Retire mapping'}</summary>
      <ReviewedCommandForm
        locale={locale}
        label={ar ? 'مراجعة إيقاف الربط' : 'REVIEW MAPPING RETIREMENT'}
        endpoint="/api/v1/admin/providers/identities"
        commandSchema={providerIdentityCommandSchema}
        resultSchema={providerIdentityResultSchema}
        makeCommand={(form) => ({
          kind: 'retire-entity',
          commandId: crypto.randomUUID(),
          mappingId: mapping.id,
          expectedRevision: mapping.revision,
          reason: formText(form, 'reason'),
        })}
        onSaved={() => {
          router.refresh();
        }}
      >
        <p>
          {ar
            ? 'يبقى سجل الإصدارات، ويتوقف استخدام هذا الربط في الاستيرادات الجديدة حتى إعادة ربطه.'
            : 'Version history remains. New imports must wait for a replacement or reactivated mapping.'}
        </p>
        <label>
          {ar ? 'سبب الإيقاف' : 'Retirement reason'}
          <input name="reason" required minLength={5} maxLength={1000} />
        </label>
      </ReviewedCommandForm>
    </details>
  );
}
