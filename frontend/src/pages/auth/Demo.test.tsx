import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LoginPage } from "./LoginPage";
import App from "../application/App";
import { api, ApiError } from "../../services/api";
vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      demoAvailability: vi.fn(),
      enterDemo: vi.fn(),
      registrationPolicy: vi.fn(),
      session: vi.fn(),
      preferences: vi.fn(),
      currentNetWorth: vi.fn(),
    },
  };
});
const session = {
  status: "AUTHENTICATED" as const,
  user: { id: "demo", email: "demo@wealthmaster.example", role: "MEMBER" as const },
  demo: true,
  nextResetAt: "2026-11-07T02:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "#/net-worth";
  vi.mocked(api.demoAvailability).mockResolvedValue({
    enabled: true,
    nextResetAt: session.nextResetAt,
    resetZone: "Europe/Zurich",
    datasetVersion: 1,
  });
  vi.mocked(api.registrationPolicy).mockResolvedValue({ enabled: false });
  vi.mocked(api.enterDemo).mockResolvedValue(session);
  vi.mocked(api.preferences).mockResolvedValue({ defaultCurrency: "CHF", version: 1 });
  vi.mocked(api.currentNetWorth).mockResolvedValue({
    balanceAsOf: "2026-11-06",
    calculatedAt: "2026-11-06T12:00:00Z",
    currencies: [],
    accounts: [],
    excludedFutureAccounts: [],
    unvaluedHoldings: 0,
  });
});
it("offers a password-free entry with clear shared-data and reset notices", async () => {
  const onLogin = vi.fn();
  render(<LoginPage notice={null} onLogin={onLogin} />);
  await screen.findByRole("heading", { name: "Try the shared demo" });
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  expect(screen.getByText(/Use fictional information only/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Try demo" }));
  await waitFor(() => expect(onLogin).toHaveBeenCalledWith(session));
});
it("retains the demo entry and a retryable error during maintenance", async () => {
  vi.mocked(api.enterDemo).mockRejectedValue(
    new ApiError(503, "The shared demo is being restored."),
  );
  render(<LoginPage notice={null} onLogin={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Try demo" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("being restored");
  expect(screen.getByRole("button", { name: "Try demo" })).toBeEnabled();
});
it("falls back to normal login if demo availability is disabled or unavailable", async () => {
  vi.mocked(api.demoAvailability).mockRejectedValue(new Error("Unavailable"));
  render(<LoginPage notice={null} onLogin={vi.fn()} />);
  expect(await screen.findByLabelText("Password")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Try demo" })).not.toBeInTheDocument();
});
it("shows the shared banner, hides imports and provides preferences without security controls", async () => {
  vi.mocked(api.session).mockResolvedValue(session);
  window.location.hash = "#/settings";
  render(<App />);
  await screen.findByRole("heading", { name: "Preferences" });
  expect(screen.getByText("Shared editable demo.")).toBeVisible();
  expect(screen.queryByRole("link", { name: "Migration" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Category mapping" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Set up 2FA/ })).not.toBeInTheDocument();
});
