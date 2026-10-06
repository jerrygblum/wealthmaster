import { Button, Input } from "../../atoms/Controls";
import { Message } from "../../molecules/Message";

import type { LoginPageViewModel } from "../../../types/viewModels";

export function LoginPageView({
  email,
  setEmail,
  password,
  setPassword,
  pending,
  error,
  submit,
  notice,
}: LoginPageViewModel) {
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
      </section>
    </>
  );
}
