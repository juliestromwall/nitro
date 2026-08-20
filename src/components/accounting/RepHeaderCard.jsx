// Rep identity card on the commission ledger — avatar, editable details, and
// a running note log.
//
// The underlying rep record comes from accounting's portal list, which is
// seed data. Anything edited here is stored as an OVERRIDE in the CRM blob
// (crm_rep_profiles) rather than mutating that list, so clearing a field falls
// back to the original value instead of blanking it.
import { useState, useEffect } from 'react'
import { Pencil, Check, X, Mail, Phone, MapPin, Briefcase, StickyNote, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCrm } from '@/context/CrmContext'

const FIELDS = [
  { key: 'name', label: 'Rep name', icon: null, placeholder: 'Full name' },
  { key: 'agency', label: 'Business name', icon: Briefcase, placeholder: 'Agency / business' },
  { key: 'email', label: 'Email', icon: Mail, placeholder: 'name@example.com' },
  { key: 'phone', label: 'Phone', icon: Phone, placeholder: '(555) 555-5555' },
]

export default function RepHeaderCard({ rep, territories = [], avatarUrl }) {
  const { getRepProfile, saveRepProfile, getNotes, addNote, deleteNote, repNoteKey } = useCrm()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [noteDraft, setNoteDraft] = useState('')
  const [showNotes, setShowNotes] = useState(false)

  const override = getRepProfile(rep.id)
  const merged = { ...rep, ...override }
  const noteKey = repNoteKey(rep.id)
  const notes = getNotes(noteKey)

  useEffect(() => { setEditing(false); setNoteDraft('') }, [rep.id])

  const startEdit = () => {
    setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, merged[f.key] || ''])))
    setEditing(true)
  }
  const save = () => { saveRepProfile(rep.id, draft); setEditing(false) }

  const submitNote = () => {
    if (!noteDraft.trim()) return
    addNote(noteKey, noteDraft)
    setNoteDraft('')
    setShowNotes(true)
  }

  const initial = (merged.name || '?').charAt(0).toUpperCase()

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-[#005b5b]/[0.06] to-transparent dark:from-[#005b5b]/20 overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#005b5b] text-white flex items-center justify-center text-2xl sm:text-3xl font-bold shrink-0 shadow-md overflow-hidden ring-4 ring-white dark:ring-zinc-900">
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              : initial}
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                {FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{f.label}</span>
                    <Input
                      value={draft[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className="mt-1 h-9"
                    />
                  </label>
                ))}
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Clearing a field restores the original value from the rep list.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{merged.name}</h2>
                {merged.agency && (
                  <p className="text-base text-muted-foreground font-medium truncate">{merged.agency}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-sm">
                  {merged.email && (
                    <a href={`mailto:${merged.email}`} className="inline-flex items-center gap-1.5 text-[#005b5b] dark:text-[#00b3b3] hover:underline">
                      <Mail className="size-3.5 shrink-0" />{merged.email}
                    </a>
                  )}
                  {merged.phone && (
                    <a href={`tel:${merged.phone}`} className="inline-flex items-center gap-1.5 text-[#005b5b] dark:text-[#00b3b3] hover:underline">
                      <Phone className="size-3.5 shrink-0" />{merged.phone}
                    </a>
                  )}
                  {territories.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400">
                      <MapPin className="size-3.5 shrink-0" />{territories.join(', ')}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {editing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  <X className="size-4" />
                </Button>
                <Button size="sm" onClick={save} className="bg-[#005b5b] hover:bg-[#004848]">
                  <Check className="size-4 mr-1" />Save
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={startEdit} title="Edit rep details">
                <Pencil className="size-4" />
                <span className="ml-1 hidden sm:inline">Edit</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Notes — collapsed to a single line until there's something to say */}
      <div className="border-t border-zinc-200/70 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/40 px-5 sm:px-6 py-3">
        <div className="flex items-center gap-2">
          <StickyNote className="size-4 text-amber-500 shrink-0" />
          <Input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitNote() }}
            placeholder="Add a quick note about this rep…"
            className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
          />
          {noteDraft.trim() && (
            <Button size="sm" onClick={submitNote} className="bg-[#005b5b] hover:bg-[#004848] shrink-0">
              <Plus className="size-4 mr-1" />Add
            </Button>
          )}
          {notes.length > 0 && !noteDraft.trim() && (
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
            >
              {notes.length} note{notes.length === 1 ? '' : 's'}
            </button>
          )}
        </div>

        {showNotes && notes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="group flex items-start gap-2 text-sm rounded-lg bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2">
                <span className="flex-1 min-w-0 whitespace-pre-wrap break-words">{n.body}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">
                  {new Date(n.createdAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => deleteNote(noteKey, n.id)}
                  className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 shrink-0 transition-opacity"
                  title="Delete note"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
