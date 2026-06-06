# Arquitectura Técnica - CEDAFAM

## Stack

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js (Next.js API Routes)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth.js
- **Hosting**: Vercel

## Estructura de Base de Datos

### Tablas Principales

#### `users`
```
id (UUID)
email (String, unique)
password (String, hashed)
name (String)
role (Enum: ADMIN, COORDINATOR, ACCOUNTANT, PSYCHOLOGIST)
isActive (Boolean)
createdAt (DateTime)
updatedAt (DateTime)
```

#### `psychologists`
```
id (UUID)
userId (FK -> users)
speciality (Enum: CLINICAL, EDUCATIONAL, FAMILY_THERAPY, NEUROPSYCHOLOGY, PSYCHIATRY)
licenseNumber (String, nullable)
workType (Enum: FULL_TIME, PART_TIME, INTERN, FELLOW)
startDate (DateTime)
endDate (DateTime, nullable) -- para rotativos
isActive (Boolean)
createdAt (DateTime)
updatedAt (DateTime)
```

#### `patients`
```
id (UUID)
fullName (String)
age (Int)
dateOfBirth (Date)
curp (String, nullable)
phoneNumber (String)
address (String, nullable)
postalCode (String, nullable)
email (String, nullable)
serviceArea (Enum: PSYCHOLOGY, PSYCHIATRY, PSYCHOLOGICAL_EVALUATION)
referenceType (Enum: UM_STUDENT, COAE, UM_EMPLOYEE, HOSPITAL_EMPLOYEE, DUPS, NONE)
consultationReason (String)
preferredTimeSlot (Enum: MORNING, AFTERNOON)
createdAt (DateTime)
updatedAt (DateTime)
```

#### `patient_statuses` (historial de estados)
```
id (UUID)
patientId (FK -> patients)
serviceType (Enum: THERAPY, EVALUATION)
therapyStatus (Enum: ACTIVE, THERAPEUTIC_DISCHARGE, VOLUNTARY_DISCHARGE, NEVER_CAME, REFERRED, null)
evaluationStatus (Enum: TEST_APPLICATION, REPORT_PREPARATION, REFERRAL, EVALUATION_COMPLETED, null)
changedBy (FK -> users)
changedAt (DateTime)
notes (String, nullable)
```

#### `patient_assignments`
```
id (UUID)
patientId (FK -> patients)
psychologistId (FK -> psychologists)
assignedBy (FK -> users) -- coordinador
assignedAt (DateTime)
isExploratorySession (Boolean) -- true si es consulta de exploración
isActive (Boolean)
```

#### `appointments`
```
id (UUID)
patientId (FK -> patients)
psychologistId (FK -> psychologists)
scheduledAt (DateTime)
duration (Int) -- minutos
serviceType (Enum: THERAPY, EXPLORATION_SESSION, EVALUATION)
status (Enum: SCHEDULED, ATTENDED, NO_SHOW, CANCELLED)
notes (String, nullable)
createdAt (DateTime)
updatedAt (DateTime)
```

#### `psychologist_availability`
```
id (UUID)
psychologistId (FK -> psychologists)
dayOfWeek (Int) -- 1-7 (lunes-domingo)
startTime (Time)
endTime (Time)
isActive (Boolean)
```

#### `weekly_reports` (Formulario semanal obligatorio)
```
id (UUID)
psychologistId (FK -> psychologists)
weekStartDate (Date) -- Monday of the week
submittedAt (DateTime)
hoursOfAttention (Int)
activePatientCount (Int)
notes (String, nullable)
createdAt (DateTime)
```

#### `weekly_report_patient_updates` (Dentro del reporte semanal)
```
id (UUID)
weeklyReportId (FK -> weekly_reports)
patientId (FK -> patients)
serviceType (Enum: THERAPY, EVALUATION)
therapyStatus (Enum: ACTIVE, THERAPEUTIC_DISCHARGE, VOLUNTARY_DISCHARGE, NEVER_CAME, REFERRED)
evaluationStatus (Enum: TEST_APPLICATION, REPORT_PREPARATION, REFERRAL, EVALUATION_COMPLETED)
```

#### `siere_applications` (Programa de beneficiencia)
```
id (UUID)
patientId (FK -> patients)
psychologistId (FK -> psychologists)
discountLevel (Enum: LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4) -- $100, $280, $370, $490
requestedBy (FK -> users) -- psicólogo que solicita
requestedAt (DateTime)
approvedBy (FK -> users, nullable) -- coordinador aprueba?
approvedAt (DateTime, nullable)
isActive (Boolean)
```

