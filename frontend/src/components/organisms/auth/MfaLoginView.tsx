import type { MfaLoginViewModel } from "../../../types/viewModels";
import { Button } from "../../atoms/Controls";
import { FactorFields } from "../../molecules/FactorFields";

import { Feedback } from "../../molecules/Feedback";

export function MfaLoginView({
  code,
  setCode,
  kind,
  setKind,
  action,
  submit,
  logout,
}: MfaLoginViewModel) {
  return (
    <>
      <h1>Verify your sign-in</h1>
      <p>Enter a code to open your workspace. This verification expires after five minutes.</p>
      <form onSubmit={submit}>
        <fieldset disabled={action.disabled}>
          <FactorFields kind={kind} code={code} onKind={setKind} onCode={setCode} />
          <Button type="submit">{action.pending ? "Verifying…" : "Verify and sign in"}</Button>
        </fieldset>
      </form>
      <Feedback action={action} />
      <Button variant="secondary" disabled={action.pending} onClick={logout}>
        Back to sign in
      </Button>
    </>
  );
}
