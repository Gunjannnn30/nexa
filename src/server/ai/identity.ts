/**
 * The reserved identity of NEXA's built-in assistant. Kept in its own module so
 * registration can reserve the name without importing the assistant service
 * (which would create a cycle through conversations and messages).
 */
export const AI_USERNAME = "nexa_ai";
export const AI_EMAIL = "nexa-ai@nexa.demo";
export const AI_NAME = "NEXA AI";
export const AI_AVATAR = "/nexa-ai.svg";

export function isReservedAiUsername(username: string) {
  return username === AI_USERNAME;
}

export function isReservedAiEmail(email: string) {
  return email === AI_EMAIL;
}
