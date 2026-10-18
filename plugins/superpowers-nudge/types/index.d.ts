export type Suggestion = {
  skill: string
  reason: string
}

declare module 'claude-code' {
  interface PluginState {
    'superpowers-nudge': { nudge: Suggestion | null; paused: boolean }
  }
}
