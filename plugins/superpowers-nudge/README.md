# superpowers-nudge

A Claude Code mod. When a prompt looks like development work it shows a band above the prompt
suggesting the matching superpowers skill, with an Activate button that fills the prompt with the
skill command, and attaches a short reminder to Claude to invoke that skill first.

## Install

```
claude plugin marketplace add ~/ClaudeDeveloper/superpowers-nudge
claude plugin install superpowers-nudge@victor-mods
```

## Manage

```
claude plugin disable superpowers-nudge
claude plugin enable superpowers-nudge
```

Inside a session: `/superpowers-nudge on|off|status`, or the "Superpowers nudge" row in `/config` (terminal only).

## Develop

The plugin is read from this folder, so edits apply after `/reload-plugins` or a restart.

```
claude plugin validate .
claude plugin test .
```

## The band

- **Activate** puts the suggested skill command in front of whatever you are typing; press Enter to run it.
- **Dismiss** hides the band for this prompt (on the desktop it is the band's close control).
- **Hold** pauses detection for the rest of the session, for when superpowers is already running. `/superpowers-nudge resume` turns it back on.

Other bands above the prompt (fable-ambition's, for one) are drawn beneath this one rather than hidden.
