# Prompt para Claude Opus - Construir Sistema CEDAFAM

```
Eres un senior full-stack engineer. Tu tarea: construir un sistema web completo de gestión de 
consultas psicológicas para CEDAFAM en 4-5 semanas.

## CONTEXTO DEL PROYECTO

CEDAFAM es un centro de psicología en México que necesita consolidar 10+ hojas de cálculo en 
1 plataforma centralizada.

### Problema a Resolver
- Fragmentación: múltiples Google Sheets dispersos
- Desincronización: calendarios individuales no visibles
- Procesos manuales: confirmación WhatsApp manual, asignaciones manuales
- Falta de datos: no hay tracking de entrada/salida de pacientes
- Tiempo de espera: desde solicitud hasta cita confirmada tarda mucho

### Usuarios (14 personas)
1. **Jefe Principal** (1): Acceso total, reportes, auditoría
2. **Coordinación Atención** (1): Gestiona asignaciones, ve todo, puede editar
3. **Contadora** (1): Ver solo (citas, pacientes, confirmaciones)
4. **Neuropsicologa** (1): Sus pacientes + especialidad en evaluación neuropsicológica
5. **Psicólogos Clínicos** (4 becarios + 2 part-time): Sus pacientes, estados
6. **Psicólogos Educativos** (2 pasantes): Sus pacientes, estados
7. **Psiquiatra** (1 part-time): Sus pacientes

### Especialidades
- Psicología Clínica
- Terapia Familiar (maestría)
- Psicología Educativa
- Neuropsicología
- Psiquiatría

### Datos Históricos
- 1,452 pacientes desde nov 2022 (Google Sheets)
- Campos: área, nombre, edad, fecha nacimiento, motivo, horario, celular, referencia, convenio, CURP, CP

---

## ESPECIFICACIONES TÉCNICAS

### Stack
- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js (Next.js API Routes)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth.js (email/password propio)
- **Reportes**: Recharts + jsPDF + ExcelJS
- **Hosting**: Vercel

### Estructura de Base de Datos (17 tablas)

#### users
- id (UUID), email, password (hashed), name, role (ADMIN|COORDINATOR|ACCOUNTANT|PSYCHOLOGIST)
- isActive, createdAt, updatedAt

#### psychologists
- id, userId (FK), speciality (CLINICAL|EDUCATIONAL|FAMILY_THERAPY|NEUROPSYCHOLOGY|PSYCHIATRY)
- workType (FULL_TIME|PART_TIME|INTERN|FELLOW), startDate, endDate (nullable, rotativos)
- isActive, createdAt, updatedAt

#### patients
- id, fullName, age, dateOfBirth, curp (nullable), phoneNumber, address, postalCode
- email (nullable), serviceArea (PSYCHOLOGY|PSYCHIATRY|PSYCHOLOGICAL_EVALUATION)
- referenceType (UM_STUDENT|COAE|UM_EMPLOYEE|HOSPITAL_EMPLOYEE|DUPS|NONE)
- consultationReason (motivo), preferredTimeSlot (MORNING|AFTERNOON)
- createdAt, updatedAt

#### patient_statuses (historial de estados)
- id, patientId (FK), serviceType (THERAPY|EVALUATION)
- therapyStatus (ACTIVE|THERAPEUTIC_DISCHARGE|VOLUNTARY_DISCHARGE|NEVER_CAME|REFERRED|null)
- evaluationStatus (TEST_APPLICATION|REPORT_PREPARATION|REFERRAL|EVALUATION_COMPLETED|null)
- changedBy (FK -> users), changedAt, notes

#### patient_assignments
- id, patientId (FK), psychologistId (FK), assignedBy (FK), assignedAt
- isExploratorySession (boolean), isActive

#### appointments
- id, patientId (FK), psychologistId (FK), scheduledAt, duration (minutos)
- serviceType (THERAPY|EXPLORATION_SESSION|EVALUATION)
- status (SCHEDULED|ATTENDED|NO_SHOW|CANCELLED), notes, createdAt, updatedAt

#### psychologist_availability
- id, psychologistId (FK), dayOfWeek (1-7), startTime, endTime, isActive

#### weekly_reports (Formulario obligatorio viernes)
- id, psychologistId (FK), weekStartDate (lunes de la semana)
- submittedAt, hoursOfAttention, activePatientCount, notes, createdAt

#### weekly_report_patient_updates (Dentro del reporte)
- id, weeklyReportId (FK), patientId (FK), serviceType (THERAPY|EVALUATION)
- therapyStatus, evaluationStatus

#### siere_applications (Programa beneficiencia)
- id, patientId (FK), psychologistId (FK), discountLevel (LEVEL_1|2|3|4 = $100/$280/$370/$490)
- requestedBy (FK), requestedAt, approvedBy (FK, nullable), approvedAt (nullable), isActive

#### notifications
- id, userId (FK), type (NEW_FORM_SUBMITTED|PATIENT_ASSIGNED|WEEKLY_REPORT_DUE|URGENT)
- title, message, relatedEntityId (nullable), isRead, createdAt

#### audit_log
- id, userId (FK), entityType, entityId, action (CREATE|UPDATE|DELETE)
- changedFields (JSON), changedAt

---

## FLUJOS CLAVE (IMPLEMENTAR EN ESTE ORDEN)

### Flujo 1: Nuevo Paciente (Semana 1)
1. Paciente llena formulario online público
2. Datos se guardan en BD → notificación a Coordinación
3. Coordinación revisa motivo:
   - Si específico → asigna a psicólogo del área
   - Si no específico → llama al paciente (manual)
     - Si concreta → asigna a psicólogo
     - Si no → ofrece consulta de exploración
4. Psicólogo ve paciente automáticamente en su lista

### Flujo 2: Asignación Inteligente (Semana 1)
1. GET /api/assignments/suggestions?patientId=X
2. Sistema retorna 2-3 mejores opciones basado en:
   - speciality matches serviceArea
   - activePatientCount (ASC) - menos carga
   - availability (horarios disponibles)
3. Coordinación elige final (no automático)
4. POST /api/assignments → asigna paciente

### Flujo 3: Reporte Semanal Obligatorio (Semana 2)
1. **Viernes antes de 12:30pm**: Psicólogo llena reporte
   - Horas atención semana pasada
   - Número pacientes activos semana pasada
   - Estado por paciente (dropdown: Activo, Alta, etc.)
   - Horarios disponibles en agenda (time picker)
2. **Si no se completó viernes**:
   - Lunes 00:00: job cron marca como vencido
   - Al login: GET /api/weekly-reports/pending retorna "es lunes"
   - **Modal BLOQUEANTE aparece** (no se puede cerrar sin completar)
   - Psicólogo DEBE llenar para acceder al dashboard
3. POST /api/weekly-reports → guardar reporte
4. Sistema almacena estados en weekly_report_patient_updates

### Flujo 4: Calendarios (Semana 3)
1. Psicólogos ven **SOLO sus citas** en calendario
2. Jefe + Coordinación + Contadora ven **TODAS las citas**
3. GET /api/calendar con filtros por psicólogo/fecha/paciente
4. POST /api/appointments para crear cita

### Flujo 5: Reportes Anuales (Semana 3-4)
1. GET /api/reports/annual retorna 5 reportes:
   - Pacientes nuevos/mes (por área, por tipo)
   - Pacientes por estado (terapia + evaluación)
   - Motivos consulta frecuentes
   - Duración promedio (evaluaciones en semanas, terapias en meses)
   - Tasa deserción (% NEVER_CAME)
2. Gráficos + tablas en dashboard
3. Descarga PDF/Excel: GET /api/reports/annual/export?format=pdf|xlsx

### Flujo 6: Notificaciones (Semana 1-2)
1. Campanita de notificaciones en navbar
2. Al hacer click → dropdown con lista de notificaciones
3. **Triggers**:
   - Nuevo formulario → notificación Coordinación (type: NEW_FORM_SUBMITTED)
   - Paciente asignado → notificación Psicólogo (type: PATIENT_ASSIGNED)
   - Lunes, reporte vencido → notificación Psicólogos (type: WEEKLY_REPORT_DUE)

---

## ENDPOINTS API A IMPLEMENTAR

### Auth
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/session

### Patients
- GET /api/patients (con filtros, role-based)
- POST /api/patients (crear desde formulario)
- GET /api/patients/[id]
- PUT /api/patients/[id]
- GET /api/patients/[id]/history
- PUT /api/patients/[id]/status (cambiar estado)

### Assignments
- GET /api/assignments/suggestions?patientId=X (retorna 2-3 opciones)
- POST /api/assignments (asignar)

### Psychologists
- GET /api/psychologists
- GET /api/psychologists/[id]/patients (mis pacientes)
- GET /api/psychologists/[id]/availability
- PUT /api/psychologists/[id]/availability

### Appointments
- GET /api/calendar (vista calendario)
- POST /api/appointments
- PUT /api/appointments/[id]

### Weekly Reports
- POST /api/weekly-reports (enviar reporte viernes)
- GET /api/weekly-reports/pending (check si es lunes)
- GET /api/weekly-reports/[id]

### SIERE
- POST /api/siere (psicólogo solicita)
- GET /api/siere/[patientId]

### Reports
- GET /api/reports/annual (5 reportes)
- GET /api/reports/annual/export?format=pdf|xlsx

### Notifications
- GET /api/notifications (listar)
- PUT /api/notifications/[id]/read

---

## PÁGINAS A CREAR

### Públicas
- `/form` - Formulario nuevo paciente (responsivo)

### Dashboard (protegidas por rol)
- `/dashboard` - Home (resumen por rol)
- `/dashboard/patients` - Lista de pacientes
- `/dashboard/patients/[id]` - Detalle paciente + historial
- `/dashboard/assignments` - Vista de asignación (solo Coordinación)
- `/dashboard/calendar` - Calendario de citas
- `/dashboard/weekly-report` - Reporte semanal (solo psicólogos)
- `/dashboard/reports` - Reportes anuales (Jefe + Coordinación)

### Admin
- `/admin/users` - Gestión de usuarios (solo Jefe)

---

## COMPONENTES CRÍTICOS

### Reutilizables
- PatientForm (formulario nuevo paciente)
- PatientTable (tabla pacientes con sorting/filtering)
- WeeklyReportForm (reporte semanal)
- PatientStatusSelector (dropdown estados)
- NotificationBell (campanita + dropdown)
- CalendarView (calendario mes/semana/día)
- ChartComponent (gráficos reportes)

### Especiales
- **ModalBlockade** - Modal BLOQUEANTE de reporte lunes (no closeable)
- **DashboardLayout** - Layout con navbar + sidebar por rol

---

## PERMISOS Y ROLES (Implementar con NextAuth middleware)

| Endpoint | Jefe | Coordinación | Contadora | Psicólogo |
|----------|------|--------------|-----------|-----------|
| GET /api/patients | ✅ | ✅ | ✅ (read) | ✅ (own) |
| POST /api/patients | ✅ | ✅ | ❌ | ❌ |
| PUT /api/patients | ✅ | ✅ | ❌ | ❌ |
| POST /api/assignments | ❌ | ✅ | ❌ | ❌ |
| GET /api/calendar | ✅ | ✅ | ✅ (read) | ✅ (own) |
| POST /api/appointments | ✅ | ✅ | ❌ | ✅ (own) |
| GET /api/reports/annual | ✅ | ✅ | ❌ | ❌ |
| GET /api/weekly-reports | ✅ | ✅ | ✅ (read) | ✅ (own) |
| POST /api/weekly-reports | ❌ | ❌ | ❌ | ✅ |

---

## MIGRACIÓN DE DATOS HISTÓRICOS

### Datos disponibles
- 1,452 pacientes en Excel (Google Sheets)
- Período: nov 2022 - presente
- Campos: timestamp, área, nombre, edad, fecha nac, motivo, horario, celular, referencia, convenio, CURP, CP

### Proceso
1. Script Python que:
   - Lee archivo XLSX
   - Parsea cada campo
   - Mapea a schema Postgres
   - Valida fechas, duplicados
   - Inserta bulk con Prisma
2. Mapeo:
   - Timestamp → appointments.createdAt
   - Área → patients.serviceArea
   - Nombre → patients.fullName
   - Edad → patients.age
   - Motivo → patients.consultationReason
   - Horario → patients.preferredTimeSlot
   - Celular → patients.phoneNumber
   - Referencia → patients.referenceType
   - CURP → patients.curp
   - CP → patients.postalCode

---

## REQUISITOS ESPECIALES

### Modal Bloqueante Lunes
- Si psicólogo no reportó viernes: lunes aparece modal BLOQUEANTE
- Modal NO tiene botón cerrar (X button hidden)
- No se puede hacer click fuera del modal (z-index alto)
- DEBE completar formulario para acceder a dashboard
- Implementar con: Cron job + GET /api/weekly-reports/pending + Modal Nextjs

### Consulta de Exploración
- temporal, gratuita, sin expediente físico
- SE REGISTRA en sistema (isExploratorySession=true)
- Contar en reportes como pacientes atendidos
- Para rastrear: beneficiencia vs particular

### Horarios
- Matutino: 9:00am - 11:00am
- Vespertino: 2:30pm - 5:30pm
- Reporte: viernes antes de 12:30pm
- Bloqueo: lunes 00:00 si no reportó

### Part-time Psicólogos
- Solo reportan los días que atienden
- Mismo flujo de bloqueo lunes

### Rotativos (Becarios/Pasantes)
- Jornada completa (toda la semana)
- Mismo flujo
- endDate en BD cuando se van (2 años becas, 1 año pasantía)

### Datos Sensibles
- OMITIR: diagnósticos, historia psiquiátrica, notas clínicas
- CAPTURAR: nombre, edad, motivo consulta, estado de servicio
- Encriptar: teléfono, email (salvo cuando sea contacto)

---

## ORDEN DE IMPLEMENTACIÓN (MVP)

### Semana 1-2: Core + Notificaciones
1. Setup proyecto (Next.js, Prisma, NextAuth)
2. Crear BD + tablas
3. CRUD Pacientes + formulario público
4. Asignación inteligente + sugerencias
5. Notificaciones (campanita + triggers)
6. Dashboards básicos por rol

### Semana 2: Reporte Semanal
1. Formulario semanal (viernes)
2. Modal BLOQUEANTE (lunes)
3. Estados de pacientes (historial)

### Semana 3: Calendarios + Reportes
1. Calendarios integrados
2. Disponibilidad psicólogos
3. Reportes anuales (5 tipos)
4. Export PDF/Excel

### Semana 4-5: Migración + Deploy
1. ETL migración datos históricos
2. Testing E2E
3. Mobile responsive
4. Deploy Vercel

---

## CONSIDERACIONES IMPORTANTES

1. **TypeScript everywhere**: Strict mode, no `any`
2. **Components reusables**: shadcn/ui para consistencia
3. **Permisos granulares**: Verificar role en cada endpoint
4. **Audit log**: Registrar TODOS los cambios de estado
5. **Transacciones**: Para asignaciones, reportes (ACID)
6. **Índices DB**: Crear en email, patientId, psychologistId, createdAt
7. **Error handling**: Validación en frontend + backend
8. **UI/UX**: Mobile-first, responsive, accesible (WCAG)
9. **Performance**: Lazy load, image optimization, query optimization
10. **Seguridad**: CSRF protection, XSS prevention, SQL safe (Prisma)

---

## ARCHIVOS ESTRUCTURA

```
/sistema-cedafam
├── /app                          # Next.js app router
│   ├── /api                     # API routes
│   │   ├── /auth
│   │   ├── /patients
│   │   ├── /assignments
│   │   ├── /calendar
│   │   ├── /weekly-reports
│   │   ├── /reports
│   │   └── /notifications
│   ├── /dashboard               # Protected pages
│   │   ├── page.tsx            # Home
│   │   ├── /patients
│   │   ├── /assignments
│   │   ├── /calendar
│   │   ├── /weekly-report
│   │   ├── /reports
│   │   └── layout.tsx
│   ├── /form                   # Public form
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── /components
│   ├── /ui                     # shadcn/ui components
│   ├── /forms                  # Form components
│   ├── /tables                 # Table components
│   ├── /modals                 # Modal components (incluyendo ModalBlockade)
│   ├── /charts                 # Chart components
│   ├── /notifications          # Notification components
│   ├── Navbar.tsx
│   └── Sidebar.tsx
├── /lib
│   ├── db.ts                   # Prisma client
│   ├── auth.ts                 # NextAuth config
│   ├── types.ts                # TypeScript types
│   ├── utils.ts                # Utility functions
│   └── permissions.ts          # Role-based permissions
├── /prisma
│   ├── schema.prisma           # DB schema
│   └── /migrations
├── /scripts
│   ├── seed.ts                 # Seed initial data
│   └── migrate-patients.ts     # ETL migration script
├── /public
├── .env.local
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

