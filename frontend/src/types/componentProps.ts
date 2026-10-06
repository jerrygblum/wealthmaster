import type {
  FactorKind,
  FinancialAccount,
  MfaSetup,
  RecoveryCodes,
  Session,
  User,
} from "./models";
export type AccountDetailProps = { id: string; onBack: () => void; onExpired: () => void };
export type AppProps = Record<string, never>;
export type LoginPageProps = { notice: string | null; onLogin: (session: Session) => void };
export type AccountsPageProps = { user: User; onExpired: () => void; onLogout: () => void };
export type AccountFormProps = {
  account?: FinancialAccount;
  onCancel: () => void;
  onCreated: (account: FinancialAccount) => void;
  onExpired: () => void;
};
export type CategoriesPageProps = { user: User; onExpired: () => void; onLogout: () => void };

export type NetWorthPageProps = { user: User; onExpired: () => void; onLogout: () => void };
export type MfaLoginProps = {
  onSession: (session: Session) => void;
  onExpired: () => void;
  onLogout: () => void;
};
export type SecuritySettingsProps = {
  requiredSetup: boolean;
  onSession: (session: Session) => void;
  onExpired: () => void;
  onLogout: () => void;
};
export type IdentityStepProps = {
  existing: boolean;
  disabled: boolean;
  onSubmit: (password: string, factor: string, kind: FactorKind) => void;
};
export type AuthenticatorStepProps = {
  setup: MfaSetup;
  disabled: boolean;
  onSubmit: (code: string) => void;
};
export type RecoveryStepProps = {
  codes: RecoveryCodes;
  disabled: boolean;
  label: string;
  onConfirm: () => void;
};
export type SpendingPageProps = { onExpired: () => void };
