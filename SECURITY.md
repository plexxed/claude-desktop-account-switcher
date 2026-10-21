# Security policy

The mod keeps copies of Claude Desktop's sign-in on your computer and swaps them in and out of Claude's own data folder, so a flaw in it can matter. Please report one privately.

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Report it through GitHub's private vulnerability reporting: **Security** tab of this repository, then **Report a vulnerability**. Please don't open a public issue for it.

Say what an attacker can do and how, with the steps to reproduce it and the mod's version. You'll get an answer within a week, and a fix or a decision within 30 days. You'll be credited in the release notes unless you'd rather not be.

## What the mod keeps, and where

- **Saved sign-ins** (`profiles\<name>\auth.json`, `Cookies`) and **backups** (`backups\`) are in `%USERPROFILE%\.claude\plugins\data\account-switcher\`. They are the values Claude Desktop stores, encrypted by Claude for your Windows user (DPAPI): they can't be used on another computer or by another Windows user, but anything that runs as you can read them, as it can read Claude's own.
- **Nothing leaves your computer** but the two requests Claude Code itself makes for your usage and profile, to `api.anthropic.com`, with the session's own sign-in.
- **The switch script runs with `-ExecutionPolicy Bypass`**, from the plugin's own folder, which only you can write to.

Deleting a profile removes its saved sign-in and the backups that hold it. Uninstalling the plugin leaves the data folder; delete it to remove every saved sign-in.

Anthropic doesn't make or support this mod. A flaw in Claude, Claude Code or Claude Desktop themselves goes to [Anthropic's own disclosure program](https://www.anthropic.com/responsible-disclosure-policy).
