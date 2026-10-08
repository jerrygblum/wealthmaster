import { ExpectedPageView } from "../../components/organisms/expected/ExpectedPageView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { useExpected } from "../../hooks/expected/useExpected";
export function ExpectedPage(props: { onExpired: () => void }) {
  const model = useExpected(props);
  return (
    <WorkspaceLayout>
      <ExpectedPageView {...model} />
    </WorkspaceLayout>
  );
}
