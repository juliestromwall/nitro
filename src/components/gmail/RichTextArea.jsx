// Minimal rich-text body for the compose window.
//
// Built on contentEditable + document.execCommand rather than pulling in an
// editor framework — abc-surrogacy's compose leans on ~12 TipTap packages,
// which is a lot of dependency for bold/italic/lists in an email box.
// execCommand is formally deprecated but is implemented everywhere and is
// still what the browser gives you for free.

import { useCallback, useEffect, useRef } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link as LinkIcon,
  Undo, Redo, RemoveFormatting,
} from 'lucide-react'

function ToolButton({ icon: Icon, label, onClick }) {
  // preventDefault on mousedown keeps the caret in the editor when a button is hit
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="size-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {Icon ? <Icon className="size-4" /> : null}
    </button>
  )
}

export default function RichTextArea({ value, onChange, placeholder, autoFocus }) {
  const ref = useRef(null)

  // Only write into the DOM when the incoming value genuinely differs, or
  // every keystroke would reset the caret to the start of the box.
  useEffect(() => {
    const el = ref.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
  }, [value])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const exec = useCallback((command, arg) => {
    document.execCommand(command, false, arg)
    ref.current?.focus()
    onChange(ref.current?.innerHTML || '')
  }, [onChange])

  const addLink = useCallback(() => {
    const url = window.prompt('Link URL')
    if (!url) return
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`
    exec('createLink', safe)
  }, [exec])

  const isEmpty = !value || value === '<br>' || value === '<p></p>'

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="relative flex-1 min-h-0 overflow-y-auto">
        {isEmpty && placeholder && (
          <div className="absolute left-4 top-3 text-sm text-muted-foreground pointer-events-none">
            {placeholder}
          </div>
        )}
        {/* Paste is forced to plain text so copied web content doesn't drag in styling. */}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          onInput={(e) => onChange(e.currentTarget.innerHTML)}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, text)
          }}
          className="min-h-full px-4 py-3 text-sm outline-none [&_a]:text-[#005b5b] [&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5"
        />
      </div>

      <div className="flex items-center gap-0.5 px-2 py-1.5 border-t flex-wrap">
        <ToolButton icon={Bold}          label="Bold"          onClick={() => exec('bold')} />
        <ToolButton icon={Italic}        label="Italic"        onClick={() => exec('italic')} />
        <ToolButton icon={Underline}     label="Underline"     onClick={() => exec('underline')} />
        <ToolButton icon={Strikethrough} label="Strikethrough" onClick={() => exec('strikeThrough')} />
        <span className="w-px h-5 bg-border mx-1" />
        <ToolButton icon={List}        label="Bulleted list" onClick={() => exec('insertUnorderedList')} />
        <ToolButton icon={ListOrdered} label="Numbered list" onClick={() => exec('insertOrderedList')} />
        <ToolButton icon={LinkIcon}    label="Insert link"   onClick={addLink} />
        <span className="w-px h-5 bg-border mx-1" />
        <ToolButton icon={Undo} label="Undo" onClick={() => exec('undo')} />
        <ToolButton icon={Redo} label="Redo" onClick={() => exec('redo')} />
        <ToolButton icon={RemoveFormatting} label="Clear formatting" onClick={() => exec('removeFormat')} />
      </div>
    </div>
  )
}
