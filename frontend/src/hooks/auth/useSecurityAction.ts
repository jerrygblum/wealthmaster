import { useEffect, useState } from "react";
import { ApiError } from "../../services/api";
export function useSecurityAction(onExpired: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);
  async function run(work: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await work();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else {
        setError(error instanceof Error ? error.message : "Something went wrong. Try again.");
        if (error instanceof ApiError && error.status === 429)
          setCooldown(error.retryAfterSeconds || 300);
      }
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error, cooldown, disabled: pending || cooldown > 0 };
}
