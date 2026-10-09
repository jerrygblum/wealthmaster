import { AuthenticationLayout } from "../../components/templates/AuthenticationLayout";
import { RegistrationFormView } from "../../components/organisms/auth/RegistrationFormView";
import { useRegistration } from "../../hooks/auth/useRegistration";
import type { Session } from "../../types/models";
export function RegistrationPage({ onLogin }: { onLogin: (session: Session) => void }) {
  const model = useRegistration(onLogin);
  return (
    <AuthenticationLayout className="center-card registration-page">
      <RegistrationFormView {...model} />
    </AuthenticationLayout>
  );
}
