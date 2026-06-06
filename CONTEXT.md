# CEDAFAM - Sistema de Gestión de Consultas Psicológicas

## Visión General

Sistema web de gestión integral para **consultas psicológicas y psiquiátricas** en CEDAFAM. Consolida múltiples hojas de cálculo en una plataforma centralizada con:
- Registro de pacientes (1,452+ históricos desde nov 2022)
- Asignación inteligente de psicólogos
- Calendario de citas integrado
- Reportes anuales con análisis
- Notificaciones en tiempo real

## Problemas que Resuelve

1. **Fragmentación de datos**: ~10 hojas de cálculo dispersas → 1 sistema centralizado
2. **Falta de sincronización**: Calendarios Google individuales no visibles → calendario integrado
3. **Procesos manuales**: Confirmación WhatsApp manual, asignación manual → sistema ordenado
4. **Falta de visibilidad**: No hay datos de entrada/salida, carga de psicólogos → reportes automáticos
5. **Tiempo de espera largo**: Desde solicitud hasta cita confirmada → flujo optimizado

## Usuarios y Roles

| Rol | Cantidad | Acceso | Responsabilidades |
|-----|----------|--------|-------------------|
| **Jefe Principal** | 1 | Total (todo) | Supervisión, reportes, auditoría |
| **Coordinación Atención** | 1 | Total (ver + editar) | Asignar pacientes, gestionar flujo |
| **Contadora** | 1 | Total (solo lectura) | Ver citas, confirmar con pacientes |
| **Psicólogos** (7) | 7 | Sus pacientes | Actualizar estados, disponibilidad |
| **Neuropsicologa** | 1 | Sus pacientes + eval neuro | Evaluaciones neuropsicológicas + terapia |

**Total: 14 usuarios** (algunos rotativos: 4 becarios 2 años, 4 pasantes 1 año)

## Especialidades

- **Psicología Clínica**: 2 part-time + 4 becarios + 2 pasantes clínica
- **Terapia Familiar**: 2 part-time + 4 becarios  
- **Psicología Educativa**: 2 pasantes
- **Neuropsicología**: 1 neuropsicologa (eval + terapia)
- **Psiquiatría**: 1 psiquiatra part-time

## Datos Históricos

- **Período**: nov 2022 - presente
- **Total registros**: 1,452 pacientes
- **Estructura**: Google Sheets con 11 campos principales
- **A migrar**: Todos los registros al nuevo sistema

## Horarios Operacionales

- **Reporte semanal**: Viernes antes de 12:30pm (obligatorio)
- **Bloqueo modal**: Si no se completó viernes → aparece lunes (bloquea acceso)
- **Horarios atención**:
  - Matutino: 9:00am - 11:00am
  - Vespertino: 2:30pm - 5:30pm

## Programas Especiales

**SIERE** (Beneficiencia):
- Descuentos por solicitud de paciente: $100, $280, $370, $490
- Aplicable a terapias (NO a evaluaciones)
- Solicitado verbalmente a Coordinación
- Psicólogo lo aplica en primera sesión o durante terapia

**Consulta de Exploración**:
- Temporal, gratuita, sin expediente físico
- Para determinar necesidad del paciente
- Se registra en sistema (rastreo beneficiencia vs particular)
- Cualquier psicólogo disponible puede hacerla

## Estados del Sistema

### Estados de Terapia
- Activo
- Alta terapéutica
- Alta voluntaria
- Nunca vino (no asistió)
- Referido (interno o externo)

### Estados de Evaluación
- Aplicación de pruebas
- Elaboración de informe
- Canalización
- Evaluación finalizada

## Flujos Clave

### Flujo de Evaluación
1. Paciente llena formulario online
2. Coordinación revisa motivo:
   - **Específico** → asigna a psicólogo del área
   - **No específico** → Coordinación llama al paciente
     - Si se concreta → asigna a psicólogo
     - Si no → ofrece consulta de exploración
3. Consulta de exploración: psicólogo disponible determina necesidad
4. Psicólogo comunica a Coordinación
5. Coordinación canaliza al área de especialidad

### Flujo de Terapia
1. Paciente asignado a psicólogo
2. Psicólogo ve automáticamente al paciente en su lista
3. Psicólogo propone horario (formulario semanal obligatorio)
4. Coordinación confirma con Contadora
5. Contadora envía WhatsApp manual al paciente
6. Psicólogo aplica SIERE si corresponde (verbal a Coordinación)
7. Psicólogo registra sesiones y estados en formulario semanal

### Flujo de Asignación Inteligente
1. Paciente llena formulario
2. Sistema sugiere 2-3 psicólogos basado en:
   - Especialidad requerida
   - Carga actual (menos pacientes = prioridad)
   - Disponibilidad de horario
3. Coordinación elige final (decisión humana)
4. Psicólogo ve al paciente automáticamente en su lista

## Calendarios

- **Psicólogos**: Ven solo sus pacientes (no pueden ver otros)
- **Jefe + Contadora + Coordinación**: Ven calendario de TODOS los pacientes
- **Sistema**: Integrado en la app (no Google Calendar)

## Notificaciones

- **Banner/popup** en el sistema + **campanita de notificaciones**
- Al hacer click en campanita → lista de notificaciones
- **Coordinación**: Nuevos formularios llegados
- **Psicólogos**: Cuando se les asigna un paciente

## Reportes Anuales

**5 reportes automáticos** (acceso: Jefe + Coordinación):

1. **Pacientes nuevos/mes** (terapia vs evaluación, por tipo)
2. **Pacientes por estado** (terapia + evaluación) + carga por psicólogo
3. **Motivos consulta más frecuentes** (terapia vs evaluación por tipo)
4. **Duración promedio** (evaluaciones en semanas, terapias en semanas/meses)
5. **Tasa de deserción** (% pacientes que nunca vinieron)

**Formatos**: Automático en sistema + descarga Excel/PDF + gráficos/dashboards

## Información Historial Paciente

- Todas las citas (confirmadas, asistidas, no asistidas)
- Tipo de servicio (evaluación/terapia)
- Estado actual (según corresponda)
- Fecha de consulta
- Motivo de consulta
- Fechas y semanas de atención
- Fecha de entrada y salida (para reportes anuales)

## Stack Tecnológico

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js (API routes de Next.js)
- **Base de datos**: PostgreSQL
- **ORM**: Prisma
- **Gráficos**: Recharts
- **Reportes**: jsPDF + ExcelJS
- **Autenticación**: NextAuth.js + usuario/contraseña propio
- **Hosting**: Vercel
- **Timeline**: MVP lo más pronto posible

## Datos Sensibles

- OMITIR: Datos sensibles de salud (diagnósticos, historia psiquiátrica)
- CAPTURAR: Solo necesarios para operación (nombre, edad, motivo consulta)
