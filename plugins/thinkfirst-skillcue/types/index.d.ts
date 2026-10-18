export type Suggestion = {
  skill: string
  reason: string
}

declare module 'claude-code' {
  interface PluginState {
    'thinkfirst-skillcue': { nudge: Suggestion | null; paused: boolean }
  }
}
