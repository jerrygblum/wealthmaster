import { SpendingLimitEditorView } from "../../components/organisms/spending/SpendingLimitEditorView";
import { useSpendingLimitEditor } from "../../hooks/spending/useSpendingLimitEditor";
import type { SpendingLimitEditorProps } from "../../types/componentProps";

export function SpendingLimitEditor(props: SpendingLimitEditorProps) {
  const model = useSpendingLimitEditor(props);
  return <SpendingLimitEditorView {...model} />;
}
