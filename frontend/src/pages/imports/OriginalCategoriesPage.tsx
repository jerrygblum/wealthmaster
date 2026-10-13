import { OriginalCategoriesView } from "../../components/organisms/imports/OriginalCategoriesView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { useOriginalCategories } from "../../hooks/imports/useOriginalCategories";
export function OriginalCategoriesPage({ onExpired }: { onExpired: () => void }) {
  return (
    <WorkspaceLayout className="workspace">
      <OriginalCategoriesView {...useOriginalCategories(onExpired)} />
    </WorkspaceLayout>
  );
}
