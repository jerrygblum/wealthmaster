import { MfaLoginView } from "../../components/organisms/auth/MfaLoginView";
import { AuthenticationLayout } from "../../components/templates/AuthenticationLayout";
import { useMfaLogin } from "../../hooks/auth/useMfaLogin";
import type { MfaLoginProps } from "../../types/componentProps";

export function MfaLogin(props: MfaLoginProps) {
  const model = useMfaLogin(props);
  return (
    <AuthenticationLayout className="center-card panel security-panel">
      <MfaLoginView {...model} />
    </AuthenticationLayout>
  );
}
