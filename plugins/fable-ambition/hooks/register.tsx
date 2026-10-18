import { atom, read, update } from 'claude-code'
import type { Register, ModelUsage, EngineInterface } from 'claude-code'

import type { Card, Fn, Lane, Spend } from '../types'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const PLUGIN = 'fable-ambition' as const
const emptyLane = (): Lane => ({ in: 0, out: 0, cached: 0, calls: 0 })
const emptySpend = (): Spend => ({
  fable: emptyLane(),
  opus: emptyLane(),
  sonnet: emptyLane(),
  other: emptyLane(),
  spawns: { fable: 0, opus: 0, sonnet: 0, other: 0 },
})

// $.state outlives a reload, so a meter written by an older version may lack
// fields this one counts: fill them with zeros rather than draw NaN.
const asLane = (l: Partial<Lane> | undefined): Lane => ({ ...emptyLane(), ...l })
const asSpend = (s: Partial<Spend> | undefined): Spend => ({
  fable: asLane(s?.fable),
  opus: asLane(s?.opus),
  sonnet: asLane(s?.sonnet),
  other: asLane(s?.other),
  spawns: { ...emptySpend().spawns, ...s?.spawns },
})

const card = atom({ plugin: 'fable-ambition', key: 'card' } as const, null)
const busy = atom({ plugin: 'fable-ambition', key: 'busy' } as const, null)
const spend = atom({ plugin: 'fable-ambition', key: 'spend' } as const, emptySpend())
const isHidden = atom({ plugin: 'fable-ambition', key: 'isHidden' } as const, false)
const showRaw = atom({ plugin: 'fable-ambition', key: 'showRaw' } as const, false)

// ---------------------------------------------------------------------------
// Models and routing
// ---------------------------------------------------------------------------

/** The thinker. Every band function is one call to this model. */
const THINKER = 'fable'
/** Fable's share of all tokens above which the meter turns amber. */
const FABLE_WARN_SHARE = 0.2

type LaneName = 'fable' | 'opus' | 'sonnet' | 'other'

export const laneOf = (model: string | undefined): LaneName => {
  const m = (model ?? '').toLowerCase()
  if (/fable|mythos/.test(m)) return 'fable'
  if (/opus/.test(m)) return 'opus'
  if (/sonnet/.test(m)) return 'sonnet'
  return 'other'
}

/** The executor a subagent asked to run on Fable is moved to. */
const FABLE_REROUTE = 'opus'

/**
 * The model a spawn should run on instead, or undefined to leave it.
 *
 * A spawn that names no model inherits its parent's (unless its agent type
 * sets one, which this hook cannot see), so a Fable parent means a Fable
 * child. A fork, a workflow agent and a resumed run keep their model: the
 * engine refuses to change it.
 */
export const reroute = (e: {
  model?: string
  parentModel: string
  fork: boolean
  workflow?: unknown
  resume?: unknown
}): string | undefined => {
  if (e.fork || e.workflow !== undefined || e.resume !== undefined) return undefined
  return laneOf(e.model ?? e.parentModel) === 'fable' ? FABLE_REROUTE : undefined
}

const addUsage = (s0: Spend, lane: LaneName, u: ModelUsage): Spend => {
  const s = asSpend(s0)
  return {
    ...s,
    [lane]: {
      in: s[lane].in + u.input_tokens + u.cache_creation_input_tokens,
      out: s[lane].out + u.output_tokens,
      cached: s[lane].cached + u.cache_read_input_tokens,
      calls: s[lane].calls + 1,
    },
  }
}

/**
 * Billable tokens: cache reads are left out, since every executor turn
 * rereads the whole transcript at a tenth of the price, and counting them
 * made Fable's share look far smaller than what it costs.
 */
