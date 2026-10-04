import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";
import { api, ApiError } from "./api";
import type { FactorKind, MfaOperation, MfaSetup, RecoveryCodes, SecurityStatus, Session } from "./api";

function useSecurityAction(onExpired: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown > 0]);
  async function run(work: () => Promise<void>) {
    setPending(true); setError(null);
    try { await work(); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else {
        setError(error instanceof Error ? error.message : "Something went wrong. Try again.");
        if (error instanceof ApiError && error.status === 429) setCooldown(error.retryAfterSeconds || 300);
      }
    } finally { setPending(false); }
  }
  return { run, pending, error, cooldown, disabled: pending || cooldown > 0 };
}
function Feedback({ action }: { action: ReturnType<typeof useSecurityAction> }) {
  return <>{action.error && <p role="alert" className="error">{action.error}</p>}{action.cooldown > 0 && <p role="status">Try again in {action.cooldown} seconds.</p>}</>;
}
function FactorFields({ kind, code, onKind, onCode, optional = false }: {
  kind: FactorKind; code: string; onKind: (kind: FactorKind) => void; onCode: (code: string) => void; optional?: boolean;
}) {
  return <><label htmlFor="factor-kind">Verification method</label><select id="factor-kind" value={kind} onChange={(event) => { onKind(event.target.value as FactorKind); onCode(""); }}><option value="TOTP">Authenticator app</option><option value="RECOVERY">Recovery code</option></select>
    <label htmlFor="factor-code">{kind === "TOTP" ? "Authenticator code" : "Recovery code"}{optional ? " (if needed)" : ""}</label>
    <input id="factor-code" value={code} required={!optional} maxLength={64} autoComplete="one-time-code" inputMode={kind === "TOTP" ? "numeric" : "text"} pattern={kind === "TOTP" ? "[0-9]{6}" : undefined} onChange={(event) => onCode(event.target.value)} />
    {optional && <p className="help">You can leave this blank if you verified a second factor in the last five minutes. Otherwise, enter a new authenticator code or an unused recovery code.</p>}</>;
}
export function MfaLogin({ onSession, onExpired, onLogout }: { onSession: (session: Session) => void; onExpired: () => void; onLogout: () => void }) {
  const [code, setCode] = useState(""); const [kind, setKind] = useState<FactorKind>("TOTP");
  const action = useSecurityAction(onExpired);
  function submit(event: FormEvent) { event.preventDefault(); void action.run(async () => { onSession(await api.verifyMfa(code.trim(), kind)); setCode(""); }); }
  return <main className="center-card panel security-panel"><h1>Verify your sign-in</h1><p>Enter a code to open your workspace. This verification expires after five minutes.</p>
    <form onSubmit={submit}><fieldset disabled={action.disabled}><FactorFields kind={kind} code={code} onKind={setKind} onCode={setCode} /><button type="submit">{action.pending ? "Verifying…" : "Verify and sign in"}</button></fieldset></form><Feedback action={action} />
    <button className="secondary" disabled={action.pending} onClick={() => void action.run(async () => { await api.logout(); onLogout(); })}>Back to sign in</button>
  </main>;
}

