# superpowers-nudge

A Claude Code mod. When a prompt looks like development work it shows a band above the prompt
suggesting the matching superpowers skill, with an Activate button that fills the prompt with the
skill command, and attaches a short reminder to Claude to invoke that skill first.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install superpowers-nudge --marketplace DCXTribe/claude-code-think-first
```

From a shell:

```
claude plugin install superpowers-nudge --marketplace DCXTribe/claude-code-think-first
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `DCXTribe/claude-code-think-first`, then Add plugin.

## Manage

```
claude plugin disable superpowers-nudge
claude plugin enable superpowers-nudge
```

Inside a session: `/superpowers-nudge on|off|status`, or the "Superpowers nudge" row in `/config` (terminal only).

## Develop

From a clone, run it from its folder with `claude --plugin-dir plugins/superpowers-nudge`.

```
claude plugin validate .
claude plugin test .
```

## The band

- **Activate** puts the suggested skill command in front of whatever you are typing; press Enter to run it.
- **Dismiss** hides the band for this prompt (on the desktop it is the band's close control).
- **Hold** pauses detection for the rest of the session, for when superpowers is already running. `/superpowers-nudge resume` turns it back on.

Other bands above the prompt (fable-ambition's, for one) are drawn beneath this one rather than hidden.

## What it runs and sends

- **Prompt check.** It matches each prompt you submit against fixed word lists, on your machine. Nothing is sent anywhere to decide.
- **Context for Claude.** When a prompt looks like development work, it attaches one line of context to that prompt telling Claude to invoke the suggested superpowers skill first.
- **Watching tools.** It notices when Claude calls the Skill tool (to show which superpowers skill is active) and when Claude edits a code file before one is active (to show a toast). It never blocks or changes those calls.
- **Settings.** `/superpowers-nudge on|off` writes its one option, `enabled`, to your Claude Code settings.
- **Nothing else.** It makes no model calls, reads no files, runs no processes and contacts no service. It works best with the [superpowers](https://github.com/obra/superpowers) plugin installed, which provides the skills it suggests. superpowers-nudge is a separate project by Victor Cheong, not part of superpowers.
