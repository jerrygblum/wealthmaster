import type { ComponentProps } from "react";
export function ActionGroup({ className = "form-actions", ...props }: ComponentProps<"div">) {
  return <div {...props} className={className} />;
}
export function SegmentedControl({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} className={className} role="group">
      {children}
    </div>
  );
}
