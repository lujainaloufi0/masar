/**
 * Fictional demo organization. Every name, ID and task here is invented.
 * Dates are relative to the moment the seed runs, so the demo always looks current.
 */
import type { Role } from '@masar/shared';

type Pair = [en: string, ar: string];

export const ORG = { nameEn: 'Al-Waha Development Authority', nameAr: 'هيئة تطوير الواحة', idPrefix: 'WDA' };

export const DEPARTMENTS: { key: string; name: Pair; color: string; head: string }[] = [
  { key: 'exec', name: ['Executive Office', 'المكتب التنفيذي'], color: '#5E6B66', head: 'u1' },
  { key: 'it', name: ['Information Technology', 'تقنية المعلومات'], color: '#2E7D68', head: 'u3' },
  { key: 'hr', name: ['Human Resources', 'الموارد البشرية'], color: '#7A68A6', head: 'u16' },
  { key: 'fin', name: ['Finance', 'المالية'], color: '#AD7B2A', head: 'u10' },
  { key: 'proc', name: ['Procurement', 'المشتريات'], color: '#4B79A8', head: 'u12' },
  { key: 'comm', name: ['Corporate Communications', 'الاتصال المؤسسي'], color: '#A0566E', head: 'u14' },
];

export const GROUPS: { key: string; dept: string; name: Pair }[] = [
  { key: 'g_pmo', dept: 'exec', name: ['Project Office', 'مكتب إدارة المشاريع'] },
  { key: 'g_plat', dept: 'it', name: ['Platforms', 'المنصات'] },
  { key: 'g_desk', dept: 'it', name: ['Service Desk', 'مكتب الخدمة'] },
  { key: 'g_sec', dept: 'it', name: ['Cybersecurity', 'الأمن السيبراني'] },
  { key: 'g_hrops', dept: 'hr', name: ['HR Operations', 'عمليات الموارد البشرية'] },
  { key: 'g_tal', dept: 'hr', name: ['Talent', 'استقطاب المواهب'] },
  { key: 'g_rep', dept: 'fin', name: ['Financial Reporting', 'التقارير المالية'] },
  { key: 'g_bud', dept: 'fin', name: ['Budgeting', 'الميزانية'] },
  { key: 'g_ct', dept: 'proc', name: ['Contracts', 'العقود'] },
  { key: 'g_dig', dept: 'comm', name: ['Digital Channels', 'القنوات الرقمية'] },
];

export interface SeedUser {
  key: string;
  num: string;
  name: Pair;
  role: Role;
  dept: string;
  groups: string[];
  title: Pair;
  pending?: boolean;
  active?: boolean;
  joinedDaysAgo?: number;
  leftDaysAgo?: number;
}

