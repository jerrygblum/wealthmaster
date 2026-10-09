import { AccountDetailView } from "../../components/organisms/accounts/AccountDetailView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { useAccountDetail } from "../../hooks/accounts/useAccountDetail";
import type { AccountDetailProps } from "../../types/componentProps";

export function AccountDetail(props: AccountDetailProps) {
  const model = useAccountDetail(props);
  return (
    <WorkspaceLayout className="workspace">
      <AccountDetailView {...model} />
    </WorkspaceLayout>
  );
}
