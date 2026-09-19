import type { StaffRole } from '@fantasy/contracts';
import type { Locale } from './brand';
export const staffRoleLabels: Record<StaffRole, Record<Locale, string>> = {
  owner: { ar: 'مالك المنصة', en: 'Platform owner' },
  'competition-manager': { ar: 'مدير البطولات', en: 'Competition manager' },
  'data-steward': { ar: 'مسؤول بيانات كرة القدم', en: 'Football data steward' },
  moderator: { ar: 'مشرف المحتوى', en: 'Moderator' },
  'prize-manager': { ar: 'مدير الجوائز', en: 'Prize manager' },
  'prize-approver': { ar: 'معتمد الجوائز', en: 'Prize approver' },
  'sponsor-manager': { ar: 'مدير الرعاة', en: 'Sponsor manager' },
  'support-viewer': { ar: 'دعم للقراءة فقط', en: 'Support viewer' },
};
export const staffRoleDescriptions: Record<
  StaffRole,
  Record<Locale, string>
> = {
  owner: {
    ar: 'إدارة الصلاحيات وكل عمليات المنصة؛ سلطة عامة على جميع البطولات.',
    en: 'Manage staff permissions and all platform operations across competitions.',
  },
  'competition-manager': {
    ar: 'إعداد البطولات والقواعد والجداول والأسعار، وعرض العمليات.',
    en: 'Configure competitions, rules, schedules and prices; read operations.',
  },
  'data-steward': {
    ar: 'تعديل الحقائق المشتركة للاعبين والمباريات في جميع البطولات.',
    en: 'Edit shared footballer and match facts across all competitions.',
  },
  moderator: {
    ar: 'مراجعة التقارير والإشراف على محتوى المجتمع.',
    en: 'Review reports and moderate community content.',
  },
  'prize-manager': {
    ar: 'إعداد مقترحات الجوائز وتسجيل تسليمها. الاعتماد يتطلب حساباً آخر.',
    en: 'Prepare prize proposals and record fulfillment. Approval requires another account.',
  },
  'prize-approver': {
    ar: 'مراجعة واعتماد الجوائز؛ لا يسمح باعتماد الجوائز التي أعدها نفس الحساب.',
    en: 'Review and approve awards; cannot approve awards prepared by the same account.',
  },
  'sponsor-manager': {
    ar: 'إدارة حملات الرعاية والمواد المعتمدة.',
    en: 'Manage sponsor campaigns and approved assets.',
  },
  'support-viewer': {
    ar: 'قراءة العمليات داخل النطاق المحدد دون تعديل الفرق أو النتائج.',
    en: 'Read operations within scope without changing squads or results.',
  },
};
