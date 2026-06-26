type EmailPilotUser = {
  username: string;
};

export function canAccessEmailPilot(user: EmailPilotUser) {
  return process.env.NODE_ENV !== "production" || user.username === "owner";
}
