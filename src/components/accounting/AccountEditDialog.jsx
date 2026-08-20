// Edit one account's master-list fields.
//
// Edits are stored as a patch over the imported seed record (see the
// `account_overrides` dataset in PaymentsTracker) rather than rewriting the
// list, so a future customer re-import still flows through for every field the
// user hasn't touched — and "Reset" puts a record back to as-imported.

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const FIELDS = ['name', 'territory', 'repId', 'firstName', 'lastName', 'email', 'phone', 'contactId']

const blank = (account) => {
  const out = {}
  for (const f of FIELDS) out[f] = account?.[f] ?? ''
  return out
}

export default function AccountEditDialog({
  open, onOpenChange, account, territories = [], reps = [],
  territoryRepName, isEdited, isNew = false, onSave, onReset,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Account' : 'Edit Account'}</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'Adds a shop to the master list. Invoices match to it by name, so use the name exactly as QuickBooks writes it.'
              : 'Changes are saved for everyone on the accounting portal.'}
          </DialogDescription>
        </DialogHeader>
        {open && (account || isNew) && (
          <EditForm
            key={account?.id || 'new-account'}
            account={account}
            isNew={isNew}
            territories={territories}
            reps={reps}
            territoryRepName={territoryRepName}
            isEdited={isEdited}
            onSave={onSave}
            onReset={onReset}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ account, isNew, territories, reps, territoryRepName, isEdited, onSave, onReset, onClose }) {
  const [draft, setDraft] = useState(() => blank(account))
  const [confirmReset, setConfirmReset] = useState(false)

  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }))
  const canSave = String(draft.name || '').trim().length > 0

  const save = () => {
    const patch = {}
    for (const f of FIELDS) {
      const v = typeof draft[f] === 'string' ? draft[f].trim() : draft[f]
      patch[f] = v === '' ? null : v
    }
    patch.name = String(draft.name).trim()
    onSave(patch)
    onClose()
  }

  return (
    <>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Account name</Label>
          <Input value={draft.name} onChange={set('name')} placeholder="Shop name" autoFocus />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Territory</Label>
            <select
              value={draft.territory || ''}
              onChange={set('territory')}
              className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">No territory</option>
              {territories.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Territory drives commission routing — changing it moves this account&apos;s invoices to the new territory&apos;s rep.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Rep</Label>
            <select
              value={draft.repId || ''}
              onChange={set('repId')}
              className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">
                {territoryRepName ? `Territory rep — ${territoryRepName}` : 'Territory rep'}
              </option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Labels this account with a specific rep. Commission still routes by territory — say the word and we&apos;ll wire this into the engine.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Contact first name</Label>
            <Input value={draft.firstName || ''} onChange={set('firstName')} placeholder="Shane" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Contact last name</Label>
            <Input value={draft.lastName || ''} onChange={set('lastName')} placeholder="Jackson" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input value={draft.email || ''} onChange={set('email')} type="email" placeholder="shop@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Phone</Label>
            <Input value={draft.phone || ''} onChange={set('phone')} placeholder="(555) 555-5555" />
          </div>
        </div>

        <div className="space-y-1.5 sm:max-w-[220px]">
          <Label className="text-xs">Customer ID</Label>
          <Input value={draft.contactId || ''} onChange={set('contactId')} placeholder="802" />
          <p className="text-[11px] text-muted-foreground">From QuickBooks. Changing it won&apos;t re-match invoices.</p>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        <div>
          {isEdited && !isNew && (
            confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Discard all edits?</span>
                <Button
                  variant="destructive" size="sm"
                  onClick={() => { onReset(); setConfirmReset(false); onClose() }}
                >
                  Reset
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirmReset(true)}>
                <RotateCcw className="size-3.5 mr-1" /> Reset to imported
              </Button>
            )
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave} onClick={save}>{isNew ? 'Add Account' : 'Save Changes'}</Button>
        </div>
      </DialogFooter>
    </>
  )
}
