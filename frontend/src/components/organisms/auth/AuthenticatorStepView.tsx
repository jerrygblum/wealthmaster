import type { AuthenticatorStepViewModel } from "../../../types/viewModels";
import { Button, Input } from "../../atoms/Controls";

export function AuthenticatorStepView({
  image,
  qrError,
  code,
  setCode,
  setup,
  disabled,
  onSubmit,
}: AuthenticatorStepViewModel) {
  return (
    <div>
      <p>Scan this QR code with your authenticator app, or enter the setup key manually.</p>
      {image ? (
        <img className="mfa-qr" src={image} alt="Authenticator setup QR code" />
      ) : (
        <p role="status">
          {qrError ? "QR unavailable. Use the manual setup key." : "Preparing QR code…"}
        </p>
      )}
      <p className="field-label">Manual setup key</p>
      <code className="setup-key">{setup.setupKey}</code>
      <p className="help">
        Use a time-based, six-digit code with a 30-second period. Setup expires at{" "}
        {new Date(setup.expiresAt).toLocaleTimeString()}.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(code);
          setCode("");
        }}
      >
        <fieldset disabled={disabled}>
          <label htmlFor="setup-code">Code from your authenticator</label>
          <Input
            id="setup-code"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Button type="submit">Verify authenticator</Button>
        </fieldset>
      </form>
    </div>
  );
}
