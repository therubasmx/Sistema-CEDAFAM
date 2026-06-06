/**
 * Seeds development data: one user per role, a set of psychologists with
 * specialities + availability, and a few unassigned sample patients.
 *
 * Run with: npm run seed
 */
import {
  PrismaClient,
  Role,
  Speciality,
  WorkType,
  ServiceArea,
  ReferenceType,
  TimeSlot,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEFAULT_PASSWORD = "cedafam123";

async function main() {
  const password = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  // ── Staff users (one per role) ───────────────────────────────
  const [admin, coordinator, accountant] = await Promise.all([
    db.user.upsert({
      where: { email: "jefe@cedafam.mx" },
      update: {},
      create: { email: "jefe@cedafam.mx", password, name: "María Jefa", role: Role.ADMIN },
    }),
    db.user.upsert({
      where: { email: "coordinacion@cedafam.mx" },
      update: {},
      create: {
        email: "coordinacion@cedafam.mx",
        password,
        name: "Carlos Coordinador",
        role: Role.COORDINATOR,
      },
    }),
    db.user.upsert({
      where: { email: "contadora@cedafam.mx" },
      update: {},
      create: {
        email: "contadora@cedafam.mx",
        password,
        name: "Ana Contadora",
        role: Role.ACCOUNTANT,
      },
    }),
  ]);

  // ── Psychologists ────────────────────────────────────────────
  const psychologistSeeds = [
    { email: "clinico1@cedafam.mx", name: "Laura Clínica", speciality: Speciality.CLINICAL, workType: WorkType.FELLOW },
    { email: "clinico2@cedafam.mx", name: "Diego Clínico", speciality: Speciality.CLINICAL, workType: WorkType.PART_TIME },
    { email: "familiar1@cedafam.mx", name: "Sofía Familiar", speciality: Speciality.FAMILY_THERAPY, workType: WorkType.PART_TIME },
    { email: "educativo1@cedafam.mx", name: "Pablo Educativo", speciality: Speciality.EDUCATIONAL, workType: WorkType.INTERN },
    { email: "neuro1@cedafam.mx", name: "Renata Neuro", speciality: Speciality.NEUROPSYCHOLOGY, workType: WorkType.FULL_TIME },
    { email: "psiquiatra1@cedafam.mx", name: "Jorge Psiquiatra", speciality: Speciality.PSYCHIATRY, workType: WorkType.PART_TIME },
  ];

  for (const seed of psychologistSeeds) {
    const user = await db.user.upsert({
      where: { email: seed.email },
      update: {},
      create: {
        email: seed.email,
        password,
        name: seed.name,
        role: Role.PSYCHOLOGIST,
      },
    });

    const psychologist = await db.psychologist.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        speciality: seed.speciality,
        workType: seed.workType,
      },
    });

    // Availability: Mon–Fri morning + afternoon blocks.
    const existing = await db.psychologistAvailability.count({
      where: { psychologistId: psychologist.id },
    });
    if (existing === 0) {
      const blocks = [1, 2, 3, 4, 5].flatMap((day) => [
        { dayOfWeek: day, startTime: "09:00", endTime: "11:00" },
        { dayOfWeek: day, startTime: "14:30", endTime: "17:30" },
      ]);
      await db.psychologistAvailability.createMany({
        data: blocks.map((b) => ({ ...b, psychologistId: psychologist.id })),
      });
    }
  }

  // ── Sample unassigned patients ───────────────────────────────
  const sampleCount = await db.patient.count();
  if (sampleCount === 0) {
    await db.patient.createMany({
      data: [
        {
          fullName: "Juan Pérez",
          age: 28,
          phoneNumber: "5551234567",
          serviceArea: ServiceArea.PSYCHOLOGY,
          referenceType: ReferenceType.NONE,
          consultationReason: "Ansiedad y estrés laboral",
          preferredTimeSlot: TimeSlot.MORNING,
        },
        {
          fullName: "Lucía Gómez",
          age: 9,
          phoneNumber: "5559876543",
          serviceArea: ServiceArea.PSYCHOLOGICAL_EVALUATION,
          referenceType: ReferenceType.UM_STUDENT,
          consultationReason: "Evaluación de dificultades de aprendizaje",
          preferredTimeSlot: TimeSlot.AFTERNOON,
        },
        {
          fullName: "Familia Ramírez",
          age: 40,
          phoneNumber: "5552223344",
          serviceArea: ServiceArea.PSYCHOLOGY,
          referenceType: ReferenceType.COAE,
          consultationReason: "Terapia familiar por conflictos de comunicación",
          preferredTimeSlot: TimeSlot.AFTERNOON,
        },
      ],
    });
  }

  console.log("✅ Seed completado.");
  console.log(`   Usuarios: jefe@, coordinacion@, contadora@, *@cedafam.mx`);
  console.log(`   Contraseña para todos: ${DEFAULT_PASSWORD}`);
  void admin;
  void coordinator;
  void accountant;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
