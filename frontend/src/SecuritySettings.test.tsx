import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecuritySettings, MfaLogin } from "./SecuritySettings";
import { api, ApiError } from "./api";
vi.mock("qrcode", () => ({ default: { toDataURL: () => Promise.resolve("data:image/png;base64,test") } }));
vi.mock("./api", async (original) => {
  const actual = await original<typeof import("./api")>();
  return { ...actual, api: { security: vi.fn(), verifyMfa: vi.fn(), startMfa: vi.fn(), verifyEnrollment: vi.fn(), confirmMfa: vi.fn(), cancelMfa: vi.fn(), logout: vi.fn() } };
});
const session = { status: "AUTHENTICATED" as const, user: { id: "synthetic-owner", email: "owner@example.test" } };
const codes = { recoveryCodes: ["synthetic-code-one", "synthetic-code-two"], expiresAt: "2027-01-01T00:00:00Z" };
const callbacks = { onSession: vi.fn(), onExpired: vi.fn(), onLogout: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.security).mockResolvedValue({ enabled: false, required: true, enabledAt: null, recoveryCodesRemaining: 0, pendingOperation: null });
  vi.mocked(api.startMfa).mockResolvedValue({ setupKey: "SYNTHETICSETUPKEY", otpauthUri: "otpauth://totp/Synthetic?secret=SYNTHETICSETUPKEY", expiresAt: codes.expiresAt, recoveryCodes: null });
  vi.mocked(api.verifyEnrollment).mockResolvedValue(codes);
  vi.mocked(api.confirmMfa).mockResolvedValue(session);
});
async function start() {
  render(<SecuritySettings requiredSetup {...callbacks} />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up 2FA" }));
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "synthetic-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
  await screen.findByText("SYNTHETICSETUPKEY");
}
describe("security settings", () => {
  it("requires password verification, an authenticator proof, and saved-code confirmation", async () => {
    await start();
    expect(api.startMfa).toHaveBeenCalledWith("ENROLL", "synthetic-password", "", "TOTP");
    expect(api.confirmMfa).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Code from your authenticator"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify authenticator" }));
    await screen.findByText("synthetic-code-one");
    expect(screen.getByRole("button", { name: "Activate 2FA" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("I saved my recovery codes"));
    fireEvent.click(screen.getByRole("button", { name: "Activate 2FA" }));
    await waitFor(() => expect(callbacks.onSession).toHaveBeenCalledWith(session));
  });
  it("keeps setup pending after an invalid code and allows cancellation", async () => {
    vi.mocked(api.verifyEnrollment).mockRejectedValue(new ApiError(400, "Invalid authenticator code."));
    vi.mocked(api.cancelMfa).mockResolvedValue();
    await start();
    fireEvent.change(screen.getByLabelText("Code from your authenticator"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify authenticator" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid authenticator code");
    expect(api.confirmMfa).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel setup" }));
    await screen.findByRole("button", { name: "Set up 2FA" });
    expect(api.cancelMfa).toHaveBeenCalledOnce();
  });
  it("never redisplays saved codes after a reload and offers a new setup", async () => {
    vi.mocked(api.security).mockResolvedValue({ enabled: false, required: true, enabledAt: null, recoveryCodesRemaining: 0, pendingOperation: "ENROLL" });
    render(<SecuritySettings requiredSetup {...callbacks} />);
    expect(await screen.findByText(/cannot be redisplayed/)).toBeInTheDocument();
    expect(api.verifyEnrollment).not.toHaveBeenCalled();
    expect(screen.queryByText("synthetic-code-one")).not.toBeInTheDocument();
  });
  it("stages regenerated codes and leaves the old factor enabled", async () => {
    vi.mocked(api.security).mockResolvedValue({ enabled: true, required: false, enabledAt: "2026-10-04T00:00:00Z", recoveryCodesRemaining: 9, pendingOperation: null });
    vi.mocked(api.startMfa).mockResolvedValue({ setupKey: null, otpauthUri: null, expiresAt: codes.expiresAt, recoveryCodes: codes.recoveryCodes });
    render(<SecuritySettings requiredSetup={false} {...callbacks} />);
    fireEvent.click(await screen.findByRole("button", { name: "Generate new recovery codes" }));
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "synthetic-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue setup" }));
    await screen.findByText("synthetic-code-one");
    expect(api.confirmMfa).not.toHaveBeenCalled();
    expect(screen.getByText(/current authenticator and unused recovery codes stay active/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disable/i })).not.toBeInTheDocument();
  });
});
describe("login verification", () => {
  it("allows a recovery code and passes the completed session to the app", async () => {
    vi.mocked(api.verifyMfa).mockResolvedValue({ ...session, recoveryUsed: true });
    render(<MfaLogin {...callbacks} />);
    fireEvent.change(screen.getByLabelText("Verification method"), { target: { value: "RECOVERY" } });
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "synthetic-code" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(callbacks.onSession).toHaveBeenCalledWith(expect.objectContaining({ recoveryUsed: true })));
    expect(api.verifyMfa).toHaveBeenCalledWith("synthetic-code", "RECOVERY");
  });
  it("shows throttling and disables verification during cooldown", async () => {
    vi.mocked(api.verifyMfa).mockRejectedValue(new ApiError(429, "Too many failed attempts.", {}, 300));
    render(<MfaLogin {...callbacks} />);
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many failed attempts");
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled();
  });
  it("returns to login for an expired challenge", async () => {
    vi.mocked(api.verifyMfa).mockRejectedValue(new ApiError(401, "Session expired."));
    render(<MfaLogin {...callbacks} />);
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(callbacks.onExpired).toHaveBeenCalledOnce());
  });
});