export const USERS: SeedUser[] = [
  { key: 'u1', num: '10001', name: ['Noura Al-Qahtani', 'نورة القحطاني'], role: 'admin', dept: 'exec', groups: ['g_pmo'], title: ['Director of Operations', 'مديرة العمليات'] },
  { key: 'u2', num: '10214', name: ['Faisal Al-Harbi', 'فيصل الحربي'], role: 'hr', dept: 'hr', groups: ['g_hrops'], title: ['HR Business Partner', 'شريك أعمال الموارد البشرية'] },
  { key: 'u3', num: '10377', name: ['Reem Al-Otaibi', 'ريم العتيبي'], role: 'manager', dept: 'it', groups: ['g_plat', 'g_desk', 'g_sec'], title: ['Head of IT', 'رئيسة تقنية المعلومات'] },
  { key: 'u4', num: '10482', name: ['Omar Al-Shehri', 'عمر الشهري'], role: 'member', dept: 'it', groups: ['g_plat'], title: ['Systems Engineer', 'مهندس أنظمة'] },
  { key: 'u5', num: '10493', name: ['Sara Al-Dosari', 'سارة الدوسري'], role: 'member', dept: 'it', groups: ['g_plat'], title: ['Cloud Engineer', 'مهندسة حوسبة سحابية'] },
  { key: 'u6', num: '10511', name: ['Khalid Al-Mutairi', 'خالد المطيري'], role: 'member', dept: 'it', groups: ['g_desk'], title: ['Service Desk Lead', 'قائد مكتب الخدمة'] },
  { key: 'u7', num: '10526', name: ['Lama Al-Zahrani', 'لمى الزهراني'], role: 'member', dept: 'it', groups: ['g_desk'], title: ['Support Analyst', 'محللة دعم فني'] },
  { key: 'u8', num: '10540', name: ['Yousef Al-Ghamdi', 'يوسف الغامدي'], role: 'member', dept: 'it', groups: ['g_sec'], title: ['Security Analyst', 'محلل أمن سيبراني'] },
  { key: 'u9', num: '10555', name: ['Hind Al-Shammari', 'هند الشمري'], role: 'member', dept: 'it', groups: ['g_sec'], title: ['Security Engineer', 'مهندسة أمن سيبراني'] },
  { key: 'u10', num: '10302', name: ['Abdullah Al-Rashid', 'عبدالله الراشد'], role: 'manager', dept: 'fin', groups: ['g_rep', 'g_bud'], title: ['Head of Finance', 'رئيس المالية'] },
  { key: 'u11', num: '10611', name: ['Mona Al-Juhani', 'منى الجهني'], role: 'member', dept: 'fin', groups: ['g_rep'], title: ['Financial Analyst', 'محللة مالية'] },
  { key: 'u12', num: '10325', name: ['Turki Al-Anazi', 'تركي العنزي'], role: 'manager', dept: 'proc', groups: ['g_ct'], title: ['Head of Procurement', 'رئيس المشتريات'] },
  { key: 'u13', num: '10640', name: ['Nada Al-Subaie', 'ندى السبيعي'], role: 'member', dept: 'proc', groups: ['g_ct'], title: ['Contracts Specialist', 'أخصائية عقود'] },
  { key: 'u14', num: '10350', name: ['Majed Al-Malki', 'ماجد المالكي'], role: 'manager', dept: 'comm', groups: ['g_dig'], title: ['Head of Communications', 'رئيس الاتصال المؤسسي'] },
  { key: 'u15', num: '10672', name: ['Ghada Al-Hazmi', 'غادة الحازمي'], role: 'member', dept: 'comm', groups: ['g_dig'], title: ['Content Specialist', 'أخصائية محتوى'] },
  { key: 'u16', num: '10230', name: ['Rakan Al-Balawi', 'راكان البلوي'], role: 'manager', dept: 'hr', groups: ['g_hrops', 'g_tal'], title: ['Head of HR', 'رئيس الموارد البشرية'] },
  { key: 'u17', num: '10690', name: ['Asma Al-Shahrani', 'أسماء الشهراني'], role: 'member', dept: 'hr', groups: ['g_tal'], title: ['Talent Officer', 'أخصائية استقطاب'], pending: true, joinedDaysAgo: 2 },
  { key: 'u18', num: '10418', name: ['Bader Al-Qarni', 'بدر القرني'], role: 'member', dept: 'it', groups: ['g_desk'], title: ['Support Technician', 'فني دعم'], active: false, leftDaysAgo: 18 },
  { key: 'u19', num: '10701', name: ['Hessa Al-Mansour', 'حصة المنصور'], role: 'member', dept: 'fin', groups: ['g_bud'], title: ['Budget Analyst', 'محللة ميزانية'], joinedDaysAgo: 9 },
];

/** Accounts offered as one-click sign-in on the public demo, in display order. */
export const DEMO_ACCOUNTS: { key: string; note?: 'newHire' }[] = [
  { key: 'u4' },
  { key: 'u3' },
  { key: 'u2' },
  { key: 'u1' },
  { key: 'u17', note: 'newHire' },
];

export interface SeedTask {
  key: string;
  dept: string;
  group: string;
  by: string;
  assignees: string[];
  created: number;
  due: number;
  completed?: number;
  title: Pair;
  desc?: Pair;
  steps: Pair[];
  doneCount: number;
  doneBy: string[];
  baseDay: number;
}

const GENERIC_STEPS: Pair[] = [['Plan', 'التخطيط'], ['Do the work', 'التنفيذ'], ['Review and close', 'المراجعة والإغلاق']];

