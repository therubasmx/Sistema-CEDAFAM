import { test, expect } from "@playwright/test";

test.describe("Formulario público de solicitud", () => {
  test("envía una solicitud de cita y confirma recepción", async ({ page }) => {
    await page.goto("/form");

    await page
      .getByLabel("Nombre completo *")
      .fill(`E2E Paciente ${Date.now()}`);
    await page.getByLabel("Edad *").fill("30");
    await page.getByLabel("Celular *").fill("5551112233");

    // Radix Selects: se abren por su placeholder y se elige una opción.
    await page.getByText("Selecciona un área").click();
    await page.getByRole("option", { name: "Psicología", exact: true }).click();

    await page.getByText("Selecciona un horario").click();
    await page.getByRole("option", { name: /Matutino/ }).click();

    await page
      .getByLabel("Motivo de consulta *")
      .fill("Solicitud generada por prueba E2E automatizada");

    await page.getByRole("button", { name: "Enviar solicitud" }).click();

    await expect(page.getByText("¡Solicitud recibida!")).toBeVisible();
  });

  test("muestra validación si faltan campos obligatorios", async ({ page }) => {
    await page.goto("/form");
    // Enviar vacío — el navegador bloquea por required; forzamos sólo nombre.
    await page.getByLabel("Nombre completo *").fill("Ab");
    await page.getByLabel("Edad *").fill("30");
    await page.getByLabel("Celular *").fill("5551112233");
    await page.getByText("Selecciona un área").click();
    await page.getByRole("option", { name: "Psicología", exact: true }).click();
    await page.getByText("Selecciona un horario").click();
    await page.getByRole("option", { name: /Matutino/ }).click();
    await page.getByLabel("Motivo de consulta *").fill("Motivo válido de prueba");
    await page.getByRole("button", { name: "Enviar solicitud" }).click();

    // El nombre "Ab" (<3 chars) dispara el error del servidor.
    await expect(page.getByText("El nombre es obligatorio")).toBeVisible();
  });
});
