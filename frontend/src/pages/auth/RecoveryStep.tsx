import { RecoveryStepView } from "../../components/organisms/auth/RecoveryStepView";
import { useRecoveryStep } from "../../hooks/auth/useRecoveryStep";
import type { RecoveryStepProps } from "../../types/componentProps";

export function RecoveryStep(props: RecoveryStepProps) {
  const model = useRecoveryStep(props);
  return <RecoveryStepView {...model} />;
}
