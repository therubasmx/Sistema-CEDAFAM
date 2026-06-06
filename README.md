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

### Usuarios de prueba (tras `npm run seed`)

| Rol           | Correo                     | Contraseña    |
| ------------- | -------------------------- | ------------- |
| Jefe Principal| `jefe@cedafam.mx`          | `cedafam123`  |
| Coordinación  | `coordinacion@cedafam.mx`  | `cedafam123`  |
| Contadora     | `contadora@cedafam.mx`     | `cedafam123`  |
| Psicólogo/a   | `clinico1@cedafam.mx` …    | `cedafam123`  |

Otros psicólogos sembrados: `clinico2@`, `familiar1@`, `educativo1@`,
`neuro1@`, `psiquiatra1@` (todos `@cedafam.mx`, misma contraseña).

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

### ⏳ Próximas fases

- **Fase 2**: Reporte semanal obligatorio + modal bloqueante de lunes + cron.
- **Fase 3**: Calendario de citas + disponibilidad.
- **Fase 3-4**: Reportes anuales (5 tipos) + export PDF/Excel.
- **Fase 4**: ETL de 1,452 pacientes históricos + gestión de usuarios admin.

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
