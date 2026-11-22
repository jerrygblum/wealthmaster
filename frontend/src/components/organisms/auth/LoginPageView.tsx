import { Button, Input, Link } from "../../atoms/Controls";
import { Message } from "../../molecules/Message";

import type { LoginPageViewModel } from "../../../types/viewModels";

export function LoginPageView({
  demo,
  enterDemo,
  registrationEnabled,
  email,
  setEmail,
  password,
  setPassword,
  pending,
  error,
  submit,
  notice,
}: LoginPageViewModel) {
  if (demo.enabled)
    return (
      <section className="panel demo-landing" aria-labelledby="demo-heading">
        <p className="eyebrow">Explore Wealth Master</p>
        <h1 id="demo-heading">Try the shared demo</h1>
        <p>
          Explore twelve months of fictional accounts, spending, investments and net-worth history.
          Edit the data and try the workflows.
        </p>
        <p className="notice">
          Everyone sees the same editable sandbox. Use fictional information only. Changes are
          cleared daily at 03:00 Europe/Zurich.
        </p>
        {demo.nextResetAt && (
          <p>
            Scheduled reset:{" "}
            {new Date(demo.nextResetAt).toLocaleString(undefined, { timeZone: "Europe/Zurich" })}{" "}
            (Europe/Zurich)
          </p>
        )}
        <p>
          Uploads, user administration and online market requests are unavailable in this public
          demo.
        </p>
        {notice && (
          <Message role="status" className="notice">
            {notice}
          </Message>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <Button disabled={pending} onClick={() => void enterDemo()}>
          {pending ? "Opening demo…" : "Try demo"}
        </Button>
      </section>
    );
  return (
    <>
      <section className="login-intro">
        <p className="eyebrow">Your finances, in one place</p>
        <h1>
          A clearer view
          <br />
          of your wealth.
        </h1>
        <p>Start with your accounts. Build a trustworthy picture of what you own and owe.</p>
      </section>
      <section className="panel login-panel" aria-labelledby="login-heading">
        <h2 id="login-heading">Welcome back</h2>
        <p className="muted">Sign in to your personal workspace.</p>
        {notice && (
          <Message role="status" className="notice">
            {notice}
          </Message>
        )}
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={pending}>
            <label htmlFor="email">Email</label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="password">Password</label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Button className="full-width" type="submit">
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </fieldset>
        </form>
        {registrationEnabled && (
          <p>
            <Link href="#/register">Register with an invitation</Link>
          </p>
        )}
      </section>
    </>
  );
}
