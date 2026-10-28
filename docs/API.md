# واجهة API — `/api/v1`

- الرد الناجح: `{ "data": … }`. الخطأ: `{ "error": "رسالة عربية آمنة للعرض" }`.
- المصادقة: كوكي `fsm_session` من `POST /auth/login`.
- الرموز: `401` بلا جلسة · `403` لا صلاحية للعملية · `404` غير موجود **أو خارج نطاقك** · `409` تعارض حالة/موعد · `413/415` ملف مرفوض · `422` مدخلات غير صالحة · `429` محاولات كثيرة.
- لا يوجد CRUD عام يغيّر `status` أو `branchId`: كل تغيير حالة عملية أعمال مسمّاة.

| Method | المسار | من | الوصف |
|---|---|---|---|
| POST | `/auth/login` | الكل | `{phone, password}` |
| POST | `/auth/logout` | الكل | |
| GET | `/auth/me` | الكل | المستخدم الحالي |
| GET | `/branches` | الكل | الفروع الفعالة |
| POST | `/branches/sync` | مدير عام | مزامنة من `WP_BASE_URL/wp-json/aj/v1/branches` |
| GET/POST | `/users` | الإدارة | `{name, phone, password, role, branchId?}` |
| PATCH | `/users/:id` | الإدارة | `{isActive?, password?}` — ينهي الجلسات |
| GET/POST | `/teams` | الإدارة (GET: + المشرف/الفرع) | حالة الفرق / `{name, type, zone?, capacity, supervisorId?}` |
| POST | `/teams/:id/members` | الإدارة | `{userId, remove?}` |
| GET | `/orders?status&serviceType&branchId&q&page` | حسب النطاق | قائمة مرقّمة (30) |
| POST | `/orders` | الإدارة، الفرع | `{invoiceNumber, customerName, customerPhone, serviceType, priority, requestedDate, address, mapUrl?, itemsCount?, details?, carpetType?, areaSqm?, pickupAddress?, branchId?}` |
| GET | `/orders/:id` | حسب النطاق | التفاصيل + التكليفات + السجل + الملفات |
| POST | `/orders/:id/approve` | الإدارة | NEW → APPROVED |
| POST | `/orders/:id/assign` | الإدارة، المشرف | `{teamId \| assigneeId, start, end}` (وقت محلي `YYYY-MM-DDTHH:mm`) |
| POST | `/orders/:id/hold` · `/resume` · `/cancel` | الإدارة | `{reason}` |
| POST | `/orders/:id/review-link` | الإدارة، الفرع | يُرجع `{url, whatsapp}` — صالح 7 أيام |
| POST | `/assignments/:id/reassign` | الإدارة، المشرف | مثل assign |
| GET | `/field/tasks` | الميدان | مهامي (الفعالة + المنجزة آخر 7 أيام) |
| GET | `/field/tasks/:id` | الميدان | |
| POST | `/field/tasks/:id/start` | الميدان | idempotent |
| POST | `/field/tasks/:id/complete` | الميدان | يتحقق من الأدلة؛ idempotent |
| POST | `/field/tasks/:id/issues` | الميدان | `{note}` |
| POST | `/field/tasks/:id/notes` | الميدان | `{note}` |
| POST | `/field/tasks/:id/files` | الميدان | multipart: `kind`, `file`, `signerName` (للتوقيع) |
| POST | `/field/tasks/:id/trip` | السائق | `{to: LOADED\|DEPARTED\|ARRIVED\|DELIVERED}` |
| POST | `/field/tasks/:id/carpet` | المفروش | `{workersCount?, quantityReceived, quantityUsed, qualityNotes?}` |
| GET | `/files/:id` | من يرى الطلب | الصورة، `no-store` |
| GET/POST | `/complaints` | الإدارة، الفرع | `{orderId, description}` |
| PATCH | `/complaints/:id` | الإدارة | `{status?, assignedToId?, reason?}` |
| POST | `/public/reviews/:token` | العميل (بلا حساب) | `{stars, punctuality, serviceQuality, notes?}` |
| POST | `/locations` | الميدان | `{assignmentId, lat, lng}` — أثناء مهمة قيد التنفيذ مسندة له فقط |
| POST | `/costs` | الإدارة | `{category: FUEL\|MAINTENANCE\|OVERTIME\|OTHER, amount: "1500.50", date, orderNumber?, note?}` — يُخزَّن بوحدات صغرى صحيحة |
| GET | `/dashboard/summary?date` | الإدارة، المشرف، الفرع | محسوب حسب النطاق |
| GET | `/reports/orders\|branches\|employees\|costs?from&to&format=csv` | الإدارة | JSON أو CSV |

مختلف عن المقترح في المواصفة: رفع الصور والتوقيع في مسار واحد `files` (الفرق حقل `kind`)، وخطوات الرحلة تحت مسار المهمة بدل `/trips/:id` حتى يبقى فحص «المسندة لي» واحدًا.
