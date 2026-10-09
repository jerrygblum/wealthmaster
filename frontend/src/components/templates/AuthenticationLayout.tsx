import type { ComponentProps } from "react";
export function AuthenticationLayout({
  className = "center-card",
  ...props
}: ComponentProps<"main">) {
  return <main {...props} className={className} />;
}