#### `notifications`
```
id (UUID)
userId (FK -> users)
type (Enum: NEW_FORM_SUBMITTED, PATIENT_ASSIGNED, WEEKLY_REPORT_DUE, URGENT)
title (String)
message (String)
relatedEntityId (String, nullable) -- patientId o appointmentId
isRead (Boolean)
createdAt (DateTime)
```

#### `audit_log`
```
id (UUID)
userId (FK -> users)
entityType (String)
entityId (String)
action (Enum: CREATE, UPDATE, DELETE)
changedFields (JSON)
changedAt (DateTime)
```

## Modelo de Datos - Relaciones

```
users (1) ──→ (1) psychologists
users (1) ──→ (*) notifications
users (1) ──→ (*) weekly_reports (submittedBy)
users (1) ──→ (*) audit_log

psychologists (1) ──→ (*) patient_assignments
psychologists (1) ──→ (*) appointments
psychologists (1) ──→ (*) psychologist_availability
psychologists (1) ──→ (*) weekly_reports
psychologists (1) ──→ (*) siere_applications

patients (1) ──→ (*) patient_statuses
patients (1) ──→ (*) patient_assignments
patients (1) ──→ (*) appointments
patients (1) ──→ (*) siere_applications
```

## Endpoints API (Next.js)

### Auth
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/session` - Get current session

### Patients
- `GET /api/patients` - List all (with filters)
- `POST /api/patients` - Create new (from form)
- `GET /api/patients/[id]` - Get patient details
- `PUT /api/patients/[id]` - Update patient
- `GET /api/patients/[id]/history` - Get historial

### Psychologists
- `GET /api/psychologists` - List all
- `GET /api/psychologists/[id]/patients` - My patients
- `GET /api/psychologists/[id]/availability` - My availability
- `PUT /api/psychologists/[id]/availability` - Update availability

### Assignments
- `POST /api/assignments` - Assign patient (by coordinator)
- `GET /api/assignments/suggestions` - Get 2-3 smart suggestions
- `GET /api/psychologists/[id]/assigned-patients` - For psychologist dashboard

### Appointments
- `GET /api/appointments` - List all (with filters by psychologist/date)
- `POST /api/appointments` - Create appointment
- `PUT /api/appointments/[id]` - Update appointment status
- `GET /api/calendar` - Get calendar view

### Weekly Reports
- `POST /api/weekly-reports` - Submit report
- `GET /api/weekly-reports/[id]` - Get report
- `GET /api/weekly-reports/pending` - Check if due (Monday check)
- `PUT /api/weekly-reports/[id]/patient-status` - Update individual patient status in report

### SIERE
- `POST /api/siere` - Request (psicólogo a coordinador, verbal pero registrado)
- `GET /api/siere/[patientId]` - Get SIERE status

### Reports
- `GET /api/reports/annual` - Generate annual report
- `GET /api/reports/annual/export?format=pdf|xlsx` - Export

### Notifications
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/[id]/read` - Mark as read

## Flujos Principales

### 1. Flujo de Nuevo Paciente
```
1. Paciente llena formulario (GET /form, POST /api/patients)
2. Notification creada para Coordinación (type: NEW_FORM_SUBMITTED)
3. Coordinación revisa en dashboard → GET /api/patients?status=pending
4. Si motivo específico:
   - POST /api/assignments (asigna a psicólogo)
   - Notification creada para psicólogo (type: PATIENT_ASSIGNED)
5. Si motivo NO específico:
   - Coordinación llama (manual)
   - Si concreta: POST /api/assignments
   - Si no: POST /api/assignments (consulta de exploración, isExploratorySession=true)
```

### 2. Flujo de Reporte Semanal Obligatorio
```
1. Viernes antes de 12:30pm: Psicólogo llena reporte (POST /api/weekly-reports)
2. Sistema almacena estados de pacientes (weekly_report_patient_updates)
3. Lunes 00:00: Job cron verifica reportes pendientes
4. Si no completado: Modal bloqueante al login
   - GET /api/weekly-reports/pending → devuelve "es lunes, debe completar"
   - Fuerza completar antes de acceder al dashboard
5. Una vez completado: Se habilita acceso normal
```

### 3. Flujo de Asignación Inteligente
```
POST /api/assignments/suggestions?patientId=X
→ Retorna [psychologist1, psychologist2, psychologist3] basado en:
  - speciality matches serviceArea
  - activePatientCount (ASC)
  - availability (horarios disponibles)
  - orderBy: carga + especialidad match
```

