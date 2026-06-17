# Sistema CEDAFAM

Plataforma de gestión de consultas psicológicas y psiquiátricas para CEDAFAM.
Consolida el registro de pacientes, asignación de psicólogos, calendario,
reportes y notificaciones en un solo sistema.

## Stack

- **Next.js 15** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** + componentes estilo **shadcn/ui** (Radix UI)
- **PostgreSQL** + **Prisma ORM**
- **NextAuth.js** (credenciales propias, sesiones JWT)
- Despliegue en **Vercel**

## Requisitos

- Node.js 20+ (probado con Node 24)
- Una base de datos PostgreSQL. Para desarrollo se recomienda
  [Neon](https://neon.tech) (gratis) o Postgres local.

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
#   Edita .env y coloca tu DATABASE_URL y un NEXTAUTH_SECRET
#   (genera el secreto con: openssl rand -base64 32)

# 3. Crear el esquema en la base de datos
npm run prisma:push      # o: npm run prisma:migrate  (con migraciones versionadas)

# 4. Cargar datos de prueba (usuarios + psicólogos + pacientes de ejemplo)
npm run seed

# 5. Levantar el servidor de desarrollo
npm run dev              # http://localhost:3000
```

## Scripts

| Comando                  | Descripción                                  |
| ------------------------ | -------------------------------------------- |
| `npm run dev`            | Servidor de desarrollo                       |
| `npm run build`          | `prisma generate` + build de producción      |
| `npm run typecheck`      | Verificación de tipos (sin emitir)           |
| `npm run prisma:push`    | Sincroniza el esquema con la BD              |
| `npm run prisma:studio`  | Explorador visual de la BD                   |
| `npm run seed`           | Datos de prueba                              |
| `npm run migrate:patients` | ETL de datos históricos (Fase 4 — pendiente) |

## Estado de implementación

### ✅ Fase 1 — Núcleo (entregado)

- Autenticación con roles (`ADMIN`, `COORDINATOR`, `ACCOUNTANT`, `PSYCHOLOGIST`)
  y middleware de protección de rutas.
- Esquema completo de base de datos (12 modelos / 17 entidades con enums).
- **Formulario público** de solicitud de cita (`/form`).
- **CRUD de pacientes** con permisos por rol y alcance "solo míos" para
  psicólogos.
- **Historial de estados** del paciente (append-only) + auditoría.
- **Asignación inteligente**: sugerencias (especialidad + carga +
  disponibilidad) y asignación transaccional.
- **Notificaciones** (campanita + triggers: nuevo formulario, paciente asignado).
- Dashboards por rol con tarjetas de resumen.

### ✅ Fase 2 — Reporte semanal obligatorio (entregado)

- **Formulario semanal**: horas de atención, pacientes activos, estado por
  paciente (terapia/evaluación) y selector de disponibilidad próxima semana.
- **Modal bloqueante de lunes**: si el reporte de la semana anterior está
  vencido, aparece un modal no cerrable (sin botón X, ignora Escape y clic
  fuera) que obliga a completarlo antes de usar el sistema.
- La semana a reportar se resuelve en el servidor (no se puede backfill
  arbitrario); envío transaccional que además apendiza el historial de estado
  del paciente y reemplaza la disponibilidad.
- **Cron** (`/api/cron/weekly-report-reminder`, lunes 00:00 vía `vercel.json`):
  notifica a los psicólogos con reportes vencidos, protegido por `CRON_SECRET`,
  con deduplicación por semana.

### ✅ Fase 3 — Calendario + disponibilidad (entregado)

- **Calendario semanal** (`/dashboard/calendar`): navegación por semana, vista
  en grilla de 7 días, role-scoped (psicólogos solo ven sus citas; jefe /
  coordinación / contadora ven todas y filtran por psicólogo).
- **Citas**: crear (con verificación de solape → 409), editar y cambiar estado
  (agendada / asistió / no asistió / cancelada). Psicólogos solo gestionan las
  suyas.
- **Disponibilidad** (`/dashboard/availability`): editor de bloques
  matutino/vespertino por día; alimenta las sugerencias de asignación.
- Endpoints: `GET /api/calendar`, `POST/PUT /api/appointments`,
  `GET/PUT /api/psychologists/[id]/availability`.

### ✅ Fase 3-4 — Reportes anuales (entregado)

- **5 reportes** (`/dashboard/reports`, solo jefe/coordinación): pacientes
  nuevos por mes y área, pacientes por estado (terapia/evaluación), motivos de
  consulta más frecuentes, duración promedio (terapia en meses, evaluación en
  semanas) y tasa de deserción.
- Gráficos con **Recharts** + selector de año.
- **Export PDF** (jsPDF) y **Excel** (ExcelJS):
  `GET /api/reports/annual/export?year=YYYY&format=pdf|xlsx`.

### ✅ Fase 4 — Migración + gestión de usuarios (entregado)

- **ETL** (`npm run migrate:patients`): migra los pacientes históricos del
  Excel, normaliza área/horario/referencia, es idempotente (omite duplicados) y
  soporta `--dry-run`. Migrados **1,289 pacientes** del archivo original.
- **Gestión de usuarios** (`/admin/users`, solo jefe): crear cuentas (con perfil
  de psicólogo cuando aplica), activar/desactivar, con auditoría. `GET/POST
  /api/users`, `PUT /api/users/[id]`.

🎉 **Las 6 fases del MVP están completas y verificadas end-to-end.**

## Permisos por rol

Ver `lib/permissions.ts` para la matriz completa. Resumen:

| Acción                  | Jefe | Coord. | Contadora | Psicólogo |
| ----------------------- | :--: | :----: | :-------: | :-------: |
| Ver pacientes           |  ✅  |   ✅   |  ✅ (R)   | ✅ (suyos)|
| Crear/editar pacientes  |  ✅  |   ✅   |    ❌     |    ❌     |
| Asignar pacientes       |  ❌  |   ✅   |    ❌     |    ❌     |
| Cambiar estado          |  ✅  |   ✅   |    ❌     | ✅ (suyos)|
| Ver reportes anuales    |  ✅  |   ✅   |    ❌     |    ❌     |

## Arquitectura

Ver [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTEXT.md`](CONTEXT.md) y
[`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md) para el detalle de modelo de datos,
flujos de negocio y plan completo.

## Despliegue en Vercel

1. Importa el repo en Vercel.
2. Configura las variables `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.
3. El comando de build (`npm run build`) ejecuta `prisma generate`
   automáticamente.
4. Ejecuta `prisma migrate deploy` contra la BD de producción.
