import type { BracketFormat, PublicTournament, TournamentPayload, TournamentStatus } from './types'

const LOCAL_KEY = 'tourneylab:drafts'
const googleAppsScriptUrl = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL as string | undefined

export const sharingEnabled = Boolean(googleAppsScriptUrl)
export const storageLabel = googleAppsScriptUrl ? 'database' : 'local storage'

export function listDrafts() {
  return readDrafts().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function saveDraft(payload: TournamentPayload) {
  const drafts = readDrafts().filter((draft) => draft.id !== payload.id)
  localStorage.setItem(LOCAL_KEY, JSON.stringify([payload, ...drafts].slice(0, 30)))
}

export function deleteDraft(id: string) {
  const drafts = readDrafts().filter((draft) => draft.id !== id)
  localStorage.setItem(LOCAL_KEY, JSON.stringify(drafts))
}

export function loadDraft(id: string) {
  return readDrafts().find((draft) => draft.id === id)
}

export async function publishTournament(payload: TournamentPayload) {
  return publishViaGoogleSheets(payload)
}

export async function updatePublishedTournament(payload: TournamentPayload) {
  return updateViaGoogleSheets(payload)
}

export async function deletePublishedTournament(payload: TournamentPayload) {
  return deleteViaGoogleSheets(payload)
}

export async function fetchPublicTournament(slug: string) {
  return fetchViaGoogleSheets(slug)
}

export async function fetchEditableTournament(slug: string, token: string) {
  const publicData = await fetchViaGoogleSheets(slug)
  return { ...publicData.payload, slug, editToken: token }
}

async function publishViaGoogleSheets(payload: TournamentPayload) {
  const editToken = randomToken()
  const editTokenHash = await sha256(editToken)
  const result = await callGoogleSheetApi<{ slug: string }>('create', {
    title: payload.title,
    format: payload.format,
    status: payload.status,
    payload: { ...payload, editToken: undefined },
    editTokenHash,
  })

  return {
    ...payload,
    slug: result.slug,
    editToken,
  }
}

async function updateViaGoogleSheets(payload: TournamentPayload) {
  if (!payload.slug || !payload.editToken) throw new Error('Missing edit link token.')
  const result = await callGoogleSheetApi<{ ok: boolean }>('update', {
    slug: payload.slug,
    editToken: payload.editToken,
    status: payload.status,
    payload: { ...payload, editToken: undefined },
  })
  if (!result.ok) throw new Error('The edit link is not valid for this tournament.')
}

async function deleteViaGoogleSheets(payload: TournamentPayload) {
  if (!payload.slug || !payload.editToken) throw new Error('Missing edit link token.')
  try {
    const result = await callGoogleSheetApi<{ ok: boolean }>('delete', {
      slug: payload.slug,
      editToken: payload.editToken,
    })
    if (!result.ok) throw new Error('The edit link is not valid for this tournament.')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('Unknown action')) throw error
    await softDeleteViaGoogleSheets(payload)
  }
}

async function fetchViaGoogleSheets(slug: string) {
  const result = await callGoogleSheetApi<PublicTournament>('get', { slug })
  return normalizePublic(result)
}

async function softDeleteViaGoogleSheets(payload: TournamentPayload) {
  if (!payload.slug || !payload.editToken) throw new Error('Missing edit link token.')
  await callGoogleSheetApi<{ ok: boolean }>('update', {
    slug: payload.slug,
    editToken: payload.editToken,
    status: 'deleted',
    payload: {
      ...payload,
      title: 'Deleted bracket',
      status: 'deleted',
      participants: [],
      matches: [],
      editToken: undefined,
      updatedAt: new Date().toISOString(),
    },
  })
}

async function callGoogleSheetApi<T>(action: string, body: Record<string, unknown>) {
  if (!googleAppsScriptUrl) throw new Error('Google Sheets is not configured yet.')
  const response = await fetch(googleAppsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body }),
  })
  const data = (await response.json()) as { ok?: boolean; error?: string } & T
  if (!response.ok || data.ok === false) throw new Error(data.error ?? 'Google Sheets request failed.')
  return data
}

export function shareUrls(payload: TournamentPayload) {
  const origin = window.location.origin
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
  const root = `${origin}${basePath}`
  return {
    publicUrl: payload.slug ? `${root}/#/t/${payload.slug}` : '',
    editUrl: payload.slug && payload.editToken ? `${root}/#/edit/${payload.slug}?token=${payload.editToken}` : '',
  }
}

function readDrafts(): TournamentPayload[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as TournamentPayload[]) : []
  } catch {
    return []
  }
}

function normalizePublic(value: unknown): PublicTournament {
  const row = Array.isArray(value) ? value[0] : value
  if (!row) throw new Error('Tournament not found.')
  const data = row as {
    slug: string
    title: string
    format: BracketFormat
    status: TournamentStatus
    payload: TournamentPayload
    updated_at?: string
  }
  if (data.status === 'deleted' || data.payload?.status === 'deleted') {
    throw new Error('Tournament not found.')
  }
  return {
    slug: data.slug,
    title: data.title,
    format: data.format,
    status: data.status,
    payload: data.payload,
    updated_at: data.updated_at,
  }
}

function randomToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
