import { createClient } from '@supabase/supabase-js'
import type { BracketFormat, PublicTournament, TournamentPayload, TournamentStatus } from './types'

const LOCAL_KEY = 'tourneylab:drafts'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : undefined

export const sharingEnabled = Boolean(supabase)

export function listDrafts() {
  return readDrafts().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function saveDraft(payload: TournamentPayload) {
  const drafts = readDrafts().filter((draft) => draft.id !== payload.id)
  localStorage.setItem(LOCAL_KEY, JSON.stringify([payload, ...drafts].slice(0, 30)))
}

export function loadDraft(id: string) {
  return readDrafts().find((draft) => draft.id === id)
}

export async function publishTournament(payload: TournamentPayload) {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  const editToken = randomToken()
  const editTokenHash = await sha256(editToken)
  const payloadForShare = { ...payload, editToken: undefined }
  const { data, error } = await supabase.rpc('create_tournament', {
    input_title: payload.title,
    input_format: payload.format,
    input_status: payload.status,
    input_payload: payloadForShare,
    input_edit_token_hash: editTokenHash,
  })

  if (error) throw error
  const slug = String(data)
  return {
    ...payload,
    slug,
    editToken,
  }
}

export async function updatePublishedTournament(payload: TournamentPayload) {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  if (!payload.slug || !payload.editToken) throw new Error('Missing edit link token.')
  const payloadForShare = { ...payload, editToken: undefined }
  const { error } = await supabase.rpc('update_tournament', {
    input_slug: payload.slug,
    input_edit_token: payload.editToken,
    input_status: payload.status,
    input_payload: payloadForShare,
  })
  if (error) throw error
}

export async function fetchPublicTournament(slug: string) {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  const { data, error } = await supabase.rpc('get_public_tournament', { input_slug: slug })
  if (error) throw error
  return normalizePublic(data)
}

export async function fetchEditableTournament(slug: string, token: string) {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  const { data, error } = await supabase.rpc('get_editable_tournament', {
    input_slug: slug,
    input_edit_token: token,
  })
  if (error) throw error
  const publicData = normalizePublic(data)
  return { ...publicData.payload, slug, editToken: token }
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
  const data = row as {
    slug: string
    title: string
    format: BracketFormat
    status: TournamentStatus
    payload: TournamentPayload
    updated_at?: string
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
