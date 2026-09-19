'use client';
import type { ReactNode } from 'react';
import {
  groupCommandSchema,
  groupCommandResultSchema,
  type GroupCommand,
  type GroupCommandResult,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ReviewedCommandForm } from '../reviewed-command-form';
export function ReviewedGroupForm(props: {
  readonly locale: Locale;
  readonly children: ReactNode;
  readonly makeCommand: (form: FormData) => unknown;
  readonly onSaved: (result: GroupCommandResult, command: GroupCommand) => void;
  readonly label: string;
}) {
  return (
    <ReviewedCommandForm
      {...props}
      commandSchema={groupCommandSchema}
      resultSchema={groupCommandResultSchema}
      endpoint="/api/v1/groups"
      successNotice={(result) =>
        result.membership === 'pending'
          ? props.locale === 'ar'
            ? 'طلب الانضمام ينتظر موافقة المنظّم.'
            : 'Your request is waiting for organizer approval.'
          : props.locale === 'ar'
            ? 'تم الحفظ.'
            : 'Saved.'
      }
    />
  );
}
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
export function newInvitationToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export interface OwnedGroupEntry {
  readonly id: string;
  readonly name: string;
}
