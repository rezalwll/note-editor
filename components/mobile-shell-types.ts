export type MobileCurrentUser = {
  id: string;
  username: string;
  displayName: string;
};

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};
