import { Button, Modal } from './ui'

export function ConfirmDialog({ open, title, body, confirmLabel = 'Delete', onConfirm, onClose }: { open: boolean; title: string; body: React.ReactNode; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button></>}>
      <p className="text-sm text-muted">{body}</p>
    </Modal>
  )
}