const total = (l: Lane) => l.in + l.out
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${n}`)

// ---------------------------------------------------------------------------
// The four functions. Each is one Fable call, high effort, no history.
// ---------------------------------------------------------------------------

const FN: Record<Fn, { label: string; hotkey: string; effort: 'high' | 'xhigh'; maxTokens: number; system: string }> = {
  reverb: {
    label: 'Reverb',
    hotkey: '1',
    effort: 'high',
    maxTokens: 300,
    system: [
      'The user will give you a task. Find its key noun (the deliverable: a deck, a dashboard, a report, an app)',
      'and rewrite it as the real verb: the outcome that noun exists to cause, for whom, under what constraint.',
      'Example: "QBR deck" becomes "getting busy people to believe a story about cause and effect and decide under uncertainty in 30 minutes."',
      'Answer with ONE line in that shape and nothing else. No preamble, no quotes, no options.',
    ].join(' '),
  },
  council: {
    label: 'Council',
    hotkey: '2',
    effort: 'high',
    maxTokens: 700,
    system: [
      'The user will give you a task. Assemble a council of 3 to 5 lenses that would each change how this task is done.',
      'Lenses are methods and checks, not costumes: "do what a forensic accountant does", never "write as if you are".',
      'The last seat is always Red Team: the person in the room who wants this to fail and asks the question that kills it.',
      'Format: one line per lens, "Name — one sentence stating what that lens checks or changes for THIS task." Red Team last. Nothing else.',
    ].join(' '),
  },
  summit: {
    label: 'Summit',
    hotkey: '3',
    effort: 'high',
    maxTokens: 400,
    system: [
      'The user will give you a task. Raise its altitude. Answer in exactly three labelled lines and nothing else:',
      'Goal beyond the goal: what should actually happen next because this exists, the outcome, not the surface task.',
      'Hard target: an ambitious but solvable, measurable bar, with a number or a binary (200 ms, crash-free, 3 decisions logged), never an adjective.',
      'Outside judge: something other than the user or a model that will show the result is right (a tool measurement, a backtest, real-user numbers, a statistical test).',
    ].join(' '),
  },
  deepen: {
    label: 'Deepen',
    hotkey: '4',
    effort: 'xhigh',
    maxTokens: 1500,
    system: [
      'The user will give you a task and wants a deeper version of it, not a bigger one. Before rewriting it:',
      '1. Say what a top professional in this field would do here that they are not asking for.',
      '2. Name the rawest material that professional would start from instead of what has already been digested for them.',
      '3. Name the specific methods and tools they would use.',
      '4. Say what, other than you or them, would show the result is right.',
      'Then rewrite their prompt to ask for exactly that.',
      'Format: the four answers as a numbered list, two sentences each at most; then a line "## Rewritten task" and the rewritten prompt, written to be sent as-is to an executor model.',
      'Insist on real instruments (code, data, profilers, tests), not better vocabulary. Do not pad.',
    ].join(' '),
  },
}

const FN_ORDER: Fn[] = ['reverb', 'council', 'summit', 'deepen']

/**
 * What a card puts in the prompt box: Deepen's rewritten task alone, the
 * others as a labelled block. Appending leaves the draft as it stands now.
 */
export const compose = (c: Card): string => {
  if (c.fn === 'deepen') {
    const i = c.text.indexOf('## Rewritten task')
    return i >= 0 ? c.text.slice(i + '## Rewritten task'.length).trim() : c.text.trim()
  }
  return `[${FN[c.fn].label}]\n${c.text.trim()}`
}

// ---------------------------------------------------------------------------
// Actions (top-level so they may take $)
// ---------------------------------------------------------------------------

// Held in the module, not $.state, so two presses in one tick cannot both
// pass the check before either writes `busy`. A reload drops it, and the
// call it guarded with it.
let inFlight: Fn | null = null

/**
 * One Fable call per function, on `task` when given (`/ambition deepen …`),
 * else on the draft in the prompt box. False when there was nothing to run on
 * or a call was already running; the person has been told which.
 */
const run = async ($: EngineInterface, fn: Fn, task?: string): Promise<boolean> => {
  if (inFlight !== null) {
    $.ui.toast('Fable is already thinking.')
    return false
  }
  const source = (task ?? (await $.prompt.read()).text).trim()
  if (source.length === 0) {
    $.ui.toast(`Type your task in the prompt first, then press ${FN[fn].hotkey}, or run /ambition ${fn} <task>.`)
    return false
  }
  inFlight = fn
  void think($, fn, source)
  return true
}

const think = async ($: EngineInterface, fn: Fn, source: string) => {
  const spec = FN[fn]
  try {
    await update($, busy, () => fn)
    $.ui.status(`Fable · ${spec.label}…`)
    const r = await $.model.complete({
      model: THINKER,
      system: spec.system,
      prompt: source,
      effort: spec.effort,
      maxTokens: spec.maxTokens,
      timeoutMs: 120_000,
    })
    await update($, spend, (s) => addUsage(s, 'fable', r.usage))
    if (r.isAnswered) {
      const next: Card = { fn, source, text: r.text }
      await update($, card, () => next)
    } else {
      $.ui.toast(`${spec.label}: no answer from Fable (${r.reason}).`)
    }
  } catch (err) {
    // Only a request the engine refuses to send rejects (a blocked model, say).
    $.ui.toast(`${spec.label}: Fable call refused (${err instanceof Error ? err.message : String(err)}).`)
  } finally {
    inFlight = null
    await update($, busy, () => null)
    $.ui.status(undefined)
  }
}

// Taking a card: replace the draft, or append to the draft as it is now (not
// as it was when the function ran), then close the card.
const take = async ($: EngineInterface, mode: 'replace' | 'append') => {
  const c = await read($, card)
  if (c === null) return
  const block = compose(c)
  const hasDraft = mode === 'append' && (await $.prompt.read()).text.trim().length > 0
  const filled = await $.prompt.fill(hasDraft ? { text: `\n\n${block}`, mode: 'append' } : { text: block, mode: 'replace' })
  if (!filled.isFilled) {
    $.ui.toast('Could not fill the prompt box.')
    return
  }
  await update($, card, () => null)
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ambition',
      description: 'Fable-ambition band: show, hide, reset the meter, or run reverb|council|summit|deepen [task]',
    })
    return next(e)
  })

  // /ambition [show|hide|reset] or /ambition <reverb|council|summit|deepen> [task]
  on('command.run', { command: 'ambition' }, async ($, e) => {
    const args = e.args.trim()
    const arg = (args.split(/\s+/)[0] ?? '').toLowerCase()
    const task = args.slice(arg.length).trim()
    if (arg === 'hide') {
      await update($, isHidden, () => true)
      return { text: 'Ambition band hidden. /ambition show brings it back.' }
    }
    if (arg === 'reset') {
      await update($, spend, () => emptySpend())
      return { text: 'Token meter reset.' }
    }
    if ((FN_ORDER as string[]).includes(arg)) {
      const fn = arg as Fn
      await update($, isHidden, () => false)
      // Submitting the command empties the prompt box, so the task comes with it.
      if (task.length === 0) {
        return { text: `Usage: /ambition ${fn} <task>. Or type the task in the prompt and press ${FN[fn].hotkey} in the band.` }
      }
      const started = await run($, fn, task)
      return { text: started ? `${FN[fn].label} running on Fable.` : 'Fable is already thinking; try again when it answers.' }
    }
    await update($, isHidden, () => false)
    return { text: 'Ambition band shown. Keys 1–4: Reverb, Council, Summit, Deepen.' }
  })

  // ---- Token tracking --------------------------------------------------------

  // Every turn that ends with usage: the main thread and each subagent's.
  on('turn.complete', async ($, e, next) => {
    if (e.usage) {
      const lane = laneOf(e.usage.model)
      await update($, spend, (s) => addUsage(s, lane, e.usage!))
    }
    return next(e)
  })

  // Executors act, Fable thinks: a subagent that would run on Fable, named or
  // inherited from a Fable parent, is moved to Opus. A failing hook is
  // skipped and the spawn goes ahead unchanged, which is the fallback wanted.
  on('agent.spawn', async ($, e, next) => {
    const model = reroute(e)
    if (model !== undefined) {
      $.ui.toast(`Subagent would run on Fable; routed to ${model} (Fable only thinks here).`)
    }
    const r = await next(model === undefined ? e : { ...e, model })
    if (r.deny === undefined) {
      // Count by what the engine resolved, not what was asked.
      const lane = laneOf(r.model)
      await update($, spend, (s0) => {
        const s = asSpend(s0)
        return { ...s, spawns: { ...s.spawns, [lane]: s.spawns[lane] + 1 } }
      })
    }
    return r
  })

  // Tell the main model the routing rule, so its own delegation follows it.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    return {
      sections: [
        ...r.sections,
        {
          id: `${PLUGIN}:routing`,
          scope: 'session',
          text: [
            '# Fable-ambition routing',
            'The person may prefix their prompt with a [Reverb], [Council] or [Summit] block, or send a rewritten task: these came from one Fable 5.1 call and are the plan. Treat them as the scope.',
            'When you delegate with the Agent tool, use model "opus" for complex or high-stakes pieces and "sonnet" for routine or narrow ones. Do not spawn subagents on Fable.',
            'Executors report back in a few lines: what changed, the check result, any blocker. Do not paste their full output back into the plan.',
          ].join('\n'),
        },
      ],
    }
  })

  // ---- The band ----------------------------------------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const { Box, Button, Text, Markdown } = $.ui.resolve(e)
    const [c, b, s0, raw] = await Promise.all([read($, card), read($, busy), read($, spend), read($, showRaw)])
    const s = asSpend(s0)

    const all = total(s.fable) + total(s.opus) + total(s.sonnet) + total(s.other)
    const share = all === 0 ? 0 : total(s.fable) / all
    const pct = Math.round(share * 100)
    const cells = 10
    const lit = all === 0 ? 0 : Math.max(share > 0 ? 1 : 0, Math.round(share * cells))
    const bar = '▮'.repeat(lit) + '▯'.repeat(cells - lit)
    const warn = share > FABLE_WARN_SHARE
    const working = e.props.isWorking
    // Another plugin's band (superpowers-nudge's, say) may sit beneath: draw it
    // under this one instead of hiding it.
    const below = await next(e)

    return (
      <Box flexDirection="column" gap={0}>
        {/* Row 1: the four functions + who is working */}
        <Box gap={1}>
          {FN_ORDER.map((fn) => (
            <Button
              key={fn}
              hotkey={FN[fn].hotkey}
              label={b === fn ? `${FN[fn].label}…` : FN[fn].label}
              dimColor={b !== null && b !== fn}
              onPress={() => void run($, fn)}
            />
          ))}
          <Text dimColor>│</Text>
          <Text color={b !== null ? 'yellow' : undefined} dimColor={b === null}>
            {b !== null ? '● Fable thinking' : '○ Fable'}
          </Text>
          <Text color={working ? 'cyan' : undefined} dimColor={!working}>
            {working ? '● Opus/Sonnet acting' : '○ Opus/Sonnet'}
          </Text>
          <Button key="hide" plain dimColor label="hide" hotkey="h" onPress={() => update($, isHidden, () => true)} />
        </Box>

        {/* Row 2: the meter */}
        <Box gap={1}>
          <Text color={warn ? 'yellow' : 'green'} bold>
            Fable {pct}% {bar}
          </Text>
          {raw ? (
            <Text dimColor mono>
              fable {k(total(s.fable))} ({s.fable.calls}) · opus {k(total(s.opus))} ({s.opus.calls}) · sonnet {k(total(s.sonnet))} ({s.sonnet.calls})
              {total(s.other) > 0 ? ` · other ${k(total(s.other))}` : ''} · total {k(all)} · cache reads {k(s.fable.cached + s.opus.cached + s.sonnet.cached + s.other.cached)}
            </Text>
          ) : (
            <Text dimColor mono>
              fable {k(total(s.fable))} · opus {k(total(s.opus))} · sonnet {k(total(s.sonnet))} · total {k(all)} · spawns o{s.spawns.opus}/s{s.spawns.sonnet}{s.spawns.fable > 0 ? `/fable ${s.spawns.fable}` : ''}
            </Text>
          )}
          <Button key="raw" plain dimColor label={raw ? 'less' : 'more'} hotkey="t" onPress={() => update($, showRaw, (v) => !v)} />
          {warn && <Text color="yellow">Fable above {Math.round(FABLE_WARN_SHARE * 100)}%: let the executors run.</Text>}
        </Box>

        {/* Row 3: the card, when a function has answered */}
        {c !== null && (
          <Box flexDirection="column" borderStyle="round" borderColor={c.fn === 'council' ? 'red' : 'yellow'} paddingX={1} marginTop={1}>
            <Text bold color="yellow">
              {FN[c.fn].label} <Text dimColor>· from Fable · {c.source.slice(0, 60)}{c.source.length > 60 ? '…' : ''}</Text>
            </Text>
            <Markdown text={c.text} />
            <Box gap={1} marginTop={1}>
              <Button key="use" variant="primary" hotkey="u" label="Use (replace prompt)" onPress={() => void take($, 'replace')} />
              <Button key="append" hotkey="a" label="Append to prompt" onPress={() => void take($, 'append')} />
              <Button key="close" role="dismiss" hotkey="x" label="Close" onPress={() => update($, card, () => null)} />
            </Box>
          </Box>
        )}
        {below}
      </Box>
    )
  })
}
