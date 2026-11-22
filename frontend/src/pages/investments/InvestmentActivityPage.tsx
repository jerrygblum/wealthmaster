import { useInvestments } from "../../hooks/investments/useInvestments";
import { InvestmentsView } from "../../components/organisms/investments/InvestmentsView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
export function InvestmentActivityPage({
  accountId,
  onExpired,
}: {
  accountId: string;
  onExpired: () => void;
}) {
  return (
    <WorkspaceLayout className="workspace">
      <InvestmentsView {...useInvestments(accountId, onExpired)} />
    </WorkspaceLayout>
  );
}
