import { SecuritySettingsView } from "../../components/organisms/auth/SecuritySettingsView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { useSecuritySettings } from "../../hooks/auth/useSecuritySettings";
import type { SecuritySettingsProps } from "../../types/componentProps";
import { AuthenticatorStep } from "./AuthenticatorStep";
import { IdentityStep } from "./IdentityStep";
import { RecoveryStep } from "./RecoveryStep";

import { PreferencesPanel } from "./PreferencesPanel";

export function SecuritySettings(props: SecuritySettingsProps) {
  const model = useSecuritySettings(props);
  return (
    <WorkspaceLayout className="workspace security-panel">
      <SecuritySettingsView
        {...model}
        preferencesPanel={
          !props.requiredSetup ? <PreferencesPanel onExpired={props.onExpired} /> : null
        }

        IdentityStep={IdentityStep}
        AuthenticatorStep={AuthenticatorStep}
        RecoveryStep={RecoveryStep}
      />
    </WorkspaceLayout>
  );
}