### 4. Flujo de SIERE
```
1. Psicólogo solicita SIERE verbalmente a Coordinación
2. Psicólogo registra en sistema: POST /api/siere
   {patientId, discountLevel, requestedAt}
3. Sistema lo marca como pending (approvedBy=null)
4. (Opcional) Coordinación puede aprobar: PUT /api/siere/[id]
5. Se almacena para reportes y auditoría
```

## Autenticación y Autorización

### NextAuth.js Config
```javascript
// pages/api/auth/[...nextauth].js
Providers: Credentials (email/password)
Callbacks: 
  - authorized() → check role
  - session() → include user role
```

### Middleware de Roles
```
Jefe (ADMIN): acceso a TODO
Coordinación (COORDINATOR): acceso a formularios, asignaciones, reportes
Contadora (ACCOUNTANT): acceso solo lectura a formularios, pacientes, citas
Psicólogos (PSYCHOLOGIST): acceso solo a sus pacientes, sus citas
```

## Seguridad y Datos Sensibles

- ✅ Contraseñas con bcrypt (10 rounds)
- ✅ CURP opcional (puede ser null)
- ✅ Teléfono y email: obligatorios solo para contacto
- ✅ Historias clínicas: OMITIR (no se registran diagnósticos)
- ✅ Audit log de todos los cambios (quién, cuándo, qué)

## Notificaciones y Real-time

### Campanita de Notificaciones
```
GET /api/notifications → [{id, type, message, createdAt, isRead}]
PUT /api/notifications/[id]/read → marca como leída
```

### WebSocket (opcional MVP 2)
Para push notifications en tiempo real (opcional en MVP 1, usar polling)

## Calendarios

### GET /api/calendar
```
Para Psicólogo: retorna sus citas + disponibilidad
Para Jefe/Coordinación/Contadora: retorna todas las citas
```

### Integración
- Sistema interno (no Google Calendar)
- Psicólogos visualizan en dashboard
- Coordinación ve vista global
- Automatización de recordatorios (opcional)

## Reportes Anuales

### Estructura de Reportes
1. **Pacientes nuevos/mes** → GROUP BY month, serviceArea, serviceType
2. **Por estado** → COUNT por status
3. **Motivos frecuentes** → TOP 10 consultationReason
4. **Duración promedio** → AVG(appointments count) por patientId
5. **Tasa deserción** → COUNT(status='NEVER_CAME') / total * 100

### Generación
```
GET /api/reports/annual?year=2024
→ Retorna JSON + genera PDF/Excel si ?export=true
```

## Migration Strategy

### Datos Históricos (Google Sheets → Postgres)
```
1. ETL script leer Excel (openpyxl)
2. Parsear campos
3. Insertar en BD con Prisma
4. Validar integridad
5. Cleanup: duplicados, fechas inválidas
```

### Schemas:
```sql
-- Mapeo Google Sheets → Postgres
Google Col        → Postgres Field
Timestamp        → appointments.createdAt
Área             → patients.serviceArea
Nombre           → patients.fullName
Edad             → patients.age
Fecha nacimiento → patients.dateOfBirth
Motivo           → patients.consultationReason
Horario pref     → patients.preferredTimeSlot
Celular          → patients.phoneNumber
Referencia       → patients.referenceType
Convenio         → (field nuevo si aplica)
CURP             → patients.curp
CP               → patients.postalCode
```

## Fases de Implementación

**MVP 1** (Sprint 1-2): Core + Notificaciones
- Auth + roles
- Gestión pacientes
- Asignación inteligente
- Reporte semanal obligatorio
- Notificaciones (banner)

**MVP 2** (Sprint 3): Calendarios + Reportes
- Calendario integrado
- Reportes anuales básicos
- Export PDF/Excel

**MVP 3** (Sprint 4+): Polish + Optimizaciones
- Mobile responsive perfection
- WebSocket real-time
- SIERE integration
- Integración WhatsApp (future)

## Consideraciones Especiales

### Horarios y Zonas Horarias
- CEDAFAM aparentemente en México (basado en CURP, convenios)
- Usar UTC en DB, convertir a hora local en frontend

### Rotación de Personal
- Becarios/Pasantes: temporal (1-2 años)
- Marcar endDate al desactivar
- No borrar registros históricos
- Mantener auditoría de quién atendió

### Consulta de Exploración
- isExploratorySession = true
- No genera expediente físico pero SÍ se registra
- Contar en reportes como servicio entregado

### Estados Complejos
- Un paciente puede estar en evaluación primero, luego terapia
- Mantener historial de transiciones
- patient_statuses es append-only (nunca modificar, siempre insertar nuevo)

## Deployment

- Vercel (Next.js nativo)
- Database: Vercel Postgres o Railway
- Auto-deploy desde GitHub
- Environment variables para secrets
