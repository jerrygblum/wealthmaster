export type User = { id: string; email: string };
export type Session =
  | { status: "AUTHENTICATED"; user: User }
  | { status: "MFA_REQUIRED" };
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
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) {
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
    const error = await response.json().catch(() => ({})) as { message?: string; fields?: Record<string, string> };
    throw new ApiError(response.status, error.message ?? "Something went wrong. Please try again.", error.fields);
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
  accounts: () => request<FinancialAccount[]>("/accounts"),
  createAccount: (input: CreateAccount) => post<FinancialAccount>("/accounts", JSON.stringify(input), "application/json"),
};
