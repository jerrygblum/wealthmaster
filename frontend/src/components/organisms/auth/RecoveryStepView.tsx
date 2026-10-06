import type { RecoveryStepViewModel } from "../../../types/viewModels";
import { Button, Checkbox } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";

export function RecoveryStepView({
  saved,
  setSaved,
  copyMessage,
  copy,
  download,
  codes,
  disabled,
  label,
  onConfirm,
}: RecoveryStepViewModel) {
  return (
    <div>
      <h4>Save your recovery codes</h4>
      <p>
        Use one if you lose access to your authenticator. Store them privately, separate from your
        device. They are shown only once.
      </p>
      <ul className="recovery-codes">
        {codes.recoveryCodes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <ActionGroup className="form-actions">
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          Copy codes
        </Button>
        <Button type="button" variant="secondary" onClick={download}>
          Download codes
        </Button>
      </ActionGroup>
      {copyMessage && <p role="status">{copyMessage}</p>}
      <label className="checkbox-label">
        <Checkbox checked={saved} onChange={(event) => setSaved(event.target.checked)} />I saved my
        recovery codes
      </label>
      <Button disabled={disabled || !saved} onClick={onConfirm}>
        {label}
      </Button>
      <p className="help">
        Confirm before {new Date(codes.expiresAt).toLocaleTimeString()}. Nothing changes until you
        confirm.
      </p>
    </div>
  );
}
