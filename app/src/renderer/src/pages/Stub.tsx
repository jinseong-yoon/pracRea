import type { ReactNode } from 'react'

export function Stub({ title }: { title: string }): ReactNode {
  return (
    <>
      <div className="page-head">
        <h1>{title}</h1>
      </div>
      <div className="empty card">Not implemented yet.</div>
    </>
  )
}
