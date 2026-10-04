import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("session API", () => {
  it("sends an explicit CSRF token and same-origin cookies with login", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ headerName: "X-CSRF-TOKEN", token: "masked-token" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "AUTHENTICATED", user: { id: "1", email: "owner@example.test" } })));
    vi.stubGlobal("fetch", fetch);
    await api.login("owner@example.test", "synthetic-password");
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/auth/csrf");
    const request = fetch.mock.calls[1][1];
    expect(request.credentials).toBe("same-origin");
    expect(request.headers["X-CSRF-TOKEN"]).toBe("masked-token");
    expect(request.body.get("email")).toBe("owner@example.test");
  });
  it("gets a fresh token for each mutation", async () => {
    const fetch = vi.fn().mockImplementation((path: string) => Promise.resolve(path.endsWith("csrf")
      ? new Response(JSON.stringify({ headerName: "X-CSRF-TOKEN", token: "token" }))
      : new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetch);
    await api.logout(); await api.logout();
    expect(fetch.mock.calls.filter(([path]) => path.endsWith("csrf"))).toHaveLength(2);
  });
});
