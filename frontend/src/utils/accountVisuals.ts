import type { AccountAccent, AccountLogo, FinancialAccount } from "../types/models";
export const accentColors: Record<AccountAccent, string> = {
  DEFAULT: "#64748b",
  BLUE: "#2563eb",
  TEAL: "#0f766e",
  PURPLE: "#7c3aed",
  AMBER: "#b45309",
  ROSE: "#be185d",
};
export const bankMarks: { id: AccountLogo; label: string }[] = [
  { id: "TYPE", label: "Account type (automatic)" },
  { id: "UBS", label: "UBS" },
  { id: "POSTFINANCE", label: "PostFinance" },
  { id: "RAIFFEISEN", label: "Raiffeisen" },
  { id: "ZKB", label: "Zürcher Kantonalbank" },
  { id: "REVOLUT", label: "Revolut" },
];
export function accountColor(account: FinancialAccount) {
  return account.color ?? accentColors[account.accent ?? "DEFAULT"];
}

/** Local files only. Canvas creates a small PNG and drops source metadata. */
export async function prepareAccountLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw new Error("Choose a PNG, JPEG or WebP image up to 2 MB.");
  const image = await createImageBitmap(file);
  try {
    if (image.width > 4096 || image.height > 4096)
      throw new Error("Choose an image up to 4096 × 4096 pixels.");
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    const scale = Math.min(128 / image.width, 128 / image.height);
    const width = image.width * scale,
      height = image.height * scale;
    context.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
    const data = canvas.toDataURL("image/png");
    if (data.length > 43714) throw new Error("This image is too detailed. Choose a simpler logo.");
    return data;
  } finally {
    image.close();
  }
}
