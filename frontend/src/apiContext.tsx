import { createContext, useContext, type ReactNode } from 'react'
import { api } from './api'

/** Everything the rotation page needs from the server. The sample page swaps in an in-memory version. */
export type RotationApi = typeof api

const ApiContext = createContext<RotationApi>(api)

export function ApiProvider({ value, children }: { value: RotationApi; children: ReactNode }) {
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>
}

export function useApi(): RotationApi {
  return useContext(ApiContext)
}
