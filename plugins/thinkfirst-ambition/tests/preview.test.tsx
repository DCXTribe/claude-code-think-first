import { test, expect } from 'claude-code/testing'

const BAND = {
  plugin: 'thinkfirst-ambition',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 40,
    bodyColumns: 120,
    scroll: { top: 0, bodyRows: 40 },
    view: {},
  },
} as const

// Stands in for the engine beneath the plugins, which draws nothing here.
const engineBand = (on: any) =>
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-empty" />
  })

const USAGE = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const setup = (on: any, seen: string[]) => {
  engineBand(on)
  on('prompt.read', () => ({ value: { text: 'build the QBR deck', cursor: 18 } }))
  on('model.complete', (_$: any, e: any) => {
    seen.push(e.prompt)
    return { value: { isAnswered: true, text: 'Ship the outcome.', usage: USAGE } }
  })
}

test('the first press explains the function and calls nothing', async ($, on) => {
  const seen: string[] = []
  setup(on, seen)
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'council' })
  expect(await ui.find({ key: 'detail' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Red Team always sits last/ })).toBeDefined()
  expect(await ui.find({ key: 'run' })).toBeDefined()
  expect(seen).toEqual([])
  await ui.unmount()
})

test('pressing the same key again runs it and closes the explanation', async ($, on) => {
  const seen: string[] = []
  setup(on, seen)
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'summit' })
  await ui.press({ key: 'summit' })
  for (let i = 0; i < 50 && !(await ui.find({ type: 'Markdown', text: /Ship the outcome/ })); i++);
  expect(seen).toEqual(['build the QBR deck'])
  expect(await ui.find({ key: 'detail' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: /Ship the outcome/ })).toBeDefined()
  await ui.unmount()
})

test('the run button in the explanation runs it too', async ($, on) => {
  const seen: string[] = []
  setup(on, seen)
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'reverb' })
  await ui.press({ key: 'run' })
  expect(seen).toEqual(['build the QBR deck'])
  await ui.unmount()
})

test('another key moves the explanation; cancel closes it', async ($, on) => {
  const seen: string[] = []
  setup(on, seen)
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'reverb' })
  await ui.press({ key: 'deepen' })
  expect(await ui.find({ type: 'Text', text: /top professional/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /key noun/ })).toBeUndefined()
  await ui.press({ key: 'cancel' })
  expect(await ui.find({ key: 'detail' })).toBeUndefined()
  expect(seen).toEqual([])
  await ui.unmount()
})
