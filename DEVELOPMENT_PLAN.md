# Plan de Desarrollo - CEDAFAM

## Timeline: MVP Rápido (4-5 semanas)

### Fase 0: Setup (Día 1-2)

#### 0.1 Estructura de Proyecto
- [ ] Crear repo con `create-next-app@latest` (TypeScript + Tailwind)
- [ ] Configurar ESLint + Prettier
- [ ] Setup git hooks (Husky)
- [ ] Crear carpetas base:
  - `/app` - Next.js app router
  - `/lib` - utilidades, types
  - `/components` - React components
  - `/prisma` - schema + migrations
  - `/scripts` - ETL, crons, etc

#### 0.2 Base de Datos
- [ ] Setup PostgreSQL local (Docker)
- [ ] Setup Prisma ORM
  - Crear schema.prisma con todas las tablas
  - Generar migrations
  - Setup Prisma studio para debug
- [ ] Crear índices en BD (email, patientId, psychologistId, createdAt)

#### 0.3 Autenticación
- [ ] Setup NextAuth.js
  - CredentialsProvider (email/password)
  - Role-based access (ADMIN, COORDINATOR, ACCOUNTANT, PSYCHOLOGIST)
  - Configurar callbacks (authorized, jwt, session)
- [ ] Hash passwords con bcrypt
- [ ] Crear seed data: usuarios de prueba por rol

### Fase 1: Core + Notificaciones (Semana 1-2)

#### 1.1 Gestión de Pacientes
- [ ] **API**: CRUD pacientes
  - `POST /api/patients` - Crear desde formulario público
  - `GET /api/patients` - Listar con filtros (role-based)
  - `GET /api/patients/[id]` - Detalle
  - `PUT /api/patients/[id]` - Editar (solo Coordinación)
- [ ] **Pages**:
  - `/form` - Formulario público (llenar datos)
  - `/dashboard/patients` - Vista de Coordinación (lista, filtros)
  - `/dashboard/patients/[id]` - Detalle paciente (con historial)
- [ ] **Components**:
  - PatientForm (reutilizable)
  - PatientTable (con sorting/filtering)
  - PatientCard (resumen)

#### 1.2 Asignación de Psicólogos
- [ ] **API**: 
  - `GET /api/assignments/suggestions?patientId=X` - Retorna 2-3 opciones smart
    - Filtrar por especialidad + disponibilidad
    - Ordenar por carga (menos pacientes = prioridad)
  - `POST /api/assignments` - Asignar (solo Coordinación)
- [ ] **Pages**:
  - `/dashboard/assignments` - Vista de asignación (mostrar pacientes sin asignar)
- [ ] **Components**:
  - AssignmentSuggestions (muestra 2-3 opciones)
  - AssignmentForm (dropdown para elegir psicólogo)

#### 1.3 Notificaciones Sistema
- [ ] **Database**: tabla `notifications`
- [ ] **API**:
  - `GET /api/notifications` - Listar notificaciones usuario
  - `PUT /api/notifications/[id]/read` - Marcar como leída
  - `POST /api/notifications` (internal) - Crear notificación
- [ ] **Triggers de Notificaciones**:
  - Nuevo formulario enviado → notificar Coordinación
  - Paciente asignado → notificar Psicólogo
  - Reporte semanal vence el lunes → notificar Psicólogos
- [ ] **Components**:
  - NotificationBell (campanita)
  - NotificationDropdown (lista de notificaciones)
  - NotificationBanner (banner alert)

#### 1.4 Dashboard Básico (por rol)
- [ ] **Jefe**: Resumen de todo (pacientes, psicólogos, citas)
- [ ] **Coordinación**: Nuevos formularios, asignaciones, pacientes sin asignar
- [ ] **Contadora**: Pacientes confirmados, próximas citas
- [ ] **Psicólogos**: Mis pacientes, mis citas hoy/semana

### Fase 2: Reporte Semanal Obligatorio (Semana 2)

#### 2.1 Formulario Semanal
- [ ] **Database**:
  - `weekly_reports` tabla
  - `weekly_report_patient_updates` tabla (estado de cada paciente en reporte)
- [ ] **API**:
  - `POST /api/weekly-reports` - Enviar reporte
  - `GET /api/weekly-reports/[id]` - Ver reporte
  - `GET /api/weekly-reports/pending` - Check si es lunes y no completó viernes
- [ ] **Pages**:
  - `/dashboard/weekly-report` - Formulario semanal
  - `/dashboard/weekly-report/history` - Historial de reportes
