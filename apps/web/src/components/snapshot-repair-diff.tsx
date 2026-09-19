import type { SnapshotRepair } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
type Snapshot = SnapshotRepair['snapshot'];
export function SnapshotRepairDiff({
  locale,
  before,
  after,
  names,
}: {
  readonly locale: Locale;
  readonly before: Snapshot | null;
  readonly after: Snapshot;
  readonly names: Readonly<Record<string, string>>;
}) {
  const ar = locale === 'ar';
  const name = (id: string | null | undefined) =>
    id ? (names[id] ?? id) : '—';
  const rows: { label: string; value: (snapshot: Snapshot) => string }[] = [
    {
      label: ar ? 'الأساسيون' : 'Starting lineup',
      value: (s) => s.roster.starterIds.map(name).join(' · '),
    },
    {
      label: ar ? 'ترتيب الاحتياط' : 'Bench order',
      value: (s) => s.roster.reserveIds.map(name).join(' · '),
    },
    {
      label: ar ? 'الكابتن' : 'Captain',
      value: (s) => name(s.roster.captaincy?.captainId),
    },
    {
      label: ar ? 'نائب الكابتن' : 'Vice-captain',
      value: (s) => name(s.roster.captaincy?.viceCaptainId),
    },
    {
      label: ar ? 'المملوكون وأسعار الشراء' : 'Holdings and purchase prices',
      value: (s) =>
        s.roster.holdings
          .map(
            (h) => `${name(h.footballerId)} (${String(h.purchasePrice / 10)})`,
          )
          .join(' · '),
    },
    { label: ar ? 'الرصيد' : 'Bank', value: (s) => String(s.roster.bank / 10) },
    {
      label: ar ? 'خصم الانتقالات' : 'Transfer deduction',
      value: (s) => String(s.transferDeduction / 1000),
    },
    {
      label: ar ? 'الشيب' : 'Chip',
      value: (s) =>
        s.chip
          ? {
              wildcard: ar ? 'وايلدكارد' : 'Wildcard',
              'free-hit': ar ? 'فري هيت' : 'Free Hit',
              'bench-boost': ar ? 'بنش بوست' : 'Bench Boost',
              'triple-captain': ar ? 'تريبل كابتن' : 'Triple Captain',
            }[s.chip]
          : '—',
    },
  ];
  return (
    <section className="admin-panel">
      <h2>
        {ar ? 'الاختيارات المسجلة والمستعادة' : 'Recorded and restored choices'}
      </h2>
      {!before && (
        <p role="alert">
          {ar
            ? 'السجل الأصلي غير صالح للقراءة وسيبقى محفوظاً للتحقيق.'
            : 'The original record is unreadable and will remain preserved for investigation.'}
        </p>
      )}
      <div className="admin-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{ar ? 'الاختيار' : 'Choice'}</th>
              <th>{ar ? 'قبل الإصلاح' : 'Before repair'}</th>
              <th>{ar ? 'من الأمر المقبول' : 'From accepted command'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th>{r.label}</th>
                <td>{before ? r.value(before) : '—'}</td>
                <td>{r.value(after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