export const TASKS: SeedTask[] = [
  // ---- IT, active
  { key: 't100', dept: 'it', group: 'g_plat', by: 'u3', assignees: ['u4', 'u5'], created: -9, due: 6,
    title: ['Move the e-services portal to the new identity provider', 'نقل بوابة الخدمات الإلكترونية إلى مزوّد الهوية الجديد'],
    desc: ['Citizens should sign in to the portal through the new national identity provider. Keep the old login running until production traffic is switched.', 'يجب أن يسجّل المستفيدون الدخول إلى البوابة عبر مزوّد الهوية الوطني الجديد، مع إبقاء تسجيل الدخول القديم حتى تحويل حركة الإنتاج.'],
    steps: [
      ['List every app that uses the old login', 'حصر التطبيقات التي تستخدم تسجيل الدخول القديم'],
      ['Configure the SAML connection in staging', 'إعداد اتصال SAML في بيئة الاختبار'],
      ['Test sign-in with 20 pilot users', 'اختبار تسجيل الدخول مع 20 مستخدمًا تجريبيًا'],
      ['Update the help centre article', 'تحديث مقال مركز المساعدة'],
      ['Switch production traffic', 'تحويل حركة الإنتاج'],
      ['Turn off the old login service', 'إيقاف خدمة تسجيل الدخول القديمة'],
    ], doneCount: 3, doneBy: ['u5', 'u4'], baseDay: -8 },
  { key: 't101', dept: 'it', group: 'g_plat', by: 'u3', assignees: ['u4'], created: -5, due: 2,
    title: ['Quarterly backup restore drill', 'تمرين استعادة النسخ الاحتياطية الربعي'],
    desc: ['Prove we can restore critical systems from backup within the four-hour target, and record the actual times.', 'إثبات قدرتنا على استعادة الأنظمة الحرجة من النسخ الاحتياطية خلال أربع ساعات، وتوثيق الأزمنة الفعلية.'],
    steps: [
      ['Pick three systems for the drill', 'اختيار ثلاثة أنظمة للتمرين'],
      ['Restore the HR database to the isolated server', 'استعادة قاعدة بيانات الموارد البشرية إلى الخادم المعزول'],
      ['Restore the document archive', 'استعادة أرشيف الوثائق'],
      ['Check data integrity with the system owners', 'التحقق من سلامة البيانات مع ملاك الأنظمة'],
      ['Record restore times in the drill report', 'تسجيل أزمنة الاستعادة في تقرير التمرين'],
    ], doneCount: 4, doneBy: ['u4'], baseDay: -4 },
  { key: 't102', dept: 'it', group: 'g_sec', by: 'u3', assignees: ['u8', 'u4'], created: -3, due: 10,
    title: ['Renew SSL certificates for public websites', 'تجديد شهادات SSL للمواقع العامة'],
    desc: ['Seven certificates expire before December. Renew them and deploy without downtime.', 'تنتهي سبع شهادات قبل ديسمبر. يجب تجديدها ونشرها دون انقطاع للخدمة.'],
    steps: [
      ['List certificates that expire before December', 'حصر الشهادات التي تنتهي قبل ديسمبر'],
      ['Request renewals from the certificate authority', 'طلب التجديد من جهة إصدار الشهادات'],
      ['Install and test in staging', 'التثبيت والاختبار في بيئة الاختبار'],
      ['Deploy to production in the maintenance window', 'النشر على بيئة الإنتاج خلال نافذة الصيانة'],
    ], doneCount: 1, doneBy: ['u8'], baseDay: -2 },
  { key: 't103', dept: 'it', group: 'g_desk', by: 'u3', assignees: ['u6', 'u7'], created: -6, due: -1,
    title: ['Service desk SLA report for Q3', 'تقرير مستوى الخدمة لمكتب الخدمة للربع الثالث'],
    desc: ['Summarise response and resolution times for the quarter for the executive review.', 'تلخيص أزمنة الاستجابة والحل خلال الربع لمراجعة الإدارة التنفيذية.'],
    steps: [
      ['Export tickets for July to September', 'تصدير البلاغات من يوليو إلى سبتمبر'],
      ['Calculate response and resolution times', 'حساب أزمنة الاستجابة والحل'],
      ['Explain the three biggest delays', 'توضيح أكبر ثلاثة أسباب للتأخير'],
      ['Send the report to the Head of IT', 'إرسال التقرير إلى رئيسة تقنية المعلومات'],
    ], doneCount: 3, doneBy: ['u7', 'u6'], baseDay: -5 },
  { key: 't104', dept: 'it', group: 'g_desk', by: 'u3', assignees: ['u7'], created: -2, due: 14,
    title: ['Laptop refresh for the Finance department', 'تحديث أجهزة الحاسب المحمول لإدارة المالية'],
    desc: ['Replace 14 laptops older than five years with minimal disruption during month-end close.', 'استبدال 14 جهازًا تجاوز عمرها خمس سنوات بأقل تأثير على إقفال نهاية الشهر.'],
    steps: [
      ['Confirm the list of devices with Finance', 'تأكيد قائمة الأجهزة مع المالية'],
      ['Prepare the standard image', 'تجهيز النسخة القياسية للنظام'],
      ['Book handover slots with each employee', 'حجز مواعيد التسليم مع كل موظف'],
      ['Swap devices and move files', 'استبدال الأجهزة ونقل الملفات'],
      ['Wipe and return old devices to stores', 'مسح الأجهزة القديمة وإعادتها للمستودع'],
    ], doneCount: 0, doneBy: [], baseDay: 0 },
  { key: 't105', dept: 'it', group: 'g_sec', by: 'u3', assignees: ['u9', 'u8'], created: -4, due: 4,
    title: ['Quarterly access review for shared drives', 'مراجعة الصلاحيات الربعية للمجلدات المشتركة'],
    desc: ['Each department head confirms who should keep access to their shared folders.', 'يؤكد كل رئيس إدارة من يحتفظ بصلاحية الوصول إلى المجلدات المشتركة الخاصة بإدارته.'],
    steps: [
      ['Export current permissions', 'تصدير الصلاحيات الحالية'],
      ['Send review sheets to department heads', 'إرسال نماذج المراجعة لرؤساء الإدارات'],
      ['Remove access that was not confirmed', 'إزالة الصلاحيات غير المؤكدة'],
      ['File the signed review', 'حفظ المراجعة المعتمدة'],
    ], doneCount: 2, doneBy: ['u9'], baseDay: -3 },
  { key: 't106', dept: 'it', group: 'g_plat', by: 'u3', assignees: ['u5'], created: -1, due: 9,
    title: ['Set up monitoring alerts for the payments gateway', 'إعداد تنبيهات المراقبة لبوابة المدفوعات'],
    desc: ['Alert the on-call engineer when payment errors pass 2% for five minutes.', 'تنبيه المهندس المناوب عند تجاوز أخطاء الدفع 2% لمدة خمس دقائق.'],
    steps: [
      ['Agree alert thresholds with Finance', 'الاتفاق على حدود التنبيه مع المالية'],
      ['Build the dashboards and alerts', 'بناء لوحات المتابعة والتنبيهات'],
      ['Run a test alert with the on-call rota', 'تجربة تنبيه مع جدول المناوبة'],
    ], doneCount: 0, doneBy: [], baseDay: 0 },

  // ---- IT, completed
  { key: 't107', dept: 'it', group: 'g_plat', by: 'u3', assignees: ['u4', 'u5'], created: -40, due: -30, completed: -31,
    title: ['Upgrade the email gateway', 'ترقية بوابة البريد الإلكتروني'],
    desc: ['Move to the supported version before the vendor ends support.', 'الترقية إلى الإصدار المدعوم قبل انتهاء دعم المورّد.'],
    steps: [['Back up gateway settings', 'نسخ إعدادات البوابة احتياطيًا'], ['Upgrade the standby node', 'ترقية العقدة الاحتياطية'], ['Fail over and upgrade the main node', 'التحويل وترقية العقدة الرئيسية']],
    doneCount: 3, doneBy: ['u5', 'u4', 'u4'], baseDay: -38 },
  { key: 't108', dept: 'it', group: 'g_desk', by: 'u3', assignees: ['u6', 'u18'], created: -28, due: -22, completed: -24,
    title: ['Prepare devices for 12 new employees', 'تجهيز أجهزة 12 موظفًا جديدًا'],
    desc: ['Laptops, accounts and badges ready before their first day.', 'تجهيز الأجهزة والحسابات والبطاقات قبل اليوم الأول.'],
    steps: [['Create accounts', 'إنشاء الحسابات'], ['Image and label laptops', 'تجهيز الأجهزة وترقيمها'], ['Hand over on day one', 'التسليم في اليوم الأول']],
    doneCount: 3, doneBy: ['u18', 'u6'], baseDay: -27 },
  { key: 't109', dept: 'it', group: 'g_sec', by: 'u3', assignees: ['u8', 'u9'], created: -35, due: -20, completed: -21,
    title: ['Phishing awareness campaign', 'حملة التوعية بالتصيّد الاحتيالي'],
    desc: ['Simulated phishing email followed by a short training for everyone who clicked.', 'رسالة تصيّد تجريبية يتبعها تدريب قصير لكل من ضغط على الرابط.'],
    steps: [['Write the simulated email', 'كتابة الرسالة التجريبية'], ['Send to all staff', 'الإرسال لجميع الموظفين'], ['Run the follow-up training', 'تنفيذ التدريب اللاحق']],
    doneCount: 3, doneBy: ['u9', 'u8'], baseDay: -30 },
  { key: 't110', dept: 'it', group: 'g_plat', by: 'u3', assignees: ['u4'], created: -20, due: -12, completed: -14,
    title: ['Replace the core network switch', 'استبدال محوّل الشبكة الرئيسي'],
    desc: ['Swap the failing switch during the weekend window.', 'استبدال المحوّل المتعطل خلال نافذة نهاية الأسبوع.'],
    steps: [['Stage the new switch', 'تجهيز المحوّل الجديد'], ['Swap during the maintenance window', 'الاستبدال خلال نافذة الصيانة'], ['Confirm every floor is online', 'التأكد من اتصال جميع الأدوار']],
    doneCount: 3, doneBy: ['u4'], baseDay: -18 },
  { key: 't111', dept: 'it', group: 'g_sec', by: 'u3', assignees: ['u9'], created: -15, due: -10, completed: -12,
    title: ['Clean up inactive user accounts', 'تنظيف حسابات المستخدمين غير النشطة'],
    desc: ['Disable accounts with no sign-in for 90 days.', 'تعطيل الحسابات التي لم تسجّل الدخول منذ 90 يومًا.'],
    steps: [['Export last sign-in dates', 'تصدير تواريخ آخر دخول'], ['Confirm with HR', 'التأكيد مع الموارد البشرية'], ['Disable the accounts', 'تعطيل الحسابات']],
    doneCount: 3, doneBy: ['u9'], baseDay: -14 },

  // ---- Other departments, active
  { key: 't112', dept: 'fin', group: 'g_rep', by: 'u10', assignees: ['u11'], created: -6, due: 5,
    title: ['Q3 expense report', 'تقرير المصروفات للربع الثالث'],
    steps: [['Collect cost centre data', 'جمع بيانات مراكز التكلفة'], ['Reconcile with the ledger', 'المطابقة مع دفتر الأستاذ'], ['Draft the report', 'إعداد مسودة التقرير'], ['Review with the Head of Finance', 'المراجعة مع رئيس المالية'], ['Publish', 'النشر']],
    doneCount: 2, doneBy: ['u11'], baseDay: -5 },
  { key: 't113', dept: 'proc', group: 'g_ct', by: 'u12', assignees: ['u13'], created: -8, due: 7,
    title: ['Supplier registration audit', 'تدقيق تسجيل الموردين'],
    steps: [['Pull the supplier register', 'استخراج سجل الموردين'], ['Check commercial registrations', 'التحقق من السجلات التجارية'], ['Flag expired records', 'تحديد السجلات المنتهية'], ['Send notices', 'إرسال الإشعارات'], ['Close the audit', 'إغلاق التدقيق']],
    doneCount: 1, doneBy: ['u13'], baseDay: -7 },
  { key: 't114', dept: 'hr', group: 'g_tal', by: 'u16', assignees: ['u2'], created: -10, due: 12,
    title: ['Annual training plan for 2027', 'خطة التدريب السنوية لعام 2027'],
    steps: [['Collect needs from departments', 'جمع الاحتياجات من الإدارات'], ['Shortlist providers', 'اختيار مقدمي التدريب'], ['Estimate the budget', 'تقدير الميزانية'], ['Get approval', 'الحصول على الاعتماد'], ['Publish the calendar', 'نشر التقويم']],
    doneCount: 3, doneBy: ['u2'], baseDay: -9 },
  { key: 't115', dept: 'comm', group: 'g_dig', by: 'u14', assignees: ['u15'], created: -4, due: 3,
    title: ['Social media calendar for October', 'تقويم التواصل الاجتماعي لشهر أكتوبر'],
    steps: [['Collect announcements', 'جمع الإعلانات'], ['Draft posts', 'كتابة المنشورات'], ['Design visuals', 'تصميم المرئيات'], ['Get approval', 'الحصول على الاعتماد']],
    doneCount: 1, doneBy: ['u15'], baseDay: -3 },

  // ---- Other departments, completed
  ...(
    [
      ['fin', 'g_rep', 'u10', ['u11'], -30, 7, 'Close the August accounts', 'إقفال حسابات أغسطس'],
      ['fin', 'g_bud', 'u10', ['u19', 'u11'], -45, 18, 'Budget request for 2027', 'طلب ميزانية عام 2027'],
      ['proc', 'g_ct', 'u12', ['u13'], -38, 12, 'Renew the cleaning services contract', 'تجديد عقد خدمات النظافة'],
      ['proc', 'g_ct', 'u12', ['u13'], -22, 9, 'Evaluate office furniture bids', 'تقييم عروض الأثاث المكتبي'],
      ['comm', 'g_dig', 'u14', ['u15'], -11, 6, 'National Day campaign', 'حملة اليوم الوطني'],
      ['comm', 'g_dig', 'u14', ['u15'], -26, 8, 'Refresh the intranet home page', 'تحديث الصفحة الرئيسية للشبكة الداخلية'],
      ['hr', 'g_hrops', 'u16', ['u2'], -16, 6, 'Onboarding for September hires', 'برنامج التهيئة لموظفي سبتمبر'],
      ['hr', 'g_hrops', 'u16', ['u2'], -33, 11, 'Update the leave policy handbook', 'تحديث دليل سياسة الإجازات'],
      ['exec', 'g_pmo', 'u1', ['u1'], -19, 4, 'Quarterly performance review with leadership', 'مراجعة الأداء الربعية مع القيادة'],
    ] as [string, string, string, string[], number, number, string, string][]
  ).map(([dept, group, by, assignees, c, days, en, ar], i): SeedTask => ({
    key: 't' + (116 + i), dept, group, by, assignees, created: c, due: c + days + 2, completed: c + days,
    title: [en, ar], steps: GENERIC_STEPS, doneCount: 3, doneBy: assignees, baseDay: c + 1,
  })),
];

