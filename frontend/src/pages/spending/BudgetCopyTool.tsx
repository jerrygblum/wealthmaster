import { BudgetCopyToolView } from "../../components/organisms/spending/BudgetCopyToolView";
import { useBudgetCopyTool } from "../../hooks/spending/useBudgetCopyTool";
import type { BudgetCopyToolProps } from "../../types/componentProps";

export function BudgetCopyTool(props: BudgetCopyToolProps) {
  const model = useBudgetCopyTool(props);
  return <BudgetCopyToolView {...model} />;
}
