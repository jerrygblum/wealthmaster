export type User = { id: string; email: string };
export type Session =
  | { status: "AUTHENTICATED"; user: User; recoveryUsed?: boolean }
  | { status: "MFA_REQUIRED"; user?: User }
  | { status: "MFA_SETUP_REQUIRED"; user: User };
export type FactorKind = "TOTP" | "RECOVERY";
export type MfaOperation = "ENROLL" | "REPLACE" | "RECOVERY";
export type SecurityStatus = { enabled: boolean; required: boolean; enabledAt: string | null; recoveryCodesRemaining: number; pendingOperation: MfaOperation | null };
export type MfaSetup = { setupKey: string | null; otpauthUri: string | null; expiresAt: string; recoveryCodes: string[] | null };
export type RecoveryCodes = { recoveryCodes: string[]; expiresAt: string };
export type AccountType = "CHECKING" | "SAVINGS" | "CASH" | "CREDIT_CARD" | "INVESTMENT" | "OTHER";
export type BalanceMeaning = "BALANCE" | "AMOUNT_OWED" | "IN_CREDIT";
export type FinancialAccount = {
  id: string; name: string; type: AccountType; institution: string | null;
  currency: string; openingBalance: string; openingDate: string; active: boolean; createdAt: string;
};
export type CreateAccount = {
  name: string; type: AccountType; institution: string; currency: string;
  openingAmount: string; openingDate: string; balanceMeaning: BalanceMeaning;
};
export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}, public retryAfterSeconds = 0) {
    super(message);
  }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...options, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Unable to reach Wealth Master. Check your connection and try again.");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string; fields?: Record<string, string>; retryAfterSeconds?: number };
    throw new ApiError(response.status, error.message ?? "Something went wrong. Please try again.", error.fields, error.retryAfterSeconds);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
async function post<T>(path: string, body?: BodyInit, contentType?: string): Promise<T> {
  const csrf = await request<{ headerName: string; token: string }>("/auth/csrf");
  return request<T>(path, {
    method: "POST", body,
    headers: { [csrf.headerName]: csrf.token, ...(contentType ? { "Content-Type": contentType } : {}) },
  });
}
export const api = {
  session: () => request<Session>("/auth/session"),
  login: (email: string, password: string) => post<Session>("/auth/login", new URLSearchParams({ email, password }), "application/x-www-form-urlencoded"),
  logout: () => post<void>("/auth/logout"),
  security: () => request<SecurityStatus>("/users/me/security"),
  verifyMfa: (code: string, kind: FactorKind) => post<Session>("/auth/mfa/verify", JSON.stringify({ code, kind }), "application/json"),
  startMfa: (operation: MfaOperation, password: string, factor: string, kind: FactorKind) => {
    const path = operation === "ENROLL" ? "enrollment" : operation === "REPLACE" ? "replacement" : "recovery";
    return post<MfaSetup>(`/users/me/mfa/${path}/start`, JSON.stringify({ password, factor, kind }), "application/json");
  },
  verifyEnrollment: (code: string) => post<RecoveryCodes>("/users/me/mfa/enrollment/verify", JSON.stringify({ code }), "application/json"),
  confirmMfa: () => post<Session>("/users/me/mfa/enrollment/confirm", JSON.stringify({ recoveryCodesSaved: true }), "application/json"),
  cancelMfa: () => post<void>("/users/me/mfa/pending/cancel"),
  accounts: () => request<FinancialAccount[]>("/accounts"),
  createAccount: (input: CreateAccount) => post<FinancialAccount>("/accounts", JSON.stringify(input), "application/json"),
};