export interface SeedActivity {
  day: number;
  time: string;
  actor: string;
  type: string;
  task?: string;
  emp?: string;
}

export const ACTIVITY: SeedActivity[] = [
  { day: -1, time: '10:12', actor: 'u3', type: 'task_created', task: 't106' },
  { day: -1, time: '11:40', actor: 'u5', type: 'step_done', task: 't100' },
  { day: -2, time: '09:05', actor: 'u2', type: 'emp_added', emp: 'u17' },
  { day: -2, time: '13:30', actor: 'u3', type: 'task_created', task: 't104' },
  { day: -3, time: '08:50', actor: 'u3', type: 'task_created', task: 't102' },
  { day: -3, time: '15:22', actor: 'u4', type: 'step_done', task: 't101' },
  { day: -9, time: '09:00', actor: 'u2', type: 'emp_added', emp: 'u19' },
  { day: -5, time: '16:10', actor: 'u15', type: 'task_completed', task: 't120' },
  { day: -12, time: '12:00', actor: 'u9', type: 'task_completed', task: 't111' },
  { day: -18, time: '14:00', actor: 'u2', type: 'emp_deactivated', emp: 'u18' },
];

export interface SeedNotification {
  to: string;
  day: number;
  time: string;
  read?: boolean;
  type: string;
  task?: string;
  actor?: string;
  emp?: string;
}

export const NOTIFICATIONS: SeedNotification[] = [
  { to: 'u4', day: -3, time: '08:50', type: 'assigned', actor: 'u3', task: 't102' },
  { to: 'u4', day: -1, time: '11:40', type: 'step', actor: 'u5', task: 't100' },
  { to: 'u3', day: -1, time: '08:00', type: 'overdue', task: 't103' },
  { to: 'u2', day: -2, time: '09:05', type: 'pending_signin', emp: 'u17' },
  { to: 'u1', day: -2, time: '09:05', read: true, type: 'emp_added', actor: 'u2', emp: 'u17' },
];
