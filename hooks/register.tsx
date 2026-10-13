import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Suggestion } from '../types'

// Which superpowers skill fits the prompt, by the words it uses.
const DEBUG = /\b(bug|bugs|broken|fix|fixes|fixing|crash|crashes|error|errors|exception|failing|fails|not working|doesn'?t work|regression|debug|stack ?trace)\b/i
const BUILD = /\b(build|builds|building|implement|implements|implementing|create|creates|creating|add|adds|adding|write|writes|writing|develop|developing|feature|features|refactor|refactors|refactoring|migrate|migrating|integrate|integrating|scaffold|set ?up|wire ?up|extend|extending|component|endpoint|api|cli|app|service|module|function|class|script|page|screen)\b/i
const TEST = /\b(test|tests|testing|spec|specs|coverage|tdd)\b/i
// Prompts that are not dev tasks even when a dev word appears.
const NOT_DEV = /^\s*(\/|what is|what's|explain|why does|how does|tell me about)/i

const CODE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|m|mm|c|cc|cpp|h|hpp|cs|php|sh|zsh|sql|vue|svelte|dart|scala|ex|exs|html|css|scss)$/i

const COMMAND = 'superpowers-nudge'
const CONFIG_KEY = 'superpowers-nudge.enabled'

const nudge = atom({ plugin: 'superpowers-nudge', key: 'nudge' } as const, null)
const paused = atom({ plugin: 'superpowers-nudge', key: 'paused' } as const, false)
const PAUSED_STATUS = `superpowers nudge paused for this session. /${'superpowers-nudge'} resume to continue`

export function classify(text: string): Suggestion | null {
  if (NOT_DEV.test(text)) return null
  if (DEBUG.test(text)) {
    return { skill: 'superpowers:systematic-debugging', reason: 'bug or failure described' }
  }
  if (BUILD.test(text)) {
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
      description: 'Superpowers nudge: /superpowers-nudge on|off|pause|resume|status',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.config.set({ key: CONFIG_KEY, value: arg === 'on' })
      return { text: `Superpowers nudge turned ${arg}.` }
    }
    if (arg === 'pause' || arg === 'hold') {
      await update($, paused, () => true)
      await update($, nudge, () => null)
      $.ui.status(PAUSED_STATUS)
      return { text: 'Superpowers nudge paused for this session. /superpowers-nudge resume to continue.' }
    }
    if (arg === 'resume') {
      await update($, paused, () => false)
      $.ui.status(undefined)
      return { text: 'Superpowers nudge resumed.' }
    }
    const isPaused = await read($, paused)
    const state = !enabled ? 'off' : isPaused ? 'paused for this session' : 'on'
    return {
      text: `Superpowers nudge is ${state}. Use /${COMMAND} on|off|pause|resume, or the "Superpowers nudge" row in /config.`,
    }
  })

  on('prompt.submit', async ($, e, next) => {
    active = null
    warnedEdit = false
    const isPaused = await read($, paused)
    suggestion = enabled && !isPaused ? classify(e.text) : null
    await update($, nudge, () => suggestion)

    if (suggestion === null) {
      $.ui.status(isPaused ? PAUSED_STATUS : undefined)
      return next(e)
    }

    $.ui.toast(`Dev task detected (${suggestion.reason}): activate ${suggestion.skill}`, { timeoutMs: 6000 })

    const reminder =
      `[superpowers-nudge] This prompt looks like development work (${suggestion.reason}). ` +
      `Before any other response or tool call, invoke the Skill tool with "${suggestion.skill}" ` +
      `(or the superpowers skill that fits better), as the using-superpowers rule requires.`

    return next({ ...e, context: [...(e.context ?? []), reminder] })
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (e.skill.startsWith('superpowers:')) {
      active = e.skill
      await update($, nudge, () => null)
      $.ui.status(`superpowers: ${e.skill} active`)
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
    const activate = async () => {
      await $.prompt.fill({ text: `/${current.skill} `, mode: 'replace' })
      await clear()
    }
    const hold = async () => {
      await update($, paused, () => true)
      await clear()
      $.ui.status(PAUSED_STATUS)
    }

    return (
      <Box key="nudge" borderStyle="round" borderColor="claude" paddingX={1} gap={1}>
        <Text bold color="claude">⚡ Superpowers</Text>
        <Text>
          Dev task: {current.reason}. Suggested <Text bold>{current.skill}</Text>
        </Text>
        <Button key="activate" variant="primary" hotkey="a" onPress={activate}>Activate</Button>
        <Button key="dismiss" dimColor hotkey="d" onPress={clear}>Dismiss</Button>
        <Button key="hold" role="dismiss" dimColor hotkey="h" onPress={hold}>Hold</Button>
      </Box>
    )
  })
}
