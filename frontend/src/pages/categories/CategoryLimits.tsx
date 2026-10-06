import { CategoryLimitsView } from "../../components/organisms/categories/CategoryLimitsView";
import { useCategoryLimits } from "../../hooks/categories/useCategoryLimits";
import type { CategoryLimitsProps } from "../../types/componentProps";

export function CategoryLimits(props: CategoryLimitsProps) {
  const model = useCategoryLimits(props);
  return <CategoryLimitsView {...model} />;
}
