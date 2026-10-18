import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Suggestion } from '../types'

// Which superpowers skill fits the prompt, by the words it uses.
// A failure described, not the bare verb "fix": "fix the typo in the README"
// or "fix all of the review findings" is not a bug hunt.
const DEBUG = /\b(bug|bugs|broken|crash|crashes|crashing|error|errors|exception|exceptions|failing|fails|failed|not working|doesn'?t work|regression|debug|debugging|stack ?trace|traceback|segfault)\b/i
// Verbs that only ever mean code.
const CODE_VERB = /\b(implement|implements|implementing|refactor|refactors|refactoring|scaffold|scaffolding|migrate|migrating)\b/i
// Verbs that mean code only next to a thing software is made of: "write a
// LinkedIn post" and "create a calendar invite" are not dev work.
const BUILD_VERB = /\b(build|builds|building|create|creates|creating|add|adds|adding|write|writes|writing|develop|developing|integrate|integrating|set ?up|wire ?up|extend|extending)\b/i
const CODE_NOUN = /\b(feature|features|component|components|endpoint|endpoints|api|apis|cli|app|apps|service|services|module|modules|function|functions|class|classes|script|scripts|page|pages|screen|screens|plugin|plugins|mod|mods|hook|hooks|database|schema|migration|route|routes|handler|library|sdk|server|backend|frontend|website|toggle|setting|settings|button|form|widget)\b/i
const TEST = /\b(test|tests|testing|spec|specs|coverage|tdd)\b/i
// Prompts that are not dev tasks even when a dev word appears.
const NOT_DEV = /^\s*(\/|what is|what's|explain|why does|how does|how do i|tell me about|show me|is there|are there|do i have)/i

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|m|mm|c|cc|cpp|h|hpp|cs|php|sh|zsh|sql|vue|svelte|dart|scala|ex|exs|html|css|scss)$/i

const COMMAND = 'skillcue'
const CONFIG_KEY = 'thinkfirst-skillcue.enabled'

const nudge = atom({ plugin: 'thinkfirst-skillcue', key: 'nudge' } as const, null)
const paused = atom({ plugin: 'thinkfirst-skillcue', key: 'paused' } as const, false)
const PAUSED_STATUS = `skill cue paused for this session. /skillcue resume to continue`

export function classify(text: string): Suggestion | null {
  if (NOT_DEV.test(text)) return null
  if (DEBUG.test(text)) {
    return { skill: 'superpowers:systematic-debugging', reason: 'bug or failure described' }
  }
  if (CODE_VERB.test(text) || (BUILD_VERB.test(text) && CODE_NOUN.test(text))) {
    return { skill: 'superpowers:brainstorming', reason: 'something to build or change' }
  }
  if (TEST.test(text)) {
    return { skill: 'superpowers:test-driven-development', reason: 'tests mentioned' }
  }
  return null
}

export const register: Register = (on, options) => {
  const enabled = options.enabled !== false
  let active: string | null = null
  let suggestion: Suggestion | null = null
  let warnedEdit = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Skill cue: /skillcue on|off|pause|resume|status',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.config.set({ key: CONFIG_KEY, value: arg === 'on' })
      return { text: `Skill cue turned ${arg}.` }
    }
    if (arg === 'pause' || arg === 'hold') {
      await update($, paused, () => true)
      await update($, nudge, () => null)
      $.ui.status(PAUSED_STATUS)
      return { text: 'Skill cue paused for this session. /skillcue resume to continue.' }
    }
    if (arg === 'resume') {
      await update($, paused, () => false)
      $.ui.status(undefined)
      return { text: 'Skill cue resumed.' }
    }
    const isPaused = await read($, paused)
    const state = !enabled ? 'off' : isPaused ? 'paused for this session' : 'on'
    return {
      text: `Skill cue is ${state}. Use /${COMMAND} on|off|pause|resume, or the "Skill cue" row in /config.`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    active = null
    warnedEdit = false
    const isPaused = await read($, paused)
    suggestion = enabled && !isPaused ? classify(e.text) : null
    await update($, nudge, () => suggestion)

    // The last turn's "active" is not this turn's.
    $.ui.status(isPaused ? PAUSED_STATUS : undefined)
    if (suggestion === null) return next(e)

    $.ui.toast(`Dev task detected (${suggestion.reason}): activate ${suggestion.skill}`, { timeoutMs: 6000 })

    const reminder =
      `[skillcue] This prompt looks like development work (${suggestion.reason}). ` +
      `Before any other response or tool call, invoke the Skill tool with "${suggestion.skill}" ` +
      `(or the superpowers skill that fits better), as the using-superpowers rule requires.`

    return next({ ...e, context: [...(e.context ?? []), reminder] })
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (e.skill.startsWith('superpowers:')) {
      active = e.skill
      await update($, nudge, () => null)
      $.ui.status(`superpowers: ${e.skill.slice('superpowers:'.length)} active`)
    }
    return next(e)
  })

  // The toast to show for an edit of `path` before superpowers is active, once per turn.
  const editWarning = (path: string): string | null => {
    if (suggestion === null || active !== null || warnedEdit || !CODE_FILE.test(path)) return null
    warnedEdit = true
    return `Editing code without superpowers active. Suggested: ${suggestion.skill}`
  }

  on('tool.call', { tool: 'Edit' }, ($, e, next) => {
    const warning = editWarning(e.file_path)
    if (warning !== null) $.ui.toast(warning, { timeoutMs: 8000 })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, ($, e, next) => {
    const warning = editWarning(e.file_path)
    if (warning !== null) $.ui.toast(warning, { timeoutMs: 8000 })
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, nudge)
    if (e.props.hasSurvey || current === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const clear = () => update($, nudge, () => null)
    // Put the skill command in front of whatever is being typed, never over it.
    const activate = async () => {
      const draft = await $.prompt.read().then((b) => b.text.trim(), () => '')
      await $.prompt.fill({ text: `/${current.skill} ${draft}`, mode: 'replace' })
      await clear()
    }
    const hold = async () => {
      await update($, paused, () => true)
      await clear()
      $.ui.status(PAUSED_STATUS)
    }

    // Another plugin's band (thinkfirst-ambition's, say) may sit beneath: draw it
    // under this one instead of hiding it.
    const below = await next(e)

    return (
      <Box flexDirection="column">
        <Box key="nudge" borderStyle="round" borderColor="claude" paddingX={1} gap={1}>
          <Text bold color="claude">⚡ Skill cue</Text>
          <Text>
            Dev task: {current.reason}. Suggested <Text bold>{current.skill}</Text>
          </Text>
          <Button key="activate" variant="primary" hotkey="a" onPress={activate}>Activate</Button>
          {/* role="dismiss" is the desktop's close control: it must only dismiss, never pause the session. */}
          <Button key="dismiss" role="dismiss" dimColor hotkey="d" onPress={clear}>Dismiss</Button>
          <Button key="hold" dimColor hotkey="h" onPress={hold}>Hold</Button>
        </Box>
        {below}
      </Box>
    )
  })
}
