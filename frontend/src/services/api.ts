import type {
  ExpectedInput,
  ExpectedDefinition,
  ExpectedOccurrence,
  ExpectedReport,
  ExpectedRecordInput,
  Preferences,
  SpendingPeriod,
  Category,
  CategoryInput,
  CategoryList,
  CreateAccount,
  CurrentNetWorth,
  FactorKind,
  FinancialAccount,
  LedgerInput,
  MfaOperation,
  MfaSetup,
  Operation,
  RecoveryCodes,
  SecurityStatus,
  Session,
  SpendingReport,
} from "../types/models";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
    public retryAfterSeconds = 0,
  ) {
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
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
      fields?: Record<string, string>;
      retryAfterSeconds?: number;
    };
    throw new ApiError(
      response.status,
      error.message ?? "Something went wrong. Please try again.",
      error.fields,
      error.retryAfterSeconds,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
async function post<T>(path: string, body?: BodyInit, contentType?: string): Promise<T> {
  const csrf = await request<{ headerName: string; token: string }>("/auth/csrf");
  return request<T>(path, {
    method: "POST",
    body,
    headers: {
      [csrf.headerName]: csrf.token,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
  });
}
async function mutateAccount<T>(
  account: FinancialAccount,
  method: string,
  suffix = "",
  input?: CreateAccount,
): Promise<T> {
  const csrf = await request<{ headerName: string; token: string }>("/auth/csrf");
  return request<T>(`/accounts/${account.id}${suffix}`, {
    method,
    headers: {
      [csrf.headerName]: csrf.token,
      "If-Match": `"${account.version}"`,
      ...(input ? { "Content-Type": "application/json" } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
}

async function ledgerMutation<T>(
  path: string,
  method: string,
  input?: unknown,
  version?: number,
): Promise<T> {
  const csrf = await request<{ headerName: string; token: string }>("/auth/csrf");
  return request<T>(path, {
    method,
    headers: {
      [csrf.headerName]: csrf.token,
      "Content-Type": "application/json",
      ...(version === undefined ? {} : { "If-Match": `"${version}"` }),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
}

export const api = {
  expected: (month?: string) =>
    request<ExpectedReport>(`/expected-transactions${month ? `?month=${month}` : ""}`),
  saveExpected: (input: ExpectedInput, definition?: ExpectedDefinition) =>
    ledgerMutation<ExpectedDefinition>(
      `/expected-transactions${definition ? `/${definition.id}` : ""}`,
      definition ? "PUT" : "POST",
      input,
      definition?.version,
    ),
  deleteExpected: (definition: ExpectedDefinition) =>
    ledgerMutation<void>(
      `/expected-transactions/${definition.id}`,
      "DELETE",
      undefined,
      definition.version,
    ),
  expectedCandidates: (item: ExpectedOccurrence, month: string, page: number) =>
    request<{ items: Operation[]; page: number; hasMore: boolean }>(
      `/expected-transactions/${item.definition.id}/occurrences/${month}/candidates?page=${page}`,
    ),
  reconcileExpected: (
    item: ExpectedOccurrence,
    month: string,
    operation?: Operation,
    skipped = false,
  ) =>
    ledgerMutation<ExpectedOccurrence>(
      `/expected-transactions/${item.definition.id}/occurrences/${month}`,
      "PUT",
      {
        definitionVersion: item.definition.version,
        operationId: operation?.id ?? null,
        operationVersion: operation?.version ?? null,
        skipped,
      },
      item.version,
    ),
  recordExpected: (item: ExpectedOccurrence, month: string, input: ExpectedRecordInput) =>
    ledgerMutation<ExpectedOccurrence>(
      `/expected-transactions/${item.definition.id}/occurrences/${month}/record`,
      "POST",
      { ...input, definitionVersion: item.definition.version },
      item.version,
    ),
  preferences: () => request<Preferences>("/users/me/preferences"),
  savePreferences: (input: { defaultCurrency: string; expectedVersion: number }) =>
    ledgerMutation<Preferences>("/users/me/preferences", "PUT", input),
  spending: (periodType: SpendingPeriod, periodStart?: string) =>
    request<SpendingReport>(
      `/spending?periodType=${periodType}${periodStart ? `&periodStart=${periodStart}` : ""}`,
    ),
  spendingActivity: (
    periodType: SpendingPeriod,
    periodStart: string,
    currency: string,
    categoryId: string | null,
    page: number,
  ) =>
    request<{ items: Operation[]; page: number; hasMore: boolean }>(
      `/spending/activity?periodType=${periodType}&periodStart=${periodStart}&currency=${currency}${categoryId ? `&categoryId=${categoryId}` : ""}&page=${page}`,
    ),
  categories: () => request<CategoryList>("/categories"),
  installCategoryStarters: () => post<CategoryList>("/categories/starter-set"),
  saveCategory: (input: CategoryInput, category?: Category) =>
    ledgerMutation<Category>(
      `/categories${category ? `/${category.id}` : ""}`,
      category ? "PUT" : "POST",
      input,
      category?.version,
    ),
  setCategoryActive: (category: Category, active: boolean) =>
    ledgerMutation<Category>(
      `/categories/${category.id}/${active ? "restore" : "archive"}`,
      "POST",
      undefined,
      category.version,
    ),
  deleteCategory: (category: Category) =>
    ledgerMutation<void>(`/categories/${category.id}`, "DELETE", undefined, category.version),
  currentNetWorth: () => request<CurrentNetWorth>("/net-worth/current"),
  account: (id: string) => request<FinancialAccount>(`/accounts/${id}`),
  activity: (id: string, page: number) =>
    request<{ items: Operation[]; page: number; hasMore: boolean }>(
      `/transactions?accountId=${id}&page=${page}`,
    ),
  saveActivity: (input: LedgerInput, operation?: Operation) => {
    const transfer = input.kind === "TRANSFER";
    const body = transfer
      ? {
          sourceAccountId: input.accountId,
          destinationAccountId: input.destinationAccountId,
          amount: input.amount,
          transactionDate: input.transactionDate,
          description: input.description,
          notes: input.notes,
        }
      : input;
    return ledgerMutation<Operation>(
      `/${transfer ? "transfers" : "transactions"}${operation ? `/${operation.id}` : ""}`,
      operation ? "PUT" : "POST",
      body,
      operation?.version,
    );
  },
  deleteActivity: (operation: Operation) =>
    ledgerMutation<void>(
      `/${operation.kind === "TRANSFER" ? "transfers" : "transactions"}/${operation.id}`,
      "DELETE",
      undefined,
      operation.version,
    ),
  session: () => request<Session>("/auth/session"),
  login: (email: string, password: string) =>
    post<Session>(
      "/auth/login",
      new URLSearchParams({ email, password }),
      "application/x-www-form-urlencoded",
    ),
  logout: () => post<void>("/auth/logout"),
  security: () => request<SecurityStatus>("/users/me/security"),
  verifyMfa: (code: string, kind: FactorKind) =>
    post<Session>("/auth/mfa/verify", JSON.stringify({ code, kind }), "application/json"),
  startMfa: (operation: MfaOperation, password: string, factor: string, kind: FactorKind) => {
    const path =
      operation === "ENROLL" ? "enrollment" : operation === "REPLACE" ? "replacement" : "recovery";
    return post<MfaSetup>(
      `/users/me/mfa/${path}/start`,
      JSON.stringify({ password, factor, kind }),
      "application/json",
    );
  },
  verifyEnrollment: (code: string) =>
    post<RecoveryCodes>(
      "/users/me/mfa/enrollment/verify",
      JSON.stringify({ code }),
      "application/json",
    ),
  confirmMfa: () =>
    post<Session>(
      "/users/me/mfa/enrollment/confirm",
      JSON.stringify({ recoveryCodesSaved: true }),
      "application/json",
    ),
  cancelMfa: () => post<void>("/users/me/mfa/pending/cancel"),
  accounts: () => request<FinancialAccount[]>("/accounts"),
  updateAccount: (account: FinancialAccount, input: CreateAccount) =>
    mutateAccount<FinancialAccount>(account, "PUT", "", input),
  deleteAccount: (account: FinancialAccount) => mutateAccount<void>(account, "DELETE"),
  archiveAccount: (account: FinancialAccount) =>
    mutateAccount<FinancialAccount>(account, "POST", "/archive"),
  restoreAccount: (account: FinancialAccount) =>
    mutateAccount<FinancialAccount>(account, "POST", "/restore"),
  createAccount: (input: CreateAccount) =>
    post<FinancialAccount>("/accounts", JSON.stringify(input), "application/json"),
};
