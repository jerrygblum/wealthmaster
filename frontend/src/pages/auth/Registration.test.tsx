import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { Invitation } from "../../types/models";
import { RegistrationPage } from "./RegistrationPage";
import { RegistrationPanel } from "./RegistrationPanel";
import { LoginPage } from "./LoginPage";
vi.mock("../../services/api", async (original) => {
  const actual = await original<typeof import("../../services/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      registrationPolicy: vi.fn(),
      register: vi.fn(),
      registrationManagement: vi.fn(),
      configureRegistration: vi.fn(),
      invite: vi.fn(),
      replaceInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
      login: vi.fn(),
    },
  };
});
const invitation: Invitation = {
  id: "invitation",
  email: "friend@example.test",
  createdAt: "2026-10-08T12:00:00Z",
  expiresAt: "2026-10-15T12:00:00Z",
  status: "ACTIVE",
  version: 0,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.registrationPolicy).mockResolvedValue({ enabled: true });
  vi.mocked(api.registrationManagement).mockResolvedValue({
    settings: { enabled: false, version: 0 },
    invitations: [invitation],
  });
});
function fillRegistration() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: invitation.email } });
  fireEvent.change(screen.getByLabelText("Invitation code"), {
    target: { value: "synthetic-invitation-code" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "synthetic-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "synthetic-password" },
  });
}
it("hides signup when disabled and handles failed availability requests", async () => {
  vi.mocked(api.registrationPolicy).mockResolvedValue({ enabled: false });
  render(<RegistrationPage onLogin={() => {}} />);
  await screen.findByText("Registration is disabled. Contact the owner.");
  expect(screen.queryByLabelText("Password")).toBeNull();
  expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
    "href",
    "#/net-worth",
  );
});
it("submits the invitation and enters the returned MFA setup session", async () => {
  const accepted = {
    status: "MFA_SETUP_REQUIRED" as const,
    user: { id: "friend", email: invitation.email, role: "MEMBER" as const },
  };
  vi.mocked(api.register).mockResolvedValue(accepted);
  const onLogin = vi.fn();
  render(<RegistrationPage onLogin={onLogin} />);
  await screen.findByLabelText("Email");
  fillRegistration();
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(onLogin).toHaveBeenCalledWith(accepted));
  expect(api.register).toHaveBeenCalledWith({
    email: invitation.email,
    code: "synthetic-invitation-code",
    password: "synthetic-password",
  });
});
it("keeps email but clears secrets when signup fails", async () => {
  vi.mocked(api.register).mockRejectedValue(
    new ApiError(403, "Ask the owner for a valid invitation."),
  );
  render(<RegistrationPage onLogin={() => {}} />);
  await screen.findByLabelText("Email");
  fillRegistration();
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByText("Ask the owner for a valid invitation.");
  expect(screen.getByLabelText("Email")).toHaveValue(invitation.email);
  for (const name of ["Password", "Confirm password", "Invitation code"])
    expect(screen.getByLabelText(name, { exact: true })).toHaveValue("");
});
it("rejects mismatched passwords without submitting", async () => {
  render(<RegistrationPage onLogin={() => {}} />);
  await screen.findByLabelText("Email");
  fillRegistration();
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "different-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByText("Passwords must match.");
  expect(api.register).not.toHaveBeenCalled();
});
it("keeps login available when the registration policy request fails", async () => {
  vi.mocked(api.registrationPolicy).mockRejectedValue(new ApiError(0, "Unavailable"));
  render(<LoginPage notice={null} onLogin={() => {}} />);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  await waitFor(() => expect(api.registrationPolicy).toHaveBeenCalled());
  expect(screen.queryByRole("link", { name: "Register with an invitation" })).toBeNull();
});
it("issues a code once and supports replacing and revoking invitations", async () => {
  vi.mocked(api.invite).mockResolvedValue({ invitation, code: "synthetic-code" });
  vi.mocked(api.replaceInvitation).mockResolvedValue({
    invitation: { ...invitation, version: 1 },
    code: "replacement-code",
  });
  vi.mocked(api.revokeInvitation).mockResolvedValue({
    ...invitation,
    status: "REVOKED",
    version: 2,
  });
  render(<RegistrationPanel onExpired={() => {}} />);
  await screen.findByLabelText("Invite email");
  fireEvent.change(screen.getByLabelText("Invite email"), { target: { value: invitation.email } });
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  await screen.findByDisplayValue("synthetic-code");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss invitation code" }));
  expect(screen.queryByDisplayValue("synthetic-code")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: `Replace invitation for ${invitation.email}` }),
  );
  await screen.findByDisplayValue("replacement-code");
  fireEvent.click(
    screen.getByRole("button", { name: `Revoke invitation for ${invitation.email}` }),
  );
  await waitFor(() => expect(api.revokeInvitation).toHaveBeenCalledWith(invitation));
  expect(screen.queryByDisplayValue("replacement-code")).toBeNull();
});
it("retains failed invitation input and requires reload after stale changes", async () => {
  vi.mocked(api.invite).mockRejectedValue(new ApiError(409, "Email already invited."));
  vi.mocked(api.configureRegistration).mockRejectedValue(new ApiError(412, "Settings changed."));
  render(<RegistrationPanel onExpired={() => {}} />);
  await screen.findByLabelText("Invite email");
  fireEvent.change(screen.getByLabelText("Invite email"), { target: { value: invitation.email } });
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  await screen.findByText("Email already invited.");
  expect(screen.getByLabelText("Invite email")).toHaveValue(invitation.email);
  fireEvent.click(screen.getByLabelText("Allow invited users to register"));
  await screen.findByText("Settings changed.");
  expect(screen.getByRole("button", { name: "Create invitation" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload registration settings" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create invitation" })).toBeEnabled(),
  );
});
it("expires the owner session on protected request failures", async () => {
  vi.mocked(api.registrationManagement).mockRejectedValue(new ApiError(401, "Session expired"));
  const expire = vi.fn();
  render(<RegistrationPanel onExpired={expire} />);
  await waitFor(() => expect(expire).toHaveBeenCalled());
});

it("keeps the selected toggle visible while saving and restores it on failure", async () => {
  let rejectSave!: (error: Error) => void;
  vi.mocked(api.configureRegistration).mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectSave = reject;
      }),
  );
  render(<RegistrationPanel onExpired={() => {}} />);
  const toggle = await screen.findByLabelText("Allow invited users to register");
  fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  expect(toggle).toBeDisabled();
  act(() => {
    rejectSave(new ApiError(500, "Unable to save."));
  });
  await screen.findByText("Unable to save.");
  expect(toggle).not.toBeChecked();
  expect(toggle).toBeEnabled();
});
