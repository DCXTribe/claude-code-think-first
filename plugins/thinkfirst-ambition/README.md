# thinkfirst-ambition

A band above the prompt. Fable thinks, Opus and Sonnet act, and a token meter keeps Fable's share honest.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install thinkfirst-ambition --marketplace DCXTribe/claude-code-think-first
```

From a shell:

```
claude plugin install thinkfirst-ambition --marketplace DCXTribe/claude-code-think-first
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `DCXTribe/claude-code-think-first`, then Add plugin.

## What it does

Type your task in the prompt box, then press one key (the band must have focus: click it or `ctrl+x tab`):

| Key | Function | One Fable call that returns… |
|---|---|---|
| `1` | **Reverb** | the task's key noun rewritten as the real verb/outcome, one line |
| `2` | **Council** | 3–5 lenses, one sentence each, Red Team always last |
| `3` | **Summit** | goal beyond the goal · hard target (a number) · outside judge |
| `4` | **Deepen** | the 4-things answers, then `## Rewritten task` |

The reply lands in a card above the prompt. `u` replaces your draft with it (Deepen uses only the rewritten task), `a` appends it to your draft as it is now, `x` closes it. Then press Enter as usual: the main model and its subagents do the work.

`h` hides the band, `t` switches the meter between summary and raw counts. `/ambition` shows it again; `/ambition reset` clears the meter; `/ambition deepen <task>` (or reverb, council, summit) runs a function on the task you give it, without focusing the band. Only one Fable call runs at a time.

## Routing

- Every band function runs on `fable` (Reverb/Council/Summit at `high` effort, Deepen at `xhigh`), with no history: it reads only what is in the prompt box.
- A subagent that would run on Fable is rerouted to Opus, with a toast: one that names Fable, and one that names no model while the main session runs on Fable (it would inherit Fable). That second case also moves an agent type whose own definition names a model, since the hook cannot see it. Forks, workflow agents and resumed runs keep their model; the meter counts them under `fable` if they run there. A system-prompt section tells the main model to delegate hard pieces to `opus` and routine ones to `sonnet`, and never to Fable.
- The meter counts billable tokens per lane (Fable / Opus / Sonnet / other) from every completed turn, main thread and subagents alike, plus the band's own Fable calls. Cache reads are left out of the share (every executor turn rereads the transcript from cache, cheaply) and shown in the raw row. Spawns are counted by the model they actually run on. Above 20% Fable share it turns amber.

## What it runs and sends

- **Model calls.** Each band function (Reverb, Council, Summit, Deepen) makes one call to Fable through your own Claude Code session, sending only the text in your prompt box (or the task given to `/ambition <fn> <task>`) and that function's fixed instructions. No conversation history goes with it. Nothing runs until you press a key or run the command.
- **System prompt.** It adds one short section to Claude's system prompt: the routing rule (delegate to Opus or Sonnet, not Fable) and a note that a `[Reverb]`, `[Council]` or `[Summit]` block in your prompt came from Fable.
- **Subagents.** A subagent that would run on Fable is started on Opus instead, with a toast saying so.
- **Local state only.** The token meter reads the usage Claude Code reports at the end of each turn and keeps it in this session's plugin state. It is not saved across sessions.
- **Nothing else.** It reads no files, runs no processes, and contacts no service other than your Claude Code session's own model API.

## Files

```
.claude-plugin/plugin.json   manifest
hooks/hooks.json             → register.tsx
hooks/register.tsx           the band, the four functions, the meter, the routing hooks
types/index.d.ts             state contract (card, busy, spend, isHidden, showRaw)
tests/band.test.tsx          the band's drawing
tests/fixes.test.tsx         routing, /ambition <fn> <task>, append, the busy guard, the meter
```

Validate with `claude plugin validate .`, type-check with `tsc -p .` once the engine has laid `.claude-plugin/types/`, test with `claude plugin test .`.

## Tuning

Edit the top of `hooks/register.tsx`: `THINKER` (the model the band calls), `FABLE_WARN_SHARE` (the amber threshold), and the `FN` table (system prompts, effort, token caps per function).
