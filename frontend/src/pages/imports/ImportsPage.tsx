import { useImports } from "../../hooks/imports/useImports";
import { ImportsPageView } from "../../components/organisms/imports/ImportsPageView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
export function ImportsPage({ onExpired }: { onExpired: () => void }) {
  const model = useImports(onExpired);
  return (
    <WorkspaceLayout className="workspace">
      <ImportsPageView {...model} />
    </WorkspaceLayout>
  );
}
