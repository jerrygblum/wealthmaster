import type { FactorKind } from "../../types/models";
import { Input, Select } from "../atoms/Controls";
export function FactorFields({
  kind,
  code,
  onKind,
  onCode,
  optional = false,
}: {
  kind: FactorKind;
  code: string;
  onKind: (kind: FactorKind) => void;
  onCode: (code: string) => void;
  optional?: boolean;
}) {
  return (
    <>
      <label htmlFor="factor-kind">Verification method</label>
      <Select
        id="factor-kind"
        value={kind}
        onChange={(event) => {
          onKind(event.target.value as FactorKind);
          onCode("");
        }}
      >
        <option value="TOTP">Authenticator app</option>
        <option value="RECOVERY">Recovery code</option>
      </Select>
      <label htmlFor="factor-code">
        {kind === "TOTP" ? "Authenticator code" : "Recovery code"}
        {optional ? " (if needed)" : ""}
      </label>
      <Input
        id="factor-code"
        value={code}
        required={!optional}
        maxLength={64}
        autoComplete="one-time-code"
        inputMode={kind === "TOTP" ? "numeric" : "text"}
        pattern={kind === "TOTP" ? "[0-9]{6}" : undefined}
        onChange={(event) => onCode(event.target.value)}
      />
      {optional && (
        <p className="help">
          You can leave this blank if you verified a second factor in the last five minutes.
          Otherwise, enter a new authenticator code or an unused recovery code.
        </p>
      )}
    </>
  );
}
