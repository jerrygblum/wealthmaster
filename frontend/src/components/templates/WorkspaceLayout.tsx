import type { ComponentProps } from "react";
export function WorkspaceLayout({ className = "workspace", ...props }: ComponentProps<"main">) {
  return <main {...props} className={className} />;
}
