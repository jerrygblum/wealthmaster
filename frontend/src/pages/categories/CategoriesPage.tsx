import { CategoriesPageView } from "../../components/organisms/categories/CategoriesPageView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { useCategories } from "../../hooks/categories/useCategories";
import type { CategoriesPageProps } from "../../types/componentProps";
import { CategoryLimits } from "./CategoryLimits";

export function CategoriesPage(props: CategoriesPageProps) {
  const model = useCategories(props);
  return (
    <WorkspaceLayout className="workspace">
      <CategoriesPageView {...model} CategoryLimits={CategoryLimits} />
    </WorkspaceLayout>
  );
}
