import type { ComponentProps } from "react";
export function AppShell(props: ComponentProps<"div">) {
  return <div {...props} className="app-shell" />;
}
