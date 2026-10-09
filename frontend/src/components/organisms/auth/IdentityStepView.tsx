import type { IdentityStepViewModel } from "../../../types/viewModels";
import { Button, Input } from "../../atoms/Controls";
import { FactorFields } from "../../molecules/FactorFields";

export function IdentityStepView({
  password,
  setPassword,
  factor,
  setFactor,
  kind,
  setKind,
  submit,
  existing,
  disabled,
}: IdentityStepViewModel) {
  return (
    <form onSubmit={submit}>
      <fieldset disabled={disabled}>
        <p>First, verify your identity.</p>
        <label htmlFor="settings-password">Current password</label>
        <Input
          id="settings-password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={72}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {existing && (
          <FactorFields kind={kind} code={factor} onKind={setKind} onCode={setFactor} optional />
        )}
        <Button type="submit">Continue setup</Button>
      </fieldset>
    </form>
  );
}
