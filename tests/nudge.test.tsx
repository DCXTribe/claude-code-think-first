import { test, expect } from 'claude-code/testing'
import { classify } from '../hooks/register'

const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } as const })
const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}

test('classify picks the skill from the words used', async () => {
  expect(classify('fix the login bug')?.skill).toBe('superpowers:systematic-debugging')
  expect(classify('add a settings page to the app')?.skill).toBe('superpowers:brainstorming')
  expect(classify('tdd please')?.skill).toBe('superpowers:test-driven-development')
  expect(classify('what is a monad')).toBe(null)
  expect(classify('/help')).toBe(null)
  expect(classify('good morning')).toBe(null)
})

test('a dev prompt toasts and attaches context', async ($, on) => {
  const toasts: string[] = []
  let entered: readonly string[] | undefined
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => { entered = e.context; return { text: e.text, context: e.context } })

  await $.prompt.submit(typed('fix the crash on startup'))

  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('superpowers:systematic-debugging')
  expect(entered?.length).toBe(1)
  expect(entered?.[0]).toContain('superpowers:systematic-debugging')
})

test('a non-dev prompt is left alone', async ($, on) => {
  const toasts: string[] = []
  let entered: readonly string[] | undefined
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => { entered = e.context; return { text: e.text, context: e.context } })

  await $.prompt.submit(typed('what is the capital of Peru'))

  expect(toasts.length).toBe(0)
  expect(entered).toBe(undefined)
})

test('disabled by config, a dev prompt is left alone', { options: { enabled: false } }, async ($, on) => {
  const toasts: string[] = []
  let entered: readonly string[] | undefined
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => { entered = e.context; return { text: e.text, context: e.context } })

  await $.prompt.submit(typed('fix the crash on startup'))

  expect(toasts.length).toBe(0)
  expect(entered).toBe(undefined)
})

test('invoking a superpowers skill updates the status to active', async ($, on) => {
  const statuses: (string | undefined)[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', (_$, e) => { statuses.push(e.text); return { value: undefined } })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  on('tool.call', { tool: 'Skill' }, () => ({ result: 'ok' }))

  await $.prompt.submit(typed('implement the export feature'))
  await $.tool.call({ tool: 'Skill', skill: 'superpowers:brainstorming' })

  expect(statuses[statuses.length - 1]).toBe('superpowers: superpowers:brainstorming active')
})

test('editing a code file before activation toasts once per turn', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  on('tool.call', { tool: 'Edit' }, () => ({ result: 'ok' }))

  await $.prompt.submit(typed('refactor the parser'))
  await $.tool.call({ tool: 'Edit', file_path: '/x/parser.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/x/lexer.ts', old_string: 'a', new_string: 'b' })

  expect(toasts.filter(t => t.startsWith('Editing code')).length).toBe(1)
})

test('the band shows after a dev prompt, Activate fills the prompt, and the band clears', async ($, on) => {
  const filled: string[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  on('prompt.fill', (_$, e) => { filled.push(e.text); return { isFilled: true } })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => { const { Box } = $.ui.resolve(e); return <Box key="empty" /> })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'superpowers-nudge', surface, ...BAND })
    expect(await ui.find({ key: 'activate' })).toBe(undefined)

    await $.prompt.submit(typed('add a dark mode toggle'))
    await ui.redraw()
    expect(await ui.find({ key: 'activate' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /brainstorming/ }))).toBeDefined()

    await ui.press({ key: 'activate' })
    expect(filled[filled.length - 1]).toBe('/superpowers:brainstorming ')
    await ui.redraw()
    expect(await ui.find({ key: 'activate' })).toBe(undefined)
    await ui.unmount()
  }
})

test('Dismiss clears the band without filling the prompt', async ($, on) => {
  const filled: string[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  on('prompt.fill', (_$, e) => { filled.push(e.text); return { isFilled: true } })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => { const { Box } = $.ui.resolve(e); return <Box key="empty" /> })

  const ui = await $.ui.mount({ plugin: 'superpowers-nudge', surface: 'terminal', ...BAND })
  await $.prompt.submit(typed('fix the broken build'))
  await ui.redraw()
  expect(await ui.find({ key: 'dismiss' })).toBeDefined()

  await ui.press({ key: 'dismiss' })
  await ui.redraw()
  expect(await ui.find({ key: 'dismiss' })).toBe(undefined)
  expect(filled.length).toBe(0)
  await ui.unmount()
})
