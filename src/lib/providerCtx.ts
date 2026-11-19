import { useSettings } from '../store/settings'
import { providers } from '../providers/registry'
import type { MusicProvider, ProviderContext } from '../providers/types'

export function providerContext(signal?: AbortSignal): ProviderContext {
  const s = useSettings.getState()
  return {
    signal,
    settings: { jamendoClientId: s.jamendoClientId.trim() || undefined, jamendoFormat: s.jamendoFormat, archiveFormat: s.archiveFormat },
  }
}

/** Providers the user has enabled that are also usable (e.g. Jamendo needs a client ID). */
export function activeProviders(): MusicProvider[] {
  const s = useSettings.getState()
  const ctx = providerContext()
  return providers.filter((p) => s.providers[p.id] !== false && p.isConfigured(ctx.settings))
}
