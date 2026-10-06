import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("session API", () => {
  it("sends an explicit CSRF token and same-origin cookies with login", async () => {
    const fetch = vi
      .fn<(path: string, options?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ headerName: "X-CSRF-TOKEN", token: "masked-token" })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "AUTHENTICATED",
            user: { id: "1", email: "owner@example.test" },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await api.login("owner@example.test", "synthetic-password");
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/auth/csrf");
    const request = fetch.mock.calls[1][1];
    expect(request?.credentials).toBe("same-origin");
    expect(new Headers(request?.headers).get("X-CSRF-TOKEN")).toBe("masked-token");
    expect((request?.body as URLSearchParams).get("email")).toBe("owner@example.test");
  });
  it("gets a fresh token for each mutation", async () => {
    const fetch = vi
      .fn<(path: string, options?: RequestInit) => Promise<Response>>()
      .mockImplementation((path: string) =>
        Promise.resolve(
          path.endsWith("csrf")
            ? new Response(JSON.stringify({ headerName: "X-CSRF-TOKEN", token: "token" }))
            : new Response(null, { status: 204 }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await api.logout();
    await api.logout();
    expect(fetch.mock.calls.filter(([path]) => path.endsWith("csrf"))).toHaveLength(2);
  });

  it("sends fresh CSRF and quoted account versions for every account mutation", async () => {
    const fetch = vi
      .fn<(path: string, options?: RequestInit) => Promise<Response>>()
      .mockImplementation((path: string) =>
        Promise.resolve(
          path.endsWith("csrf")
            ? new Response(JSON.stringify({ headerName: "X-CSRF-TOKEN", token: "token" }))
            : new Response(null, { status: 204 }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const account = { id: "synthetic", version: 7 } as import("../types/models").FinancialAccount;
    const input = { name: "Synthetic" } as import("../types/models").CreateAccount;
    await api.updateAccount(account, input);
    await api.archiveAccount(account);
    await api.restoreAccount(account);
    await api.deleteAccount(account);
    const calls = fetch.mock.calls.filter(([path]) => !path.endsWith("csrf"));
    expect(calls.map(([path, options]) => [path, options?.method])).toEqual([
      ["/api/v1/accounts/synthetic", "PUT"],
      ["/api/v1/accounts/synthetic/archive", "POST"],
      ["/api/v1/accounts/synthetic/restore", "POST"],
      ["/api/v1/accounts/synthetic", "DELETE"],
    ]);
    for (const [, options] of calls) {
      expect(new Headers(options?.headers).get("If-Match")).toBe('"7"');
      expect(new Headers(options?.headers).get("X-CSRF-TOKEN")).toBe("token");
    }
    expect(fetch.mock.calls.filter(([path]) => path.endsWith("csrf"))).toHaveLength(4);
  });
});
it("sends fresh CSRF and quoted versions for category lifecycle operations", async () => {
  const fetch = vi
    .fn<(path: string, options?: RequestInit) => Promise<Response>>()
    .mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("csrf")
          ? new Response(JSON.stringify({ headerName: "X-CSRF-TOKEN", token: "synthetic-token" }))
          : new Response(null, { status: 204 }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  const category = { id: "synthetic-category", version: 3 } as import("../types/models").Category;
  const input = { name: "Synthetic category", type: "SPENDING" as const, parentId: null };
  await api.saveCategory(input, category);
  await api.setCategoryActive(category, false);
  await api.setCategoryActive(category, true);
  await api.deleteCategory(category);
  const calls = fetch.mock.calls.filter(([path]) => !path.endsWith("csrf"));
  expect(calls.map(([path, options]) => [path, options?.method])).toEqual([
    ["/api/v1/categories/synthetic-category", "PUT"],
    ["/api/v1/categories/synthetic-category/archive", "POST"],
    ["/api/v1/categories/synthetic-category/restore", "POST"],
    ["/api/v1/categories/synthetic-category", "DELETE"],
  ]);
  for (const [, options] of calls) {
    expect(new Headers(options?.headers).get("If-Match")).toBe('"3"');
    expect(new Headers(options?.headers).get("X-CSRF-TOKEN")).toBe("synthetic-token");
  }
  expect(fetch.mock.calls.filter(([path]) => path.endsWith("csrf"))).toHaveLength(4);
});
