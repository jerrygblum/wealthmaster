import type { CSSProperties } from "react";
import type { AccountLogo as Logo } from "../../../types/models";
import type { AccountsPageViewModel } from "../../../types/viewModels";
import { bankMarks, accountColor } from "../../../utils/accountVisuals";
import { accountTypes } from "../../../utils/accountPresentation";
import { AccountLogo } from "../../atoms/AccountLogo";
import { Button, Input, Select } from "../../atoms/Controls";
import { Modal } from "../../molecules/Modal";
export function AccountCardSettingsView(m: AccountsPageViewModel) {
  const s = m.settings,
    pending = m.actionPending || s.processing;
  return (
    <Modal
      titleId="account-card-settings-title"
      title="Account card settings"
      busy={pending}
      onClose={s.close}
    >
      <p className="help">
        All accounts, including archived accounts. Order changes save immediately. Save each
        appearance when ready; Done discards unsaved appearance changes.
      </p>
      {m.demo && (
        <p className="notice">
          Custom image uploads are unavailable in the shared demo. Choose a built-in bank mark or
          account-type icon.
        </p>
      )}
      {(m.actionError || s.imageError) && (
        <div role="alert" className="error">
          <p>{m.actionError || s.imageError}</p>
          {m.stale && (
            <Button
              disabled={pending || m.loading}
              onClick={() => {
                s.reset();
                m.setActionError(null);
                void m.load();
              }}
            >
              Reload accounts
            </Button>
          )}
        </div>
      )}
      {m.notice && (
        <p className="notice" role="status">
          {m.notice}
        </p>
      )}
      {s.processing && <p role="status">Preparing image…</p>}
      <ol className="account-settings-list">
        {m.accounts.map((account, index) => {
          const draft = s.appearance(account);
          const preview = {
            ...account,
            color: draft.color,
            logo: draft.logo,
            logoData: draft.logoData ?? account.logoData,
          };
          const valid = draft.color === null || /^#[0-9a-fA-F]{6}$/.test(draft.color);
          return (
            <li key={account.id}>
              <form
                aria-label={`Appearance for ${account.name}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void s.save(account);
                }}
              >
                <div className="account-settings-row-heading">
                  <div
                    className="account-settings-preview"
                    style={
                      {
                        "--account-color": valid
                          ? accountColor({ ...preview, accent: "DEFAULT" })
                          : "#64748b",
                      } as CSSProperties
                    }
                  >
                    <AccountLogo account={preview} />
                    <div>
                      <strong>{account.name}</strong>
                      <span className="help">
                        {accountTypes[account.type]} · {account.currency}
                        {!account.active ? " · Archived" : ""}
                      </span>
                    </div>
                  </div>
                  <div
                    className="account-settings-order"
                    role="group"
                    aria-label={`Order ${account.name}`}
                  >
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Move ${account.name} up`}
                      disabled={pending || m.loading || m.stale || index === 0}
                      onClick={() => void m.personalize(account, "up")}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={`Move ${account.name} down`}
                      disabled={pending || m.loading || m.stale || index === m.accounts.length - 1}
                      onClick={() => void m.personalize(account, "down")}
                    >
                      ↓
                    </Button>
                  </div>
                </div>
                <fieldset
                  disabled={pending || m.stale || m.loading}
                  className="account-settings-fields"
                >
                  <legend className="sr-only">Appearance for {account.name}</legend>
                  <div className="account-settings-color">
                    <label>
                      Card color
                      <Input
                        type="color"
                        aria-label={`Color for ${account.name}`}
                        value={valid && draft.color ? draft.color : "#64748b"}
                        onChange={(event) => s.change(account, { color: event.target.value })}
                      />
                    </label>
                    <label>
                      Hex color
                      <Input
                        aria-label={`Hex color for ${account.name}`}
                        value={draft.color ?? ""}
                        placeholder="Default"
                        pattern="#[0-9A-Fa-f]{6}"
                        maxLength={7}
                        onChange={(event) =>
                          s.change(account, { color: event.target.value || null })
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => s.change(account, { color: null })}
                    >
                      Reset color
                    </Button>
                  </div>
                  <label>
                    Bank mark
                    <Select
                      aria-label={`Bank mark for ${account.name}`}
                      value={draft.logo}
                      onChange={(event) =>
                        s.change(account, { logo: event.target.value as Logo, logoData: null })
                      }
                    >
                      {bankMarks.map((mark) => (
                        <option key={mark.id} value={mark.id}>
                          {mark.label}
                        </option>
                      ))}
                      {draft.logo === "CUSTOM" && (
                        <option value="CUSTOM">Custom uploaded image</option>
                      )}
                    </Select>
                  </label>
                  {!m.demo && (
                    <label className="account-settings-upload">
                      Custom image
                      <Input
                        type="file"
                        aria-label={`Upload logo for ${account.name}`}
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void s.image(account, file);
                          event.target.value = "";
                        }}
                      />
                      <span className="help">
                        PNG, JPEG or WebP, up to 2 MB. Resized and saved privately.
                      </span>
                    </label>
                  )}
                  <Button
                    type="submit"
                    aria-label={`Save appearance for ${account.name}`}
                    disabled={!s.isDirty(account.id) || !valid}
                  >
                    Save appearance
                  </Button>
                </fieldset>
              </form>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
