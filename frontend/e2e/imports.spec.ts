import { expect, test } from "@playwright/test";
import { enroll, openAccounts, passwordLogin, syntheticUser } from "./helpers";

const syntheticWorkbook = Buffer.from(
  "UEsDBBQAAAAIADmVTF2OqRD0egAAAJcAAAAPAAAAeGwvd29ya2Jvb2sueG1sNY5BDsIgEEWv0nAAp7pwQYCVN/AEiIOQFobMTKPe3i7s6uflvcV3b+LlQbRMn7Z2sexNUR0WQFLBFuVEA/vuMnGLuiO/gHKuCW+UtoZd4TLPV2Bco1bqUuoQE5wURJX/Tj029Ob+7VpQazIT2/r0hs8GgoOjheNM+AFQSwMEFAAAAAgAOZVMXc4P4qg9AAAAVQAAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc7MJSs1JLMnMzyvOyCwotrNB5ip4ptgqFRkqKYQkFqWnltgqlecXZRdnpKaWFOuDKUO9itwcJX07G31UUwBQSwMEFAAAAAgAOZVMXSgBFYasAAAAyAEAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWx10csKgzAQBdBfkewlMbTQRQy01b62he6DHaoIWpLBx9936sJ2BBchIXNuEiamb30dSgC0Zpoyh84a3/aRT0UirCm+i30iIkxFQE87nSUERnbWyIIG4Tmh54RmCa30JlZJrLZzbmJHzvLhDU0AbjJuDq6pOcg5uI8NloAV1ehRmtsTtzvFy2dejpf1y9pVBbXk1fqR8yvnjyo4Dm7r5/lnhDDgos/y75fk7/M+UEsBAhQDFAAAAAgAOZVMXY6pEPR6AAAAlwAAAA8AAAAAAAAAAAAAAIABAAAAAHhsL3dvcmtib29rLnhtbFBLAQIUAxQAAAAIADmVTF3OD+KoPQAAAFUAAAAaAAAAAAAAAAAAAACAAacAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc1BLAQIUAxQAAAAIADmVTF0oARWGrAAAAMgBAAAYAAAAAAAAAAAAAACAARwBAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwUGAAAAAAMAAwDLAAAA/gEAAAAA",
  "base64",
);

test("stages a synthetic workbook without creating accounts", async ({ page }) => {
  const email = await syntheticUser();
  if ((await passwordLogin(page, email)) === "MFA_SETUP_REQUIRED") await enroll(page);

  await page.getByRole("link", { name: "Migration" }).click();
  await page.getByLabel(/Workbook/).setInputFiles({
    name: "synthetic.xlsm",
    mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
    buffer: syntheticWorkbook,
  });
  await expect(page.getByRole("heading", { name: "Choose source columns" })).toBeVisible();
  await expect(page.getByText(/Macros are never executed/)).toBeVisible();

  await page.getByRole("button", { name: "Prepare row decisions" }).click();
  await expect(
    page.getByRole("heading", { name: "Map accounts, cards and categories" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Use Uncategorized for all rows" })).toBeVisible();

  await openAccounts(page);
  await expect(page.getByRole("heading", { name: "Your first account starts here" })).toBeVisible();
});
