'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  staffCommandSchema,
  staffCommandResultSchema,
  staffRoleSchema,
  type StaffGrantRecord,
  type StaffRole,
} from '@fantasy/contracts';
import { ReviewedCommandForm } from './reviewed-command-form';
import { formText } from './groups/reviewed-form';
import { staffRoleLabels, staffRoleDescriptions } from '@/lib/staff-roles';
import type { Locale } from '@/lib/brand';
import '@/styles/groups.css';
export function StaffGrantEditor({
  locale,
  candidates,
  competitions,
}: {
  readonly locale: Locale;
  readonly candidates: readonly { id: string; displayName: string }[];
  readonly competitions: readonly {
    id: string;
    name: { ar: string; en: string };
  }[];
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const [role, setRole] = useState<StaffRole>('support-viewer');
  const global = role === 'owner' || role === 'data-steward';
  return (
    <ReviewedCommandForm
      locale={locale}
      endpoint="/api/v1/admin/staff"
      commandSchema={staffCommandSchema}
      resultSchema={staffCommandResultSchema}
      label={ar ? 'مراجعة منح الصلاحية' : 'Review role grant'}
      onSaved={() => {
        router.refresh();
      }}
      makeCommand={(form) => ({
        kind: 'grant',
        commandId: crypto.randomUUID(),
        accountId: formText(form, 'accountId'),
        role,
        competitionId: global ? null : formText(form, 'competitionId') || null,
        reason: formText(form, 'reason'),
      })}
    >
      <label>
        {ar ? 'الحساب' : 'Account'}
        <select
          name="accountId"
          required
          aria-label={ar ? 'الحساب' : 'Account'}
          defaultValue=""
        >
          <option value="" disabled>
            {ar ? 'اختر حساباً من نتائج البحث' : 'Choose a search result'}
          </option>
          {candidates.map((c) => (
            <option value={c.id} key={c.id}>
              {c.displayName} — {c.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        {ar ? 'الدور' : 'Role'}
        <select
          value={role}
          onChange={(e) => {
            setRole(staffRoleSchema.parse(e.target.value));
          }}
          aria-label={ar ? 'الدور' : 'Role'}
        >
          {staffRoleSchema.options.map((r) => (
            <option key={r} value={r}>
              {staffRoleLabels[r][locale]}
            </option>
          ))}
        </select>
      </label>
      <p>{staffRoleDescriptions[role][locale]}</p>
      <label>
        {ar ? 'النطاق' : 'Scope'}
        <select
          name="competitionId"
          key={global ? 'global' : 'scoped'}
          disabled={global}
          defaultValue={global ? '' : 'select'}
          required
          aria-label={ar ? 'النطاق' : 'Scope'}
        >
          {!global && (
            <option value="select" disabled>
              {ar ? 'اختر النطاق' : 'Choose scope'}
            </option>
          )}
          <option value="">
            {ar ? 'جميع البطولات / المنصة' : 'All competitions / platform'}
          </option>
          {!global &&
            competitions.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name[locale]}
              </option>
            ))}
        </select>
      </label>
      <label>
        {ar ? 'سبب منح الصلاحية' : 'Reason for granting access'}
        <textarea name="reason" required minLength={5} maxLength={1000} />
      </label>
      <p>
        {ar
          ? 'يلزم بريد مؤكّد لكل مسؤول. يجب تفعيل المصادقة الثنائية مسبقاً لمنح دور المالك، ويتحقق كل مسؤول منها قبل استخدام الإدارة.'
          : 'The account must have verified email. Owners must already have two-factor authentication enabled; all staff must verify it before using their access.'}
      </p>
    </ReviewedCommandForm>
  );
}
export function StaffRevokeEditor({
  locale,
  grant,
  name,
}: {
  readonly locale: Locale;
  readonly grant: StaffGrantRecord;
  readonly name: string;
}) {
  const ar = locale === 'ar',
    router = useRouter();
  return (
    <details>
      <summary>{ar ? 'سحب الصلاحية' : 'Revoke access'}</summary>
      <ReviewedCommandForm
        locale={locale}
        endpoint="/api/v1/admin/staff"
        commandSchema={staffCommandSchema}
        resultSchema={staffCommandResultSchema}
        label={ar ? 'مراجعة السحب' : 'Review revocation'}
        onSaved={() => {
          router.refresh();
        }}
        makeCommand={(form) => ({
          kind: 'revoke',
          commandId: crypto.randomUUID(),
          grantId: grant.id,
          reason: formText(form, 'reason'),
        })}
      >
        <p>
          {name} · {staffRoleLabels[grant.role][locale]}
        </p>
        <label>
          {ar ? 'سبب سحب الصلاحية' : 'Reason for revoking access'}
          <textarea name="reason" required minLength={5} maxLength={1000} />
        </label>
      </ReviewedCommandForm>
    </details>
  );
}
