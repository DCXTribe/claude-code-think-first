# claude-code-think-first

Claude Code mods that make Claude think before it acts, by Victor Cheong ([DCXTribe](https://github.com/DCXTribe)). Each adds a band above the prompt:

- **thinkfirst-ambition** sharpens the task *before* you send it, then keeps execution on Opus and Sonnet.
- **thinkfirst-skillcue** brings in the right [superpowers](https://github.com/obra/superpowers) skill *before* Claude starts coding.

| Mod | What it does |
| --- | --- |
| [thinkfirst-ambition](plugins/thinkfirst-ambition) | A band above the prompt with four one-key Fable calls (Reverb, Council, Summit, Deepen) that sharpen a task before you send it. Subagents asked to run on Fable go to Opus instead, and a token meter shows Fable's share of the spend. |
| [thinkfirst-skillcue](plugins/thinkfirst-skillcue) | When a prompt looks like development work, suggests the matching [superpowers](https://github.com/obra/superpowers) skill in a band above the prompt and reminds Claude to use it. |

Both bands can show at once; each draws the other beneath it.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install thinkfirst-ambition --marketplace DCXTribe/claude-code-think-first
/plugin install thinkfirst-skillcue --marketplace DCXTribe/claude-code-think-first
```

From a shell:

```
claude plugin install thinkfirst-ambition --marketplace DCXTribe/claude-code-think-first
claude plugin install thinkfirst-skillcue --marketplace DCXTribe/claude-code-think-first
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `DCXTribe/claude-code-think-first`, then Add plugin.

These mods use Claude Code's function-hooks plugin API, which is in early access and may change between releases.

## Develop

```
claude plugin validate plugins/<mod>
claude plugin test plugins/<mod>
claude --plugin-dir plugins/<mod>
```

## License

[MIT](LICENSE)
