import { IdentityStepView } from "../../components/organisms/auth/IdentityStepView";
import { useIdentityStep } from "../../hooks/auth/useIdentityStep";
import type { IdentityStepProps } from "../../types/componentProps";

export function IdentityStep(props: IdentityStepProps) {
  const model = useIdentityStep(props);
  return <IdentityStepView {...model} />;
}
