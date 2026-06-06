import { test, expect } from "@playwright/test";

test.describe("Autenticación y permisos", () => {
  test("redirige a /login cuando no hay sesión", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login de coordinación llega al dashboard global", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("coordinacion@cedafam.mx");
    await page.getByLabel("Contraseña").fill("cedafam123");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Pacientes totales")).toBeVisible();
  });

  test("credenciales inválidas muestran error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("coordinacion@cedafam.mx");
    await page.getByLabel("Contraseña").fill("contraseña-incorrecta");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page.getByText(/Credenciales inválidas/)).toBeVisible();
  });

  test("un psicólogo no ve el enlace de Asignaciones", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill("clinico1@cedafam.mx");
    await page.getByLabel("Contraseña").fill("cedafam123");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // El nav de psicólogo no incluye "Asignaciones" (solo coordinación/jefe).
    await expect(page.getByRole("link", { name: "Asignaciones" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Reporte semanal" })).toBeVisible();
  });
});
