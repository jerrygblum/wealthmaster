import { RegistrationPanelView } from "../../components/organisms/auth/RegistrationPanelView";
import { useRegistrationManagement } from "../../hooks/auth/useRegistrationManagement";
export function RegistrationPanel({ onExpired }: { onExpired: () => void }) {
  const model = useRegistrationManagement(onExpired);
  return <RegistrationPanelView {...model} />;
}
