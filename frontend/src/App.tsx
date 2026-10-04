import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { SecuritySettings, MfaLogin } from "./SecuritySettings";
import { api, ApiError } from "./api";
import type { AccountType, BalanceMeaning, CreateAccount, FinancialAccount, Session, User } from "./api";

const accountTypes: Record<AccountType, string> = {
  CHECKING: "Checking", SAVINGS: "Savings", CASH: "Cash", CREDIT_CARD: "Credit card", INVESTMENT: "Investment", OTHER: "Other",
};
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
// Keep decimal amounts as strings, including when rendering large balances.
export function displayAmount(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const decimals = fraction.replace(/0+$/, "");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "’")}${decimals ? `.${decimals}` : ""}`;
}

export default function App() {
  const [page, setPage] = useState(window.location.hash === "#/settings" ? "settings" : "accounts");
  useEffect(() => { const change = () => setPage(window.location.hash === "#/settings" ? "settings" : "accounts"); window.addEventListener("hashchange", change); return () => window.removeEventListener("hashchange", change); }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const restore = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSession(await api.session()); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) setSession(null);
      else setError(errorMessage(err));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void restore(); }, [restore]);
  const expire = useCallback(() => {
    setSession(null); setNotice("Your session expired. Please sign in again.");
  }, []);
  function acceptSession(result: Session) {
    setSession(result); setNotice(null);
    if (result.status === "AUTHENTICATED" && result.recoveryUsed) { setPage("settings"); window.location.hash = "#/settings"; }
  }
  const loggedOut = () => { setSession(null); setNotice(null); };
  return (
    <div className="app-shell">
      <header className="brand"><span className="brand-mark" aria-hidden="true">W</span><span>Wealth Master</span></header>
      {session?.status === "AUTHENTICATED" && <nav className="workspace-nav" aria-label="Workspace"><a href="#/accounts" aria-current={page === "accounts" ? "page" : undefined}>Accounts</a><a href="#/settings" aria-current={page === "settings" ? "page" : undefined}>Settings</a></nav>}
      {session?.status === "AUTHENTICATED" && session.recoveryUsed && <p role="status" className="notice">You signed in with a recovery code. Review your authenticator and remaining recovery codes in settings.</p>}
      {loading ? <main className="center-card"><p role="status">Checking your session…</p></main>
        : error ? <main className="center-card"><h1>Let’s reconnect</h1><p role="alert">{error}</p><button onClick={() => void restore()}>Try again</button></main>
         : session?.status === "MFA_SETUP_REQUIRED" || session?.status === "AUTHENTICATED" && page === "settings" ? <SecuritySettings requiredSetup={session.status === "MFA_SETUP_REQUIRED"} onSession={acceptSession} onExpired={expire} onLogout={loggedOut} />
        : session?.status === "AUTHENTICATED" ? <AccountsPage user={session.user} onExpired={expire} onLogout={loggedOut} />
        : session?.status === "MFA_REQUIRED" ? <MfaLogin onSession={acceptSession} onExpired={expire} onLogout={loggedOut} />
        : <LoginPage notice={notice} onLogin={acceptSession} />}
    </div>
  );
}
function LoginPage({ notice, onLogin }: { notice: string | null; onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(null);
    try { onLogin(await api.login(email.trim(), password)); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPassword(""); setPending(false); }
  }
  return <main className="login-layout">
    <section className="login-intro"><p className="eyebrow">Your finances, in one place</p><h1>A clearer view<br />of your wealth.</h1><p>Start with your accounts. Build a trustworthy picture of what you own and owe.</p></section>
    <section className="panel login-panel" aria-labelledby="login-heading"><h2 id="login-heading">Welcome back</h2><p className="muted">Sign in to your personal workspace.</p>
      {notice && <p role="status" className="notice">{notice}</p>}
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={pending}><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p role="alert" className="error">{error}</p>}
          <button className="full-width" type="submit">{pending ? "Signing in…" : "Sign in"}</button>
        </fieldset>
      </form>
    </section>
  </main>;
}
function AccountsPage({ user, onExpired, onLogout }: { user: User; onExpired: () => void; onLogout: () => void }) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setAccounts(await api.accounts()); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else setError(errorMessage(err));
    } finally { setLoading(false); }
  }, [onExpired]);
  useEffect(() => { void load(); }, [load]);
  async function logout() {
    setLoggingOut(true); setError(null);
    try { await api.logout(); onLogout(); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) onLogout();
      else setError(errorMessage(err));
    } finally { setLoggingOut(false); }
  }
  return <main className="workspace">
    <div className="workspace-heading"><div><p className="eyebrow">Your workspace</p><h1>Accounts</h1><p className="muted">{user.email}</p></div><button className="secondary" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? "Signing out…" : "Sign out"}</button></div>
    <div className="section-heading"><p>Keep track of where your money lives.</p><button disabled={showForm || loggingOut || loading || !!error} onClick={() => { setShowForm(true); setNotice(null); }}>Create account</button></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    {showForm && <AccountForm onCancel={() => setShowForm(false)} onExpired={onExpired} onCreated={(account) => { setAccounts((existing) => [account, ...existing]); setShowForm(false); setNotice(`${account.name} created.`); }} />}
    {error && <div className="error" role="alert"><p>{error}</p><button className="secondary" onClick={() => void load()}>Reload accounts</button></div>}
    {loading ? <p role="status">Loading accounts…</p> : !error && accounts.length === 0 ? <section className="panel empty-state"><h2>Your first account starts here</h2><p>Add a bank account, cash balance, credit card, or investment account.</p><button disabled={showForm} onClick={() => setShowForm(true)}>Create your first account</button></section> : <div className="account-grid">{accounts.map((account) => {
      const owed = account.type === "CREDIT_CARD" && account.openingBalance.startsWith("-");
      return <article className="panel account-card" key={account.id}><p className="eyebrow">{accountTypes[account.type]}</p><h2>{account.name}</h2>{account.institution && <p className="muted">{account.institution}</p>}<p className="balance">{account.currency} {displayAmount(owed ? account.openingBalance.slice(1) : account.openingBalance)}</p><p className="muted">Opening {owed ? "amount owed" : "balance"} · <time dateTime={account.openingDate}>{account.openingDate}</time></p></article>;
    })}</div>}
  </main>;
}
function AccountForm({ onCancel, onCreated, onExpired }: { onCancel: () => void; onCreated: (account: FinancialAccount) => void; onExpired: () => void }) {
  const [input, setInput] = useState<CreateAccount>({ name: "", type: "CHECKING", institution: "", currency: "", openingAmount: "0", openingDate: today(), balanceMeaning: "BALANCE" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const creditCard = input.type === "CREDIT_CARD";
  function change<K extends keyof CreateAccount>(key: K, value: CreateAccount[K]) {
    setInput((previous) => ({ ...previous, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(null); setFields({});
    try { onCreated(await api.createAccount({ ...input, name: input.name.trim(), currency: input.currency.trim().toUpperCase() })); }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else { setError(errorMessage(err)); if (err instanceof ApiError) setFields(err.fields); }
    } finally { setPending(false); }
  }
  function fieldError(name: string) { return fields[name] ? <span className="field-error" id={`${name}-error`}>{fields[name]}</span> : null; }
  function accessibility(name: string) { return { "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `${name}-error` : undefined }; }
  return <section className="panel create-panel" aria-labelledby="create-heading"><h2 id="create-heading">Create account</h2>
    <form onSubmit={(event) => void submit(event)}><fieldset disabled={pending} className="form-grid">
      <div><label htmlFor="account-name">Account name</label><input id="account-name" autoFocus required maxLength={100} value={input.name} onChange={(event) => change("name", event.target.value)} {...accessibility("name")} />{fieldError("name")}</div>
      <div><label htmlFor="account-type">Account type</label><select id="account-type" value={input.type} onChange={(event) => { const type = event.target.value as AccountType; setInput((previous) => ({ ...previous, type, balanceMeaning: type === "CREDIT_CARD" ? "AMOUNT_OWED" : "BALANCE", openingAmount: "0" })); }} {...accessibility("type")}>{Object.entries(accountTypes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{fieldError("type")}</div>
      <div><label htmlFor="institution">Institution <span className="muted">(optional)</span></label><input id="institution" maxLength={100} value={input.institution} onChange={(event) => change("institution", event.target.value)} {...accessibility("institution")} />{fieldError("institution")}</div>
      <div><label htmlFor="currency">Currency</label><input id="currency" required list="currency-options" placeholder="Choose or enter a code, e.g. CHF" maxLength={3} pattern="[A-Z]{3}" value={input.currency} onChange={(event) => change("currency", event.target.value.toUpperCase())} {...accessibility("currency")} /><datalist id="currency-options">{["CHF", "EUR", "USD", "GBP", "JPY", "CAD", "AUD"].map((currency) => <option key={currency} value={currency} />)}</datalist>{fieldError("currency")}</div>
      {creditCard && <div><label htmlFor="balance-meaning">Credit-card position</label><select id="balance-meaning" value={input.balanceMeaning} onChange={(event) => change("balanceMeaning", event.target.value as BalanceMeaning)}><option value="AMOUNT_OWED">Amount owed</option><option value="IN_CREDIT">In credit (overpayment)</option></select>{fieldError("balanceMeaning")}</div>}
      <div><label htmlFor="opening-amount">{creditCard ? input.balanceMeaning === "AMOUNT_OWED" ? "Opening amount owed" : "Opening credit amount" : "Opening balance"}</label><input id="opening-amount" type="text" inputMode="decimal" required maxLength={30} pattern={creditCard ? "[0-9]{1,20}(\\.[0-9]{1,8})?" : "-?[0-9]{1,20}(\\.[0-9]{1,8})?"} value={input.openingAmount} onChange={(event) => change("openingAmount", event.target.value)} {...accessibility("openingAmount")} /><span className="help">{creditCard ? "Enter a positive amount or zero." : "Use a minus sign for a negative balance."} Use a decimal point.</span>{fieldError("openingAmount")}</div>
      <div><label htmlFor="opening-date">Opening date</label><input id="opening-date" type="date" required value={input.openingDate} onChange={(event) => change("openingDate", event.target.value)} {...accessibility("openingDate")} />{fieldError("openingDate")}</div>
      {error && <p className="error form-wide" role="alert">{error}</p>}
      <div className="form-actions form-wide"><button type="submit">{pending ? "Saving…" : "Save account"}</button><button className="secondary" type="button" onClick={onCancel}>Cancel</button></div>
    </fieldset></form>
  </section>;
}
