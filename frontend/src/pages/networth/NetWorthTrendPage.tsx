import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { NetWorthTrendView } from "../../components/organisms/networth/NetWorthTrendView";
import { useNetWorthTrend } from "../../hooks/networth/useNetWorthTrend";
export function NetWorthTrendPage({ onExpired }: { onExpired: () => void }) {
  const model = useNetWorthTrend(onExpired);
  return (
    <WorkspaceLayout className="workspace">
      <NetWorthTrendView {...model} />
    </WorkspaceLayout>
  );
}
