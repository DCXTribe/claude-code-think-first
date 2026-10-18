export type Fn = 'reverb' | 'council' | 'summit' | 'deepen'

export type Card = {
  fn: Fn
  /** The prompt the person had typed when the function ran. */
  source: string
  /** Fable's reply. */
  text: string
}

export type Lane = {
  /** Billable input: uncached input plus cache writes. */
  in: number
  out: number
  /** Input the prompt cache served; shown, but kept out of Fable's share. */
  cached: number
  calls: number
}

export type Spend = {
  fable: Lane
  opus: Lane
  sonnet: Lane
  other: Lane
  /** Subagents the engine started, by the lane they run on. */
  spawns: { fable: number; opus: number; sonnet: number; other: number }
}

declare module 'claude-code' {
  interface PluginState {
    'thinkfirst-ambition': {
      card: Card | null
      busy: Fn | null
      spend: Spend
      isHidden: boolean
      showRaw: boolean
    }
  }
}
