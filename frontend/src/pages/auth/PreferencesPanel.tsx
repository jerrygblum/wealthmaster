import { PreferencesView } from "../../components/organisms/auth/PreferencesView";
import { usePreferences } from "../../hooks/auth/usePreferences";
export function PreferencesPanel({ onExpired }: { onExpired: () => void }) {
  return <PreferencesView {...usePreferences(onExpired)} />;
}
