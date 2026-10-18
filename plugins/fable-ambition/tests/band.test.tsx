import { test, expect } from 'claude-code/testing'

const BAND = {
  plugin: 'fable-ambition',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { top: 0, bodyRows: 20 },
    view: {},
  },
} as const

// Stands in for the engine beneath the plugins, which draws nothing here.
const engineBand = (on: any) =>
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-empty" />
  })

test('the band draws the four functions and a zero meter on each surface', async ($, on) => {
  engineBand(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    for (const key of ['reverb', 'council', 'summit', 'deepen']) {
      expect(await ui.find({ key })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /Fable 0%/ })).toBeDefined()
    await ui.unmount()
  }
})

test('more/less toggles the raw token row', async ($, on) => {
  engineBand(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /spawns/ })).toBeDefined()
  await ui.press({ key: 'raw' })
  expect(await ui.find({ type: 'Text', text: /total 0/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /spawns/ })).toBeUndefined()
  await ui.unmount()
})

test('hide yields the band to the engine', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ key: 'reverb' })).toBeUndefined()
  await ui.unmount()
})

test('the band yields while a survey holds it', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ key: 'reverb' })).toBeUndefined()
  await ui.unmount()
})
