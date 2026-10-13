import type { CategoryType, Operation } from "./models";
export type OriginalCategoryTransaction = {
  id: string;
  version: number;
  accountId: string;
  accountName: string;
  date: string;
  kind: string;
  amount: string;
  currency: string;
  description: string;
  categoryId: string | null;
  category: Operation["category"];
};
export type OriginalCategoryGroup = {
  originalCategory: string;
  type: CategoryType;
  uncategorizedCount: number;
  transactions: OriginalCategoryTransaction[];
};
export type OriginalCategoryMapping = {
  originalCategory: string;
  type: CategoryType;
  categoryId: string;
  categoryVersion: number;
  includeCategorized: boolean;
  transactions: { id: string; version: number }[];
};
