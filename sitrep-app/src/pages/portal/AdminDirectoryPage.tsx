import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiJson } from '../../lib/api'

type Office = {
  id: number
  level: string
  name: string
  code: string | null
  parentId: number | null
  stateId: number | null
  stateName: string | null
  address: string | null
  officePhone: string | null
  officeEmail: string | null
  oicRank: string | null
  oicName: string | null
  oicPhone: string | null
  oicEmail: string | null
  isActive: boolean
  sortOrder: number
  childCount: number
}
type State = { id: number; name: string }
type FormValues = Omit<Office, 'id' | 'stateName' | 'childCount'> & { id?: number }
type ImportPreview = { rows: { rowNumber: number; level: string; name: string; code: string | null; action: string; error: string | null }[]; errors: { rowNumber: number; error: string }[]; created: number; updated: number }

const LEVEL_LABELS: Record<string, string> = {
  force_hq: 'Force Headquarters',
  zonal: 'Zonal Command',
  state: 'State Command',
  division: 'Divisional HQ',
  station: 'Police Station',
}
const CHILD_LEVEL: Record<string, string> = {
  force_hq: 'zonal',
  zonal: 'state',
  state: 'division',
  division: 'station',
}
const blankForm = (level: string, parentId: number | null): FormValues => ({
  level, name: '', code: '', parentId, stateId: null, address: '', officePhone: '', officeEmail: '',
  oicRank: '', oicName: '', oicPhone: '', oicEmail: '', isActive: true, sortOrder: 0,
})

