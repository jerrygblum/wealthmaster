import { SpendingPageView } from "../../components/organisms/spending/SpendingPageView";
import { WorkspaceLayout } from "../../components/templates/WorkspaceLayout";
import { useSpending } from "../../hooks/spending/useSpending";
import type { SpendingPageProps } from "../../types/componentProps";
import { BudgetCopyTool } from "./BudgetCopyTool";
import { MonthlyLimitBreakdown } from "./MonthlyLimitBreakdown";
import { SpendingLimitEditor } from "./SpendingLimitEditor";

export function SpendingPage(props: SpendingPageProps) {
  const model = useSpending(props);
  return (
    <WorkspaceLayout className="workspace spending">
      <SpendingPageView
        {...model}

        SpendingLimitEditor={SpendingLimitEditor}
        MonthlyLimitBreakdown={MonthlyLimitBreakdown}
        BudgetCopyTool={BudgetCopyTool}
      />
    </WorkspaceLayout>
  );
}
