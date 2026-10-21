// The saved profiles as the mod knows them, and which one is signed in now.

/**
 * A saved profile: the account it holds and that account's email (once known),
 * whether it shares its Code sessions, and whether it holds a sign-in to restore.
 */
export type Profile = {
  name: string
  account: string | null
  email: string | null
  sharesSessions: boolean
  hasSignIn: boolean
}

/** What the mod has seen of an account: the organization it runs in, its email. */
export type SeenAccount = { org: string | null; email: string | null }

/**
 * The saved profiles, by name; the one of the account signed in now (none when
 * no profile holds it); what was seen of each account; and whether the script's
 * list of them could be read (while not, none are listed).
 */
export type Profiles = { list: Profile[]; current: Profile | null; accounts: Record<string, SeenAccount>; isReadable: boolean }

/** Whether two profile names name one folder: Windows tells folder names apart without regard to case. */
export function isSameName(one: string, other: string) {
  return one.toLowerCase() === other.toLowerCase()
}

/**
 * The profile of the signed-in account, as Resolve-CurrentProfile in the script
 * finds it (both are tested against tests/fixtures/current-profile.ts): the
 * profile that holds `account`; else the profile last switched to while it holds
 * no account yet, named in any case, as folders are. Where the environment
 * doesn't name the account (an older Claude), the profile last switched to.
 */
export function currentProfile(list: Profile[], account: string | null, lastSwitchedTo: string | null) {
  const last = lastSwitchedTo === null ? null : (list.find(one => isSameName(one.name, lastSwitchedTo)) ?? null)
  if (!account) {
    return last
  }

  return list.find(one => one.account === account) ?? (last && !last.account ? last : null)
}