export function AdminDirectoryPage() {
  const queryClient = useQueryClient()
  const [path, setPath] = useState<Office[]>([])
  const [editing, setEditing] = useState<FormValues | null>(null)
  const [formError, setFormError] = useState('')
  const [csvText, setCsvText] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importError, setImportError] = useState('')
  const parent = path[path.length - 1]

  const officesQuery = useQuery({
    queryKey: ['admin-directory-offices', parent?.id ?? null],
    queryFn: () => apiJson<{ offices: Office[] }>(
      parent ? `/api/admin/directory/offices?parentId=${parent.id}` : '/api/admin/directory/offices',
    ),
  })
  const statesQuery = useQuery({
    queryKey: ['admin-directory-states'],
    queryFn: () => apiJson<{ states: State[] }>('/api/geography/states'),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-directory-offices'] })
  }
  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => apiJson<{ office: Office }>(
      values.id ? `/api/admin/directory/offices/${values.id}` : '/api/admin/directory/offices',
      { method: values.id ? 'PATCH' : 'POST', body: JSON.stringify(values) },
    ),
    onSuccess: async () => {
      await refresh()
      setEditing(null)
      setFormError('')
    },
    onError: (error) => setFormError((error as Error).message),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiJson(`/api/admin/directory/offices/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh()
      setEditing(null)
      setFormError('')
    },
    onError: (error) => setFormError((error as Error).message),
  })
  const previewMutation = useMutation({
    mutationFn: () => apiJson<ImportPreview>('/api/admin/directory/import?dryRun=1', {
      method: 'POST', body: JSON.stringify({ csv: csvText }),
    }),
    onSuccess: (preview) => {
      setImportPreview(preview)
      setImportError('')
    },
    onError: (error) => setImportError((error as Error).message),
  })
  const importMutation = useMutation({
    mutationFn: () => apiJson<ImportPreview>('/api/admin/directory/import', {
      method: 'POST', body: JSON.stringify({ csv: csvText }),
    }),
    onSuccess: async (result) => {
      setImportPreview(result)
      setImportError('')
      await refresh()
    },
    onError: (error) => setImportError((error as Error).message),
  })

  const openCreate = () => {
    if (!parent || !CHILD_LEVEL[parent.level]) return
    setFormError('')
    setEditing(blankForm(CHILD_LEVEL[parent.level], parent.id))
  }
  const openEdit = (office: Office) => {
    setFormError('')
    setEditing({ ...office })
  }
  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editing) saveMutation.mutate(editing)
  }
  const updateField = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (!editing) return
    const { name, value } = event.target
    const nextValue = event.target instanceof HTMLInputElement && event.target.type === 'checkbox' ? event.target.checked : value
    setEditing({ ...editing, [name]: name === 'stateId' ? value ? Number(value) : null : nextValue } as FormValues)
  }
  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCsvText(await file.text())
    setImportPreview(null)
    setImportError('')
  }
  const downloadTemplate = async () => {
    const response = await apiFetch('/api/admin/directory/template.csv')
    if (!response.ok) {
      setImportError('Could not download the template')
      return
    }
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = 'command-directory-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  const navigatePath = (index: number) => setPath(path.slice(0, index + 1))
  const offices = officesQuery.data?.offices ?? []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-(--font-syne) text-2xl font-bold text-[var(--portal-fg)]">Command Directory</h1>
          <p className="mt-1 text-sm text-[var(--portal-muted)]">Manage Force HQ, commands, divisional HQs and police stations.</p>
        </div>
        {parent && CHILD_LEVEL[parent.level] ? (
          <button type="button" onClick={openCreate} className="rounded-lg bg-[#00c46a] px-4 py-2 text-sm font-semibold text-[#04251f]">
            Add {LEVEL_LABELS[CHILD_LEVEL[parent.level]]}
          </button>
        ) : null}
      </header>

      <nav className="flex flex-wrap items-center gap-2 text-xs text-[var(--portal-muted)]" aria-label="Directory breadcrumb">
        <button type="button" onClick={() => setPath([])} className="hover:text-[#00c46a]">Force HQ</button>
        {path.map((office, index) => (
          <span key={office.id} className="inline-flex items-center gap-2">
            <span aria-hidden>/</span>
            <button type="button" onClick={() => navigatePath(index)} className="hover:text-[#00c46a]">{office.name}</button>
          </span>
        ))}
      </nav>

      {officesQuery.isError ? <p role="alert" className="text-sm text-red-400">{(officesQuery.error as Error).message}</p> : null}
      {officesQuery.isLoading ? <p className="text-sm text-[var(--portal-muted)]">Loading offices…</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {offices.map((office) => (
          <article key={office.id} className="sr-card flex items-start justify-between gap-3 p-4">
            <button
              type="button"
              onClick={() => setPath([...path, office])}
              className="min-w-0 flex-1 text-left"
            >
              <span className="font-(--font-mono) text-[9px] uppercase tracking-wider text-[#00c46a]">{LEVEL_LABELS[office.level]}</span>
              <h2 className="mt-1 break-words font-semibold text-[var(--portal-fg)]">{office.name}</h2>
              <p className="mt-1 text-xs text-[var(--portal-muted)]">
                {office.code || 'No code'} · {office.childCount} {office.childCount === 1 ? 'child office' : 'child offices'}
              </p>
              {!office.isActive ? <span className="mt-2 inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">Inactive</span> : null}
            </button>
            <button type="button" onClick={() => openEdit(office)} className="rounded-lg border border-[color:var(--portal-border)] px-3 py-1.5 text-xs text-[var(--portal-muted)] hover:text-[var(--portal-fg)]">
              Edit
            </button>
          </article>
        ))}
      </div>
      {!officesQuery.isLoading && !offices.length ? (
        <p className="sr-card p-5 text-sm text-[var(--portal-muted)]">No offices at this level yet.</p>
      ) : null}

      {editing ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/55" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditing(null)
        }}>
          <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-[color:var(--portal-border)] bg-[color:var(--sr-app-bg)] p-5 shadow-2xl md:p-7" aria-label="Office editor">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-(--font-mono) text-[9px] uppercase tracking-wider text-[#00c46a]">{LEVEL_LABELS[editing.level]}</p>
                <h2 className="mt-1 text-xl font-bold text-[var(--portal-fg)]">{editing.id ? 'Edit office' : 'Create office'}</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close editor" className="text-xl text-[var(--portal-muted)]">×</button>
            </div>
            <form className="mt-6 space-y-4" onSubmit={submitForm}>
              <label className="block text-xs text-[var(--portal-muted)]">Office name
                <input required maxLength={200} name="name" value={editing.name} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
              </label>
              <label className="block text-xs text-[var(--portal-muted)]">Code
                <input maxLength={32} name="code" value={editing.code ?? ''} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
              </label>
              {editing.level === 'state' ? (
                <label className="block text-xs text-[var(--portal-muted)]">State
                  <select required name="stateId" value={editing.stateId ?? ''} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--sr-app-bg)] px-3 py-2 text-sm text-[var(--portal-fg)]">
                    <option value="">Select a state</option>
                    {(statesQuery.data?.states ?? []).map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="block text-xs text-[var(--portal-muted)]">Address
                <textarea name="address" value={editing.address ?? ''} onChange={updateField} rows={2} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs text-[var(--portal-muted)]">Office phone
                  <input name="officePhone" value={editing.officePhone ?? ''} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
                </label>
                <label className="block text-xs text-[var(--portal-muted)]">Office email
                  <input name="officeEmail" value={editing.officeEmail ?? ''} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
                </label>
                <label className="block text-xs text-[var(--portal-muted)]">OIC rank
                  <input name="oicRank" value={editing.oicRank ?? ''} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
                </label>
                <label className="block text-xs text-[var(--portal-muted)]">OIC name
                  <input name="oicName" value={editing.oicName ?? ''} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
                </label>
                <label className="block text-xs text-[var(--portal-muted)]">OIC personal phone
                  <input name="oicPhone" value={editing.oicPhone ?? ''} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
                </label>
                <label className="block text-xs text-[var(--portal-muted)]">OIC personal email
                  <input name="oicEmail" value={editing.oicEmail ?? ''} onChange={updateField} className="mt-1 w-full rounded-lg border border-[color:var(--portal-border)] bg-transparent px-3 py-2 text-sm text-[var(--portal-fg)]" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-[var(--portal-muted)]">
                <input type="checkbox" name="isActive" checked={editing.isActive} onChange={updateField} /> Active
              </label>
              {formError ? <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{formError}</p> : null}
              <div className="flex flex-wrap justify-between gap-3 pt-2">
                {editing.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete ${editing.name}?`)) deleteMutation.mutate(editing.id!)
                    }}
                    disabled={deleteMutation.isPending}
                    className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400"
                  >
                    Delete
                  </button>
                ) : <span />}
                <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-[#00c46a] px-4 py-2 text-sm font-semibold text-[#04251f]">
                  {saveMutation.isPending ? 'Saving…' : 'Save office'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      <section className="sr-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--portal-fg)]">CSV import</h2>
            <p className="mt-1 text-xs text-[var(--portal-muted)]">Preview all rows before importing. Imports are all-or-nothing.</p>
          </div>
          <button type="button" onClick={() => void downloadTemplate()} className="text-xs text-[#00c46a] hover:underline">Download CSV template</button>
        </div>
        <input type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event)} className="mt-4 block w-full text-sm text-[var(--portal-muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[color:var(--portal-table-row-hover)] file:px-3 file:py-2 file:text-xs file:text-[var(--portal-fg)]" />
        {csvText ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} className="rounded-lg border border-[color:var(--portal-border)] px-3 py-2 text-xs text-[var(--portal-fg)]">
              {previewMutation.isPending ? 'Checking…' : 'Preview import'}
            </button>
            {importPreview && !importPreview.errors.length ? (
              <button type="button" onClick={() => importMutation.mutate()} disabled={importMutation.isPending} className="rounded-lg bg-[#00c46a] px-3 py-2 text-xs font-semibold text-[#04251f]">
                {importMutation.isPending ? 'Importing…' : `Import ${importPreview.created + importPreview.updated} rows`}
              </button>
            ) : null}
          </div>
        ) : null}
        {importError ? <p role="alert" className="mt-3 text-sm text-red-400">{importError}</p> : null}
        {importPreview ? (
          <div className="mt-4">
            <p className="mb-3 text-xs text-[var(--portal-muted)]">Will create {importPreview.created} and update {importPreview.updated} offices. {importPreview.errors.length} row errors.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="text-[var(--portal-dim)]"><tr><th className="p-2">Row</th><th className="p-2">Level</th><th className="p-2">Office</th><th className="p-2">Action</th><th className="p-2">Error</th></tr></thead>
                <tbody>
                  {importPreview.rows.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-[color:var(--portal-border)]">
                      <td className="p-2">{row.rowNumber}</td>
                      <td className="p-2">{LEVEL_LABELS[row.level] ?? row.level}</td>
                      <td className="p-2">{row.name} {row.code ? `(${row.code})` : ''}</td>
                      <td className="p-2">{row.action}</td>
                      <td className="p-2 text-red-400">{row.error || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
