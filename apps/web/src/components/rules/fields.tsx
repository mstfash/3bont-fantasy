'use client';
import { useId } from 'react';
import type { Locale } from '@/lib/brand';
import { ruleHelpText, type RuleHelpKey } from '@/lib/help/rule-help';
import { InfoTip } from '../help/info-tip';
export function RuleNumber({
  locale,
  helpKey,
  label,
  value,
  onChange,
  min = 0,
  max = 10000,
  step = 1,
  disabled = false,
}: {
  readonly locale: Locale;
  readonly helpKey: RuleHelpKey;
  readonly label: string;
  readonly value: number;
  readonly onChange: (value: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="help-field">
      <div className="help-field-heading">
        <label htmlFor={id}>{label}</label>
        <InfoTip
          locale={locale}
          label={label}
          text={`${ruleHelpText(helpKey, locale)} ${locale === 'ar' ? 'القيمة في النموذج:' : 'Value in this form:'} ${value.toLocaleString(locale)}${disabled ? (locale === 'ar' ? ' — هذا الحقل ثابت لهذه البطولة.' : ' — This field is frozen for this competition.') : ''}`}
        />
      </div>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next) && next >= min && next <= max)
            onChange(next);
        }}
      />
    </div>
  );
}
export function RuleToggle({
  locale,
  helpKey,
  label,
  checked,
  onChange,
  disabled = false,
}: {
  readonly locale: Locale;
  readonly helpKey: RuleHelpKey;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <div className="help-toggle">
      <label className="confirmation-check">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
        />
        {label}
      </label>
      <InfoTip
        locale={locale}
        label={label}
        text={`${ruleHelpText(helpKey, locale)} ${locale === 'ar' ? 'في النموذج:' : 'In this form:'} ${checked ? (locale === 'ar' ? 'مفعّل' : 'Enabled') : locale === 'ar' ? 'غير مفعّل' : 'Disabled'}`}
      />
    </div>
  );
}
