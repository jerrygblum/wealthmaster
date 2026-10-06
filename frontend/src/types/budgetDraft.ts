import type { BudgetMode, BudgetSetting } from "./models";
export type Draft = {
  categoryId: string;
  currency: string;
  mode: BudgetMode;
  limit: string;
  setting?: BudgetSetting;
};
