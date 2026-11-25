import { useState } from 'react'
import { ApiProvider } from '../apiContext'
import { createSandbox, SAMPLE_EDIT_TOKEN, SAMPLE_VIEW_TOKEN } from '../demo/sandbox'
import { Rotation } from './RotationPage'

/** The sample rotation: the real page, backed by state that lives only in this tab. */
export default function Demo({ canEdit }: { canEdit: boolean }) {
  const [sandbox] = useState(() => createSandbox(canEdit))
  const [state, setState] = useState(sandbox.initial)
  return (
    <ApiProvider value={sandbox.api}>
      <Rotation token={canEdit ? SAMPLE_EDIT_TOKEN : SAMPLE_VIEW_TOKEN} state={state} apply={setState} demo />
    </ApiProvider>
  )
}