- [ ] **Components**:
  - WeeklyReportForm (campos: horas, pacientes activos, estado por paciente)
  - PatientStatusSelector (dropdown para cada paciente: Activo, Alta, etc.)
  - AvailabilitySchedule (selector de horarios disponibles)

#### 2.2 Modal Bloqueante (Lunes)
- [ ] **Middleware/Redirect**:
  - Job cron: cada lunes 00:00 busca reportes no completados
  - Al login: `GET /api/weekly-reports/pending`
    - Si retorna "es lunes y no completó": renderizar modal bloqueante
    - Modal NO se puede cerrar sin completar formulario
- [ ] **Pages**:
  - Modal componente que bloquea todo (z-index alto)
  - Permite llenar formulario dentro del modal

#### 2.3 Lógica de Estados
- [ ] **Estados Terapia**: Activo, Alta terapéutica, Alta voluntaria, Nunca vino, Referido
- [ ] **Estados Evaluación**: Aplicación pruebas, Elaboración informe, Canalización, Finalizada
- [ ] **Endpoints actualizaciones**:
  - `PUT /api/patients/[id]/status` - cambiar estado (registra en audit)

### Fase 3: Calendarios (Semana 3)

#### 3.1 Disponibilidad de Psicólogos
- [ ] **API**:
  - `GET /api/psychologists/[id]/availability` - Horarios disponibles
  - `PUT /api/psychologists/[id]/availability` - Editar horarios (from weekly report)
- [ ] **Components**:
  - AvailabilityTable (mostrar horarios por día)
  - TimeSlotPicker (selector visual de horarios)

#### 3.2 Calendario de Citas
- [ ] **Database**: `appointments` tabla
- [ ] **API**:
  - `GET /api/calendar` - Vista calendario (filtrable por psicólogo/paciente/fecha)
  - `POST /api/appointments` - Crear cita
  - `PUT /api/appointments/[id]` - Actualizar estado (SCHEDULED, ATTENDED, NO_SHOW)
- [ ] **Pages**:
  - `/dashboard/calendar` - Vista calendario (para todos)
- [ ] **Components**:
  - CalendarView (mes/semana/día)
  - AppointmentCard (resumen cita)
  - AppointmentForm (crear/editar)

#### 3.3 Vistas por Rol
- [ ] **Psicólogo**: Ve solo SUS citas + disponibilidad
- [ ] **Jefe/Coordinación/Contadora**: Ven TODAS las citas

### Fase 4: Reportes Anuales (Semana 3-4)

#### 4.1 Backend de Reportes
- [ ] **Queries complejas**:
  - Pacientes nuevos por mes (GROUP BY month, serviceArea)
  - Pacientes por estado (COUNT por status)
  - Motivos frecuentes (TOP 10)
  - Duración promedio (AVG appointments per patient)
  - Tasa deserción (NEVER_CAME / total)
- [ ] **API**:
  - `GET /api/reports/annual?year=2024` - Retorna JSON de reportes
  - `GET /api/reports/annual/export?format=pdf|xlsx` - Export

#### 4.2 Frontend de Reportes
- [ ] **Pages**:
  - `/dashboard/reports` - Vista de reportes
- [ ] **Components**:
  - ReportChart (Recharts para gráficos)
  - ReportTable (datos tabulares)
  - ReportExport (botones PDF/Excel)

#### 4.3 Generación de PDF/Excel
- [ ] Usar jsPDF para PDF
- [ ] Usar ExcelJS para Excel
- [ ] Incluir gráficos + tablas en ambos formatos

### Fase 5: Migración de Datos (Semana 4)

#### 5.1 ETL Script
- [ ] Python script que:
  - Lee Google Sheets (SOLICITUD DE CITA - respuestas.xlsx)
  - Parsea campos
  - Mapea a schema Postgres
  - Inserta bulk
  - Maneja duplicados/fechas inválidas
- [ ] **Mapeo**:
  ```
  Timestamp → appointments.createdAt / patients.createdAt
  Área → patients.serviceArea
  Nombre → patients.fullName
  Edad → patients.age
  Fecha nacimiento → patients.dateOfBirth
  Motivo → patients.consultationReason
  Horario → patients.preferredTimeSlot
  Celular → patients.phoneNumber
  Referencia → patients.referenceType
  CURP → patients.curp
  CP → patients.postalCode
  ```

#### 5.2 Validation & Cleanup
- [ ] Verificar integridad referencial
- [ ] Identificar duplicados (nombre + fecha nacimiento)
- [ ] Limpiar fechas inválidas
- [ ] Reporte de inconsistencias

