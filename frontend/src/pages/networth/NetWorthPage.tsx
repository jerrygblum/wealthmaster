import { NetWorthPageView } from "../../components/organisms/networth/NetWorthPageView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { useNetWorth } from "../../hooks/networth/useNetWorth";
import type { NetWorthPageProps } from "../../types/componentProps";

export function NetWorthPage(props: NetWorthPageProps) {
  const model = useNetWorth(props);
  return (
    <WorkspaceLayout className="workspace">
      <NetWorthPageView {...model} />
    </WorkspaceLayout>
  );
}
