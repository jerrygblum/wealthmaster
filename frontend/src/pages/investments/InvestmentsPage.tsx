import { usePortfolio } from "../../hooks/investments/usePortfolio";
import { PortfolioView } from "../../components/organisms/investments/PortfolioView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
export function InvestmentsPage({
  accountId,
  onExpired,
  demo = false,
}: {
  demo?: boolean;
  accountId: string;
  onExpired: () => void;
}) {
  return (
    <WorkspaceLayout className="workspace">
      <PortfolioView demo={demo} {...usePortfolio(accountId, onExpired)} />
    </WorkspaceLayout>
  );
}