### Fase 6: Polish y Deploy (Semana 4-5)

#### 6.1 Testing
- [ ] E2E tests (Playwright)
  - Flujo nuevo paciente
  - Flujo asignación
  - Flujo reporte semanal
- [ ] Unit tests componentes críticos
- [ ] Testing manual: todas las vistas por rol

#### 6.2 Performance
- [ ] Optimizar queries (índices en Prisma)
- [ ] Lazy load componentes pesados
- [ ] Imagen optimization
- [ ] Bundle analysis

#### 6.3 Seguridad
- [ ] Review de permisos por rol
- [ ] CSRF protection
- [ ] SQL injection prevention (Prisma safe)
- [ ] XSS prevention (React safe by default)
- [ ] Audit log completo

#### 6.4 Mobile Responsive
- [ ] Testing en mobile
- [ ] Ajustar calendarios, tablas para móvil
- [ ] Touch-friendly buttons

#### 6.5 Deployment
- [ ] Vercel setup
- [ ] Environment variables
- [ ] Database backup strategy
- [ ] Monitoring (Sentry)
- [ ] Deploy a production

## Task Breakdown Detallado

### Setup (Día 1-2)

```
[ ] Crear proyecto Next.js
[ ] Configurar TypeScript + Tailwind
[ ] Setup Prisma + PostgreSQL
    [ ] docker-compose.yml para Postgres local
    [ ] schema.prisma base
    [ ] migrate dev
    [ ] prisma studio
[ ] Setup NextAuth.js
    [ ] Credentials provider
    [ ] Role enum
    [ ] Seed data (usuarios test)
[ ] Crear layout base + navbar
[ ] Setup shadcn/ui
```

### Semana 1: Pacientes + Notificaciones

**Día 1-2: Pacientes**
```
[ ] POST /api/patients endpoint
[ ] GET /api/patients endpoint (con filtros)
[ ] GET /api/patients/[id] endpoint
[ ] PUT /api/patients/[id] endpoint
[ ] PatientForm component
[ ] PatientTable component
[ ] /form página pública
[ ] /dashboard/patients página
[ ] /dashboard/patients/[id] página
```

**Día 3-4: Asignación + Sugerencias Smart**
```
[ ] POST /api/assignments endpoint
[ ] GET /api/assignments/suggestions endpoint
    [ ] Lógica: filtrar por especialidad
    [ ] Lógica: ordenar por carga
    [ ] Lógica: verificar disponibilidad
[ ] AssignmentForm component
[ ] /dashboard/assignments página
[ ] Test: asignar paciente → notificación a psicólogo
```

**Día 5: Notificaciones**
```
[ ] Tabla notifications en BD
[ ] POST /api/notifications (internal)
[ ] GET /api/notifications endpoint
[ ] PUT /api/notifications/[id]/read endpoint
[ ] NotificationBell component
[ ] NotificationDropdown component
[ ] Trigger: nuevo formulario → notificación Coordinación
[ ] Trigger: paciente asignado → notificación Psicólogo
```

**Día 6: Dashboard Base**
```
[ ] /dashboard layout + navbar
[ ] Dashboard para Jefe (resumen)
[ ] Dashboard para Coordinación (pendientes)
[ ] Dashboard para Contadora (citas próximas)
[ ] Dashboard para Psicólogo (mis pacientes)
```

### Semana 2: Reporte Semanal

**Día 1-2: Formulario Semanal**
```
[ ] weekly_reports + weekly_report_patient_updates tablas
[ ] POST /api/weekly-reports endpoint
[ ] GET /api/weekly-reports/[id] endpoint
[ ] GET /api/weekly-reports/pending endpoint
[ ] WeeklyReportForm component
    [ ] Horas de atención (input number)
    [ ] Pacientes activos (input number)
    [ ] Lista de pacientes (multiselect dropdown)
    [ ] Estado por paciente (dropdown: Activo, Alta, etc.)
    [ ] Horarios disponibles (time picker)
[ ] /dashboard/weekly-report página
```

**Día 3: Modal Bloqueante**
```
[ ] Middleware que chequea GET /api/weekly-reports/pending al login
[ ] Modal component (bloqueante, no closeable)
[ ] Lógica: lunes → check si reportó viernes
[ ] Si no: mostrar modal hasta completar
[ ] Si sí: permitir acceso normal
[ ] Cron job: lunes 00:00 marcar como "lunes"
```

