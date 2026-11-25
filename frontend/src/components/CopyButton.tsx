import { useState } from 'react'
import { CheckIcon } from './Icons'

export default function CopyButton({
  text,
  label = 'Copy',
  className = 'btn',
}: {
  text: string
  label?: string
  className?: string
}) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      window.setTimeout(() => setDone(false), 1500)
    } catch {
      window.prompt('Copy this link:', text)
    }
  }
  return (
    <button type="button" className={className} onClick={copy}>
      {done ? (
        <>
          <CheckIcon size={14} /> Copied
        </>
      ) : (
        label
      )}
    </button>
  )
}
