import { test, expect } from 'claude-code/testing'

const BAND = {
  plugin: 'thinkfirst-ambition',
  component: 'AbovePrompt',
  surface: 'terminal',
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

const USAGE = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const SPAWN = {
  tool_use_id: 'toolu_1',
  prompt: 'do the thing',
  description: 'thing',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  background: false,
  fork: false,
} as const

const command = ($: any, args: string) =>
  $.command.run({
    command: 'ambition',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

// The test's own hooks sit beneath the plugin: these answer for the engine.
const fakeFable = (on: any, seen: string[], text = 'Ship the outcome.') =>
  on('model.complete', (_$: any, e: any) => {
    seen.push(e.prompt)
    return { value: { isAnswered: true, text, usage: USAGE } }
  })

const startedAs = (on: any, models: (string | undefined)[]) =>
  on('agent.spawn', (_$: any, e: any) => {
    models.push(e.model)
    return { model: e.model ?? e.parentModel, agentId: `a${models.length}` }
  })

test('a subagent that names Fable is moved to Opus', async ($, on) => {
  const models: (string | undefined)[] = []
  startedAs(on, models)
  await $.agent.spawn({ ...SPAWN, model: 'fable', parentModel: 'claude-opus-5-5' })
  expect(models).toEqual(['opus'])
})

test('a subagent that names no model under a Fable parent is moved to Opus', async ($, on) => {
  const models: (string | undefined)[] = []
  startedAs(on, models)
  await $.agent.spawn({ ...SPAWN, parentModel: 'claude-fable-5-1' })
  expect(models).toEqual(['opus'])
})

test('Sonnet and Opus spawns, and forks, keep their model', async ($, on) => {
  const models: (string | undefined)[] = []
  startedAs(on, models)
  await $.agent.spawn({ ...SPAWN, model: 'sonnet', parentModel: 'claude-fable-5-1' })
  await $.agent.spawn({ ...SPAWN, parentModel: 'claude-opus-5-5' })
  await $.agent.spawn({ ...SPAWN, fork: true, subagentType: 'fork', parentModel: 'claude-fable-5-1' })
  expect(models).toEqual(['sonnet', undefined, undefined])
})

test('spawns are counted by the model they actually run on', async ($, on) => {
  engineBand(on)
  startedAs(on, [])
  await $.agent.spawn({ ...SPAWN, parentModel: 'claude-fable-5-1' })
  await $.agent.spawn({ ...SPAWN, model: 'sonnet', parentModel: 'claude-opus-5-5' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /spawns o1\/s1/ })).toBeDefined()
  await ui.unmount()
})

test('/ambition <fn> <task> runs Fable on the task given with the command', async ($, on) => {
  engineBand(on)
  const seen: string[] = []
  fakeFable(on, seen)
  const r = await command($, 'Summit build the QBR deck')
  expect(r.text).toMatch(/Summit running/)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Markdown', text: /Ship the outcome/ })).toBeDefined()
  await ui.unmount()
  expect(seen).toEqual(['build the QBR deck'])
})

test('/ambition <fn> with no task says how to give one and calls nothing', async ($, on) => {
  const seen: string[] = []
  fakeFable(on, seen)
  const r = await command($, 'deepen')
  expect(r.text).toMatch(/Usage: \/ambition deepen <task>/)
  expect(seen).toEqual([])
})

test('a second press while Fable thinks makes no second call', async ($, on) => {
  engineBand(on)
  const seen: string[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  on('model.complete', async (_$: any, e: any) => {
    seen.push(e.prompt)
    await gate
    return { value: { isAnswered: true, text: 'one', usage: USAGE } }
  })
  const a = command($, 'reverb first task')
  const b = command($, 'council second task')
  const [ra, rb] = await Promise.all([a, b])
  expect(ra.text).toMatch(/Reverb running/)
  expect(rb.text).toMatch(/already thinking/)
  release()
  expect(seen).toEqual(['first task'])
  // Let the first call land before the test ends: the band shows Fable idle again.
  for (let i = 0; i < 50; i++) {
    const ui = await $.ui.mount(BAND)
    const idle = await ui.find({ type: 'Text', text: /○ Fable$/ })
    await ui.unmount()
    if (idle) break
  }
})

test('append keeps the draft as it is now; replace swaps it', async ($, on) => {
  engineBand(on)
  const box = { text: '' }
  on('prompt.fill', (_$: any, e: any) => {
    box.text = e.mode === 'append' ? box.text + e.text : e.text
    return { isFilled: true }
  })
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  fakeFable(on, [], 'Goal beyond the goal: decide.')
  await command($, 'summit old draft')

  box.text = 'edited draft'
  const ui = await $.ui.mount(BAND)
  await ui.press({ key: 'append' })
  expect(box.text).toBe('edited draft\n\n[Summit]\nGoal beyond the goal: decide.')
  await ui.unmount()

  await command($, 'summit again')
  const ui2 = await $.ui.mount(BAND)
  await ui2.press({ key: 'use' })
  expect(box.text).toBe('[Summit]\nGoal beyond the goal: decide.')
  await ui2.unmount()
})

test('cache reads are shown but kept out of Fable’s share', async ($, on) => {
  engineBand(on)
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer, usage: e.usage }))
  const turn = { answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
  await $.turn.complete({ ...turn, usage: { ...USAGE, input_tokens: 0, output_tokens: 100, model: 'claude-fable-5-1' } })
  await $.turn.complete({
    ...turn,
    usage: { input_tokens: 0, output_tokens: 100, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' },
  })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /Fable 50%/ })).toBeDefined()
  await ui.press({ key: 'raw' })
  expect(await ui.find({ type: 'Text', text: /cache reads 1000k/ })).toBeDefined()
  await ui.unmount()
})

test('another plugin\u2019s band beneath is drawn under this one, not hidden', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="other">other band</Text>
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ key: 'reverb' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
    await ui.unmount()
  }
})