**Día 4-5: Estados Pacientes**
```
[ ] PUT /api/patients/[id]/status endpoint
[ ] patient_statuses historial tabla
[ ] Lógica: registrar cambios de estado
[ ] Audit: quién, cuándo, qué cambió
[ ] Estados Terapia: Activo, Alta terapéutica, Alta voluntaria, Nunca vino, Referido
[ ] Estados Evaluación: Pruebas, Informe, Canalización, Finalizada
```

### Semana 3: Calendarios + Reportes

**Día 1-2: Disponibilidad**
```
[ ] psychologist_availability tabla
[ ] GET /api/psychologists/[id]/availability endpoint
[ ] PUT /api/psychologists/[id]/availability endpoint
[ ] AvailabilityTable component
[ ] TimeSlotPicker component
[ ] Integración con weekly report (editar horarios)
```

**Día 3-4: Calendario de Citas**
```
[ ] appointments tabla (completa)
[ ] GET /api/calendar endpoint
[ ] POST /api/appointments endpoint
[ ] PUT /api/appointments/[id] endpoint
[ ] CalendarView component (Recharts calendar)
[ ] AppointmentCard component
[ ] /dashboard/calendar página
[ ] Filter por psicólogo/paciente/fecha
[ ] Vistas: psicólogo ve solo suyas, Jefe/Coordinación ven todas
```

**Día 5: Reportes Backend**
```
[ ] Query: pacientes nuevos/mes
[ ] Query: pacientes por estado
[ ] Query: motivos frecuentes
[ ] Query: duración promedio
[ ] Query: tasa deserción
[ ] GET /api/reports/annual endpoint
```

### Semana 4: Reportes Frontend + Migración

**Día 1: Reportes Frontend**
```
[ ] ReportChart component (Recharts)
[ ] ReportTable component
[ ] ReportExport component (PDF/Excel)
[ ] /dashboard/reports página
[ ] Integración jsPDF
[ ] Integración ExcelJS
```

**Día 2-3: ETL Migración**
```
[ ] Python script leer Excel
[ ] Parsear Google Sheets
[ ] Mapear campos a schema
[ ] Validar datos
[ ] Insert bulk a Postgres
[ ] Manejo de duplicados
[ ] Reporte de errores
[ ] Test: verificar 1,452 registros
```

**Día 4: Testing**
```
[ ] E2E test: nuevo paciente
[ ] E2E test: asignación
[ ] E2E test: reporte semanal
[ ] E2E test: calendario
[ ] Unit tests: componentes críticos
```

**Día 5: Deploy**
```
[ ] Setup Vercel
[ ] Environment variables
[ ] Database backup
[ ] Monitoring (Sentry)
[ ] Deploy a production
[ ] Smoke tests
```

## Dependencias y Librerías

### Frontend
```json
{
  "next": "^15.0.0",
  "react": "^19.0.0",
  "typescript": "^5.0.0",
  "tailwindcss": "^3.4.0",
  "@shadcn/ui": "latest",
  "recharts": "^2.10.0",
  "react-calendar": "^4.2.0",
  "jspdf": "^2.5.1",
  "exceljs": "^4.3.0"
}
```

### Backend
```json
{
  "@prisma/client": "^5.0.0",
  "next-auth": "^4.24.0",
  "bcryptjs": "^2.4.3"
}
```

### Dev
```json
{
  "@types/react": "^19.0.0",
  "@types/node": "^20.0.0",
  "prisma": "^5.0.0",
  "eslint": "^8.50.0",
  "prettier": "^3.0.0",
  "@playwright/test": "^1.40.0",
  "husky": "^8.0.0",
  "lint-staged": "^15.0.0"
}
```

## Success Criteria

✅ MVP completado cuando:
1. ✅ Formulario público funciona → pacientes en BD
2. ✅ Coordinación ve formularios → asigna a psicólogos
3. ✅ Psicólogos ven pacientes → actualizan estados semanales
4. ✅ Modal bloqueante funciona → lunes obliga reporte
5. ✅ Calendario integrado → todos ven citas
6. ✅ Reportes anuales generan → PDF/Excel descargables
7. ✅ Notificaciones funcionan → campanita alerta
8. ✅ Datos históricos migrados → 1,452 pacientes en BD
9. ✅ Todas las vistas responsive → funciona en mobile
10. ✅ Deploy en Vercel → accesible por URL

## Estimación Total

- **Setup**: 2 días
- **Fase 1-2**: 5-6 días
- **Fase 3-4**: 4-5 días
- **Fase 5-6**: 3-4 días

**Total: 4-5 semanas de desarrollo full-time**

Con 2-3 horas diarias: 8-10 semanas
