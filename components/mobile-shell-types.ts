export type MobileCurrentUser = {
  id: string;
  username: string;
  displayName: string;
  appLockConfigured?: boolean;
  appLockRecoveryAvailable?: boolean;
};

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};
