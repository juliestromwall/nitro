# Design System Rules

**Purpose:** Guidelines for building consistent UI components using Shadcn UI.

**Component Reference:** [Shadcn UI Documentation](https://ui.shadcn.com)

---

## Spacing

Use Tailwind's default spacing scale. Never hardcode pixel values.

**Page Layout:**
| Context | Tailwind Class |
|---------|---------------|
| Page root vertical spacing | `space-y-6` |
| Page title to subtitle | `mt-2` |
| Page container padding (desktop) | `p-8` |
| Page container padding (responsive) | `px-4 sm:px-6 lg:px-8 py-8` |
| Sidebar internal padding | `p-6` |
| Nav item padding | `px-6 py-3` |

**Cards:**
| Context | Tailwind Class |
|---------|---------------|
| Card grid (standard) | `gap-6` |
| Card grid (compact/dense) | `gap-4` |
| Card internal padding | Default (don't override) |
| Card content list items | `space-y-3` |
| Card section grouping | `space-y-6` |
| Compact stat card header | `pb-2` on CardHeader |

**Card Density Hierarchy:**
When a Card is nested inside another Card, reduce its vertical padding and gap.

**Anti-pattern:** Never use `p-*` on a Card — shadcn Card uses split padding.

**Collapsible Card Pattern:**
When a Card is collapsible, the entire CardHeader must be the trigger.

```jsx
<Collapsible open={isOpen} onOpenChange={setIsOpen}>
  <Card>
    <CollapsibleTrigger asChild>
      <CardHeader className="cursor-pointer">
        <CardTitle>Section Title</CardTitle>
        <CardDescription>Description text</CardDescription>
        <CardAction>
          <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </CardAction>
      </CardHeader>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <CardContent>{/* content */}</CardContent>
    </CollapsibleContent>
  </Card>
</Collapsible>
```

**Forms:**
| Context | Tailwind Class |
|---------|---------------|
| Between form field groups | `space-y-4` |
| Label + input + helper | `space-y-2` |
| Label to input (flex/grid) | `gap-1.5` |
| Form sections | `space-y-6` |

**Inline Elements:**
| Context | Tailwind Class |
|---------|---------------|
| Icon + text | `gap-2` |
| Avatar/icon + content block | `gap-3` |
| Adjacent buttons | `gap-2` |

**Tables:**
| Context | Tailwind Class |
|---------|---------------|
| Table header cell | `py-3 px-4` |
| Table body cell | `py-4 px-4` |

**Text Spacing:**
| Context | Tailwind Class |
|---------|---------------|
| Heading to body text | `mt-2` |
| Between paragraphs | `space-y-4` |
| Section heading to content | `mb-4` |

**Self-Check Audit:**
- Page root uses `space-y-6`?
- Card grids use `gap-6` (or `gap-4` for compact)?
- Card content lists use `space-y-3`?
- Form groups use `space-y-4`, field internals use `space-y-2`?
- Inline icon+text uses `gap-2`?

---

## Component Usage

### Cards

**Parts:**
- `Card` - Main container
- `CardHeader` - Top section with title/description
- `CardTitle` - Card heading
- `CardDescription` - Subtitle text
- `CardContent` - Main content area
- `CardAction` - Action items in header (right-aligned)

**Pattern:**
```jsx
<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

### Buttons

**Variants:**
- `variant="default"` - Primary actions
- `variant="outline"` - Secondary actions
- `variant="ghost"` - Minimal actions
- `variant="destructive"` - Delete/remove actions
