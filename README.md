# VicMods

Claude Code mods by Victor Cheong. Each one is a hooks module that changes Claude Code's own interface: a band above the prompt, a slash command, a nudge to the model.

| Mod | What it does |
| --- | --- |
| [fable-ambition](plugins/fable-ambition) | A band above the prompt with four one-key Fable calls (Reverb, Council, Summit, Deepen) that sharpen a task before you send it. Subagents asked to run on Fable go to Opus instead, and a token meter shows Fable's share of the spend. |
| [superpowers-nudge](plugins/superpowers-nudge) | When a prompt looks like development work, suggests the matching [superpowers](https://github.com/obra/superpowers) skill in a band above the prompt and reminds Claude to use it. |

Both bands can show at once; each draws the other beneath it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install fable-ambition --marketplace DCXTribe/VicMods
/plugin install superpowers-nudge --marketplace DCXTribe/VicMods
```

From a shell:

```
claude plugin install fable-ambition --marketplace DCXTribe/VicMods
claude plugin install superpowers-nudge --marketplace DCXTribe/VicMods
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `DCXTribe/VicMods`, then Add plugin.

These mods use Claude Code's function-hooks plugin API, which is in early access and may change between releases.

## Develop

```
claude plugin validate plugins/<mod>
claude plugin test plugins/<mod>
claude --plugin-dir plugins/<mod>
```

## License

[MIT](LICENSE)
