import { MonthlyLimitBreakdownView } from "../../components/organisms/spending/MonthlyLimitBreakdownView";
import { useMonthlyLimitBreakdown } from "../../hooks/spending/useMonthlyLimitBreakdown";
import type { MonthlyLimitBreakdownProps } from "../../types/componentProps";
import { SpendingLimitEditor } from "./SpendingLimitEditor";

export function MonthlyLimitBreakdown(props: MonthlyLimitBreakdownProps) {
  const model = useMonthlyLimitBreakdown(props);
  return <MonthlyLimitBreakdownView {...model} SpendingLimitEditor={SpendingLimitEditor} />;
}
