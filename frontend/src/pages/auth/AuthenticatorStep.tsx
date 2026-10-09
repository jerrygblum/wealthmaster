import { AuthenticatorStepView } from "../../components/organisms/auth/AuthenticatorStepView";
import { useAuthenticatorStep } from "../../hooks/auth/useAuthenticatorStep";
import type { AuthenticatorStepProps } from "../../types/componentProps";

export function AuthenticatorStep(props: AuthenticatorStepProps) {
  const model = useAuthenticatorStep(props);
  return <AuthenticatorStepView {...model} />;
}
