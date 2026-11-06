// Rules for usernames and display names, shared by sign-up and profile editing.

export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const MAX_DISPLAY_NAME_LENGTH = 40;

export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export function usernameProblem(username: string): string | null {
  return USERNAME_PATTERN.test(username)
    ? null
    : 'Pick a username of 3 to 24 characters using letters, numbers or _.';
}

export function displayNameProblem(displayName: string): string | null {
  return displayName.length > MAX_DISPLAY_NAME_LENGTH
    ? `Keep your name to ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`
    : null;
}
