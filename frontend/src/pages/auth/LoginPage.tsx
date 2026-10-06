import { LoginPageView } from "../../components/organisms/auth/LoginPageView";
import { AuthenticationLayout } from "../../components/templates/AuthenticationLayout";
import { useLogin } from "../../hooks/auth/useLogin";
import type { LoginPageProps } from "../../types/componentProps";

export function LoginPage(props: LoginPageProps) {
  const model = useLogin(props);
  return (
    <AuthenticationLayout className="login-layout">
      <LoginPageView {...model} />
    </AuthenticationLayout>
  );
}
