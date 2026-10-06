import { AccountsPageView } from "../../components/organisms/accounts/AccountsPageView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { useAccounts } from "../../hooks/accounts/useAccounts";
import type { AccountsPageProps } from "../../types/componentProps";
import { AccountDetail } from "./AccountDetail";
import { AccountForm } from "./AccountForm";

export function AccountsPage(props: AccountsPageProps) {
  const model = useAccounts(props);
  if (model.selected)
    return (
      <AccountDetail
        id={model.selected}
        onBack={() => {
          window.location.hash = "#/accounts";
          model.setSelected(null);
        }}
        onExpired={props.onExpired}
      />
    );
  return (
    <WorkspaceLayout className="workspace">
      <AccountsPageView {...model} AccountForm={AccountForm} />
    </WorkspaceLayout>
  );
}
