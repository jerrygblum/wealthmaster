import type { ComponentProps } from "react";
export function Message({ className, role = "status", children, ...props }: ComponentProps<"p">) {
  return (
    <p {...props} className={className} role={role}>
      {children}
    </p>
  );
}
