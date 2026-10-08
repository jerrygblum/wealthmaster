import { Button, Input, Link, LoadingIndicator } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import type { RegistrationFormViewModel } from "../../../types/viewModels";
export function RegistrationFormView(model: RegistrationFormViewModel) {
  const {
    enabled,
    error,
    pending,
    submit,
    email,
    setEmail,
    code,
    setCode,
    password,
    setPassword,
    confirmation,
    setConfirmation,
  } = model;
  return (
    <section className="panel" aria-labelledby="registration-heading">
      <h1 id="registration-heading">Create your account</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {enabled === undefined && !error ? (
        <LoadingIndicator>Checking registration…</LoadingIndicator>
      ) : enabled === false ? (
        <p role="status">Registration is disabled. Contact the owner.</p>
      ) : (
        enabled && (
          <>
            <p className="help">
              Use the email and invitation code provided by the owner. Codes expire after seven
              days.
            </p>
            <form onSubmit={(event) => void submit(event)}>
              <fieldset disabled={pending}>
                <Field htmlFor="register-email" label="Email">
                  <Input
                    id="register-email"
                    type="email"
                    autoComplete="username"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field htmlFor="register-code" label="Invitation code">
                  <Input
                    id="register-code"
                    type="password"
                    autoComplete="off"
                    required
                    maxLength={64}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                <Field htmlFor="register-password" label="Password">
                  <Input
                    id="register-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <span className="help">12–72 characters; at most 72 UTF-8 bytes.</span>
                </Field>
                <Field htmlFor="register-confirmation" label="Confirm password">
                  <Input
                    id="register-confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={72}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
                <Button type="submit">{pending ? "Creating account…" : "Create account"}</Button>
              </fieldset>
            </form>
          </>
        )
      )}
      <p>
        <Link href="#/net-worth">Back to sign in</Link>
      </p>
    </section>
  );
}
