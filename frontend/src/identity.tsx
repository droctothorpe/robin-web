import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import NamePrompt from './components/NamePrompt'
import { getDisplayName, setDisplayName } from './lib/storage'

type Identity = {
  who: string | null
  /** Resolve with a name, prompting if none is stored. Null if the user cancels. */
  requireName: () => Promise<string | null>
  /** Open the prompt to view or change the stored name. */
  openProfile: () => void
}

const Ctx = createContext<Identity | null>(null)

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [who, setWho] = useState<string | null>(getDisplayName)
  const [prompt, setPrompt] = useState<{ resolve: (n: string | null) => void } | null>(null)

  const requireName = useCallback(
    () =>
      who ? Promise.resolve(who) : new Promise<string | null>((resolve) => setPrompt({ resolve })),
    [who],
  )
  const openProfile = useCallback(() => setPrompt({ resolve: () => undefined }), [])

  const value = useMemo(() => ({ who, requireName, openProfile }), [who, requireName, openProfile])

  return (
    <Ctx.Provider value={value}>
      {children}
      {prompt && (
        <NamePrompt
          initial={who ?? ''}
          onSubmit={(name) => {
            setDisplayName(name)
            setWho(name)
            prompt.resolve(name)
            setPrompt(null)
          }}
          onCancel={() => {
            prompt.resolve(null)
            setPrompt(null)
          }}
        />
      )}
    </Ctx.Provider>
  )
}

export function useIdentity(): Identity {
  const v = useContext(Ctx)
  if (!v) throw new Error('useIdentity outside IdentityProvider')
  return v
}