type Wizard = { operation: MfaOperation; step: "identity" | "authenticator" | "codes"; setup?: MfaSetup; codes?: RecoveryCodes };
export function SecuritySettings({ requiredSetup, onSession, onExpired, onLogout }: {
  requiredSetup: boolean; onSession: (session: Session) => void; onExpired: () => void; onLogout: () => void;
}) {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const action = useSecurityAction(onExpired);
  async function load() {
    setLoadError(null);
    try { setStatus(await api.security()); }
    catch (error) { if (error instanceof ApiError && error.status === 401) onExpired(); else setLoadError(error instanceof Error ? error.message : "Unable to load settings."); }
  }
  useEffect(() => { void load(); }, []);
  async function cancel() {
    await api.cancelMfa(); setWizard(null); await load();
  }
  async function complete() {
    const session = await api.confirmMfa();
    setWizard(null); setNotice("Security settings updated. Other signed-in sessions must sign in again.");
    onSession(session); await load();
  }
  return <main className="workspace security-panel">
    <div className="workspace-heading"><div><p className="eyebrow">Your workspace</p><h1>Settings</h1><p className="muted">Security</p></div><button className="secondary" disabled={action.pending} onClick={() => void action.run(async () => { await api.logout(); onLogout(); })}>Sign out</button></div>
    {requiredSetup && <p role="status" className="notice">Set up two-factor authentication before accessing your financial accounts.</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {loadError ? <div role="alert" className="error"><p>{loadError}</p><button onClick={() => void load()}>Retry settings</button></div> : !status ? <p role="status">Loading security settings…</p> : <section className="panel">
      <div className="section-heading"><h2>Two-factor authentication</h2><span className="security-badge">{status.enabled ? "Enabled" : "Not enabled"}</span></div>
      <p>{status.required ? "Two-factor authentication is required in this environment." : "Two-factor authentication is optional in development. Once enabled, it is required at every sign-in."}</p>
      {status.enabled && <p>{status.recoveryCodesRemaining} recovery codes remaining.</p>}
      {!wizard && status.pendingOperation && <p className="notice">A setup operation is unfinished. Start again to get a fresh key or recovery codes; previously shown pending codes cannot be redisplayed.</p>}
      {!wizard && <div className="form-actions">{status.enabled ? <><button onClick={() => { setWizard({ operation: "REPLACE", step: "identity" }); setNotice(null); }}>Replace authenticator</button><button className="secondary" onClick={() => { setWizard({ operation: "RECOVERY", step: "identity" }); setNotice(null); }}>Generate new recovery codes</button></> : <button onClick={() => setWizard({ operation: "ENROLL", step: "identity" })}>Set up 2FA</button>}</div>}
      {wizard && <div className="mfa-wizard">
        <h3>{wizard.operation === "ENROLL" ? "Activate 2FA" : wizard.operation === "REPLACE" ? "Replace authenticator" : "Generate new recovery codes"}</h3>
        {wizard.step === "identity" && <IdentityStep existing={status.enabled} disabled={action.disabled} onSubmit={(password, factor, kind) => void action.run(async () => {
          const setup = await api.startMfa(wizard.operation, password, factor, kind);
          setWizard({ ...wizard, setup, step: setup.recoveryCodes ? "codes" : "authenticator", codes: setup.recoveryCodes ? { recoveryCodes: setup.recoveryCodes, expiresAt: setup.expiresAt } : undefined });
        })} />}
        {wizard.step === "authenticator" && wizard.setup && <AuthenticatorStep setup={wizard.setup} disabled={action.disabled} onSubmit={(code) => void action.run(async () => { const codes = await api.verifyEnrollment(code); setWizard({ ...wizard, step: "codes", codes }); })} />}
        {wizard.step === "codes" && wizard.codes && <RecoveryStep codes={wizard.codes} disabled={action.disabled} label={wizard.operation === "ENROLL" ? "Activate 2FA" : "Confirm security change"} onConfirm={() => void action.run(complete)} />}
        <button className="secondary" disabled={action.pending} onClick={() => void action.run(cancel)}>Cancel setup</button>
        {wizard.operation !== "ENROLL" && <p className="help">Your current authenticator and unused recovery codes stay active until you confirm this change.</p>}
      </div>}
      <Feedback action={action} />
    </section>}
  </main>;
}
function IdentityStep({ existing, disabled, onSubmit }: { existing: boolean; disabled: boolean; onSubmit: (password: string, factor: string, kind: FactorKind) => void }) {
  const [password, setPassword] = useState(""); const [factor, setFactor] = useState(""); const [kind, setKind] = useState<FactorKind>("TOTP");
  function submit(event: FormEvent) { event.preventDefault(); onSubmit(password, factor.trim(), kind); setPassword(""); setFactor(""); }
  return <form onSubmit={submit}><fieldset disabled={disabled}><p>First, verify your identity.</p><label htmlFor="settings-password">Current password</label><input id="settings-password" type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} />
    {existing && <FactorFields kind={kind} code={factor} onKind={setKind} onCode={setFactor} optional />}
    <button type="submit">Continue setup</button></fieldset></form>;
}
function AuthenticatorStep({ setup, disabled, onSubmit }: { setup: MfaSetup; disabled: boolean; onSubmit: (code: string) => void }) {
  const [image, setImage] = useState<string | null>(null); const [qrError, setQrError] = useState(false); const [code, setCode] = useState("");
  useEffect(() => {
    let active = true;
    if (setup.otpauthUri) void QRCode.toDataURL(setup.otpauthUri, { width: 240, margin: 2 }).then((url) => { if (active) setImage(url); }).catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [setup.otpauthUri]);
  return <div><p>Scan this QR code with your authenticator app, or enter the setup key manually.</p>{image ? <img className="mfa-qr" src={image} alt="Authenticator setup QR code" /> : <p role="status">{qrError ? "QR unavailable. Use the manual setup key." : "Preparing QR code…"}</p>}
    <label>Manual setup key</label><code className="setup-key">{setup.setupKey}</code><p className="help">Use a time-based, six-digit code with a 30-second period. Setup expires at {new Date(setup.expiresAt).toLocaleTimeString()}.</p>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(code); setCode(""); }}><fieldset disabled={disabled}><label htmlFor="setup-code">Code from your authenticator</label><input id="setup-code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} /><button type="submit">Verify authenticator</button></fieldset></form>
  </div>;
}
function RecoveryStep({ codes, disabled, label, onConfirm }: { codes: RecoveryCodes; disabled: boolean; label: string; onConfirm: () => void }) {
  const [saved, setSaved] = useState(false); const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const text = "Wealth Master recovery codes — keep private. Each code can be used once.\n\n" + codes.recoveryCodes.join("\n") + "\n";
  async function copy() { try { await navigator.clipboard.writeText(text); setCopyMessage("Recovery codes copied."); } catch { setCopyMessage("Copy unavailable. Download the codes or copy them manually."); } }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = "wealthmaster-recovery-codes.txt"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div><h4>Save your recovery codes</h4><p>Use one if you lose access to your authenticator. Store them privately, separate from your device. They are shown only once.</p><ul className="recovery-codes">{codes.recoveryCodes.map((code) => <li key={code}><code>{code}</code></li>)}</ul>
    <div className="form-actions"><button type="button" className="secondary" onClick={() => void copy()}>Copy codes</button><button type="button" className="secondary" onClick={download}>Download codes</button></div>{copyMessage && <p role="status">{copyMessage}</p>}
    <label className="checkbox-label"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />I saved my recovery codes</label><button disabled={disabled || !saved} onClick={onConfirm}>{label}</button><p className="help">Confirm before {new Date(codes.expiresAt).toLocaleTimeString()}. Nothing changes until you confirm.</p>
  </div>;
}
