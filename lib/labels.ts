// قاموس التسميات العربية. الإنجليزية لاحقًا = قاموس ثانٍ بنفس المفاتيح.
export const ar = {
  role: {
    ADMIN: 'المدير العام', SERVICE_MANAGER: 'مدير الخدمات', SUPERVISOR: 'مشرف', BRANCH: 'فرع',
    INSTALLER: 'معلم أثاث', CARPET_LAYER: 'مفروش موكيت', DRIVER: 'سائق',
  },
  service: { FURNITURE: 'تركيب أثاث', CARPET: 'فرش موكيت', DELIVERY: 'توصيل' },
  priority: { LOW: 'منخفضة', NORMAL: 'عادية', HIGH: 'عالية', URGENT: 'عاجلة' },
  order: {
    NEW: 'جديد', APPROVED: 'معتمد', SCHEDULED: 'مجدول', IN_PROGRESS: 'قيد التنفيذ', ON_HOLD: 'موقوف',
    ISSUE_REPORTED: 'توجد مشكلة', COMPLETED: 'مكتمل', CANCELLED: 'ملغى',
  },
  assignment: {
    ASSIGNED: 'مُسند', IN_PROGRESS: 'قيد التنفيذ', ISSUE: 'مشكلة', COMPLETED: 'مكتمل', REASSIGNED: 'أُعيد إسناده', CANCELLED: 'ملغى',
  },
  trip: { ASSIGNED: 'بانتظار التحميل', LOADED: 'تم التحميل', DEPARTED: 'تم الخروج', ARRIVED: 'تم الوصول', DELIVERED: 'تم التسليم' },
  tripAction: { LOADED: 'تم التحميل', DEPARTED: 'تم الخروج', ARRIVED: 'تم الوصول', DELIVERED: 'تم التسليم' } as Record<string, string>,
  complaint: { NEW: 'جديدة', IN_PROGRESS: 'تحت المعالجة', CONTACTED: 'تم التواصل', RESOLVED: 'تم الحل', CLOSED: 'مغلقة' },
  file: { BEFORE: 'قبل التنفيذ', AFTER: 'بعد التنفيذ', DELIVERY: 'إثبات التسليم', SIGNATURE: 'توقيع العميل' },
  teamState: { AVAILABLE: 'متاح', BUSY: 'في مهمة', LATE: 'متأخر', ISSUE: 'توجد مشكلة' },
  event: {
    ASSIGNED: 'تم الإسناد', REASSIGNED: 'أُعيد الإسناد', STARTED: 'بدأ التنفيذ', NOTE: 'ملاحظة', ISSUE: 'بلاغ مشكلة',
    PHOTO: 'رفع صورة', SIGNATURE: 'توقيع العميل', COMPLETED: 'اكتملت المهمة', CANCELLED: 'أُلغي التكليف',
    TRIP_LOADED: 'تم التحميل', TRIP_DEPARTED: 'تم الخروج', TRIP_ARRIVED: 'تم الوصول', TRIP_DELIVERED: 'تم التسليم', CARPET: 'تحديث أمر الفرش',
  } as Record<string, string>,
};