---

## PRIMEROS PASOS

1. **Clona repo y crea rama**: `git checkout -b develop`
2. **Setup inicial**:
   ```bash
   npm install
   npx prisma init
   npx prisma db push
   npx prisma generate
   npm run dev
   ```
3. **Crea BD**: PostgreSQL local o Railway
4. **Configura .env**: DATABASE_URL, NEXTAUTH_SECRET
5. **Seed data**: npm run seed (usuarios test)
6. **Empieza con**: Formulario público → CRUD pacientes → API pacientes

---

## NOTAS FINALES

- Código limpio, bien nombrado, tipos correctos
- Componentes pequeños y reutilizables
- Queries optimizadas (no N+1)
- Error handling completo
- Responsive design (mobile-first)
- Testing desde el inicio (E2E critical)
- Git commits pequeños y descriptivos
- README con instrucciones de setup y deploy

¿Listo para empezar? Implementa Fase 1: Setup + CRUD Pacientes + Asignación.
```

---

## 📝 NOTAS PARA USA CON OTRO CLAUDE

Este prompt es **self-contained**. El otro Claude tendrá:
- ✅ Contexto completo del proyecto
- ✅ Especificaciones técnicas detalladas
- ✅ Stack definido
- ✅ BD mapeada (17 tablas)
- ✅ 20+ endpoints listos
- ✅ Flujos de negocio claros
- ✅ Orden de implementación
- ✅ Estructura de carpetas
- ✅ Permisos y roles

**No necesitará ver esta conversación**. Solo ejecutar el prompt y empezar a codificar.
