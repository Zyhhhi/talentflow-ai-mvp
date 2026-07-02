import type { Candidate, CandidateStatus, ProbationStatus } from '../types/candidate'
import { loadCandidates, saveCandidates } from '../utils/storage'
import { isSupabaseConfigured, supabase } from './supabaseClient'

export type CandidateCreateInput = Omit<Candidate, 'id'>
export type CandidateUpdateInput = Partial<Omit<Candidate, 'id'>>

type CandidateRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  position: string
  source: string
  status: CandidateStatus
  is_archived: boolean
  interview_time: string | null
  interviewer: string | null
  interview_feedback: string | null
  strengths: string[] | null
  weaknesses: string[] | null
  result_note: string | null
  onboard_date: string | null
  probation_status: ProbationStatus | null
  resume_text: string | null
  resume_file_url: string | null
  resume_file_name: string | null
  resume_parsed_info: Candidate['resumeParsedInfo'] | null
  resume_imported_at?: string | null
  jd_text: string | null
  ai_stale?: boolean | null
  ai_updated_at?: string | null
  status_updated_at?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

type AiReportRow = {
  candidate_id: string
  match_score: number | null
  strengths: string[] | null
  weaknesses: string[] | null
  risks: string[] | null
  follow_up_questions: string[] | null
  next_round_recommendation: string | null
  recommended_conclusion: string | null
  raw_response: unknown
  created_at: string
}

export function canUseSupabase() {
  return Boolean(isSupabaseConfigured && supabase)
}

async function hasSupabaseSession() {
  if (!canUseSupabase()) return false
  const { data } = await supabase!.auth.getSession()
  return Boolean(data.session)
}

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `cand-${crypto.randomUUID()}`
    : `cand-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function persistLocal(candidates: Candidate[]) {
  saveCandidates(candidates)
  return candidates
}

export async function getCandidateDataMode(): Promise<'localStorage' | 'supabase'> {
  return (await hasSupabaseSession()) ? 'supabase' : 'localStorage'
}

export async function listCandidates(): Promise<Candidate[]> {
  if (!(await hasSupabaseSession())) return loadCandidates()

  try {
    const { data: rows, error } = await listCandidateRowsWithSchemaFallback()

    if (error) throw error

    const candidates = (rows ?? []).map((row) => mapCandidateFromDb(row as CandidateRow))
    const reports = await listLatestAiReports(candidates.map((candidate) => candidate.id))
    return candidates.map((candidate) => ({
      ...candidate,
      ...reports.get(candidate.id),
    }))
  } catch (error) {
    console.warn('Supabase listCandidates failed, fallback to localStorage.', error)
    return loadCandidates()
  }
}

export async function createCandidate(input: CandidateCreateInput): Promise<Candidate> {
  if (!(await hasSupabaseSession())) return createLocalCandidate(input)

  try {
    const { data: userData } = await supabase!.auth.getUser()
    const hasProfile = await ensureCurrentProfile()
    const payload = { ...mapCandidateToDb(input), created_by: hasProfile ? userData.user?.id ?? null : null }
    const { data, error } = await insertCandidateWithSchemaFallback(payload)
    if (error) throw error
    await upsertAiReport((data as CandidateRow).id, input)
    return {
      ...mapCandidateFromDb(data as CandidateRow),
      resumeParsedInfo: input.resumeParsedInfo,
      ...pickAiFields(input),
      ...pickAiMetaFields(input),
    }
  } catch (error) {
    console.error('Supabase createCandidate failed.', error)
    throw new Error(getServiceErrorMessage(error, '候选人保存到 Supabase 失败，请检查数据库字段、权限或网络后重试。'))
  }
}

export async function updateCandidate(id: string, input: CandidateUpdateInput): Promise<Candidate | null> {
  if (!(await hasSupabaseSession())) return updateLocalCandidate(id, input)

  try {
    const { data, error } = await updateCandidateWithSchemaFallback(id, mapCandidateToDb(input))
    if (error) throw error
    const candidate = mapCandidateFromDb(data as CandidateRow)
    await upsertAiReport(candidate.id, input)
    return {
      ...candidate,
      resumeParsedInfo: input.resumeParsedInfo ?? candidate.resumeParsedInfo,
      ...pickAiFields(input),
      ...pickAiMetaFields(input),
    }
  } catch (error) {
    console.error('Supabase updateCandidate failed.', error)
    throw new Error(getServiceErrorMessage(error, '候选人更新到 Supabase 失败，请检查数据库字段、权限或网络后重试。'))
  }
}

export async function archiveCandidate(id: string, isArchived = true): Promise<Candidate | null> {
  return updateCandidate(id, { isArchived })
}

export async function deleteCandidate(id: string): Promise<void> {
  if (!(await hasSupabaseSession())) {
    persistLocal(loadCandidates().filter((candidate) => candidate.id !== id))
    return
  }

  try {
    const { error } = await supabase!.from('candidates').delete().eq('id', id)
    if (error) throw error
  } catch (error) {
    console.warn('Supabase deleteCandidate failed, fallback to localStorage.', error)
    persistLocal(loadCandidates().filter((candidate) => candidate.id !== id))
  }
}

function createLocalCandidate(input: CandidateCreateInput): Candidate {
  const now = new Date().toISOString()
  const candidate: Candidate = {
    ...input,
    id: createId(),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
  persistLocal([candidate, ...loadCandidates()])
  return candidate
}

function updateLocalCandidate(id: string, input: CandidateUpdateInput): Candidate | null {
  let updatedCandidate: Candidate | null = null
  const candidates = loadCandidates().map((candidate) => {
    if (candidate.id !== id) return candidate
    updatedCandidate = {
      ...candidate,
      ...input,
      updatedAt: input.updatedAt ?? candidate.updatedAt,
    }
    return updatedCandidate
  })

  persistLocal(candidates)
  return updatedCandidate
}

async function listLatestAiReports(candidateIds: string[]) {
  const reportMap = new Map<string, Partial<Candidate>>()
  if (candidateIds.length === 0) return reportMap

  const { data, error } = await supabase!
    .from('ai_reports')
    .select('*')
    .in('candidate_id', candidateIds)
    .order('created_at', { ascending: false })

  if (error) return reportMap

  for (const report of (data ?? []) as AiReportRow[]) {
    if (reportMap.has(report.candidate_id)) continue
    reportMap.set(report.candidate_id, mapAiReportFromDb(report))
  }

  return reportMap
}

async function upsertAiReport(candidateId: string, input: CandidateUpdateInput) {
  const aiFields = pickAiReportFields(input)
  if (Object.keys(aiFields).length === 0) return

  const { error } = await supabase!.from('ai_reports').insert({
    candidate_id: candidateId,
    match_score: aiFields.matchScore ?? null,
    strengths: aiFields.strengths ?? [],
    weaknesses: aiFields.weaknesses ?? [],
    risks: aiFields.risks ?? [],
    follow_up_questions: aiFields.aiQuestions ?? [],
    next_round_recommendation: aiFields.nextRoundRecommendation ?? null,
    recommended_conclusion: aiFields.recommendedConclusion ?? null,
    raw_response: aiFields.aiRawTextResult ? { text: aiFields.aiRawTextResult } : null,
  })

  if (error) {
    console.warn('Supabase ai_reports insert failed. Candidate save is kept.', error)
  }
}

async function ensureCurrentProfile() {
  const { data } = await supabase!.auth.getUser()
  if (!data.user?.id || !data.user.email) return false

  const { error } = await supabase!.from('profiles').upsert(
    {
      id: data.user.id,
      email: data.user.email,
      role: 'hr',
      name: data.user.email.split('@')[0],
    },
    { onConflict: 'id' },
  )

  if (error) {
    console.warn('Supabase profiles upsert failed. Candidate will be saved without created_by.', error)
    return false
  }

  return true
}

export function mapCandidateFromDb(row: CandidateRow): Candidate {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? '',
    email: row.email ?? '',
    targetRole: row.position,
    source: row.source,
    status: row.status,
    isArchived: Boolean(row.is_archived),
    interviewTime: row.interview_time ?? '',
    interviewer: row.interviewer ?? '',
    interviewFeedback: row.interview_feedback ?? '',
    strengths: row.strengths ?? [],
    weaknesses: row.weaknesses ?? [],
    risks: [],
    aiQuestions: [],
    resultNote: row.result_note ?? '',
    onboardDate: row.onboard_date ?? '',
    probationStatus: row.probation_status ?? 'not_started',
    resumeText: row.resume_text ?? '',
    resumeFileName: row.resume_file_name ?? '',
    resumeImportType: row.resume_file_name ? 'file' : 'paste',
    resumeParsedInfo: row.resume_parsed_info ?? {},
    resumeImportedAt: row.resume_imported_at ?? undefined,
    jdText: row.jd_text ?? '',
    aiStale: Boolean(row.ai_stale),
    aiUpdatedAt: row.ai_updated_at ?? undefined,
    statusUpdatedAt: row.status_updated_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapCandidateToDb(input: CandidateCreateInput | CandidateUpdateInput) {
  return stripUndefined({
    name: input.name,
    position: input.targetRole,
    source: input.source,
    status: input.status,
    is_archived: input.isArchived,
    interview_time: input.interviewTime || null,
    interviewer: input.interviewer,
    interview_feedback: input.interviewFeedback,
    strengths: input.strengths,
    weaknesses: input.weaknesses,
    result_note: input.resultNote,
    onboard_date: input.onboardDate || null,
    probation_status: input.probationStatus,
    resume_text: input.resumeText,
    resume_file_name: input.resumeFileName,
    resume_imported_at: input.resumeImportedAt,
    jd_text: input.jdText,
    ai_stale: input.aiStale,
    ai_updated_at: input.aiUpdatedAt,
    status_updated_at: input.statusUpdatedAt,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  })
}

function mapAiReportFromDb(report: AiReportRow): Partial<Candidate> {
  return {
    matchScore: report.match_score ?? undefined,
    strengths: report.strengths ?? [],
    weaknesses: report.weaknesses ?? [],
    risks: report.risks ?? [],
    aiQuestions: report.follow_up_questions ?? [],
    nextRoundRecommendation: report.next_round_recommendation ?? undefined,
    recommendedConclusion: report.recommended_conclusion ?? undefined,
    aiRawTextResult: typeof report.raw_response === 'string' ? report.raw_response : '',
    aiUpdatedAt: report.created_at,
    aiStale: false,
  }
}

function pickAiReportFields(input: CandidateUpdateInput): Partial<Candidate> {
  const result: Partial<Candidate> = {}
  if (typeof input.matchScore !== 'undefined') result.matchScore = input.matchScore
  if (typeof input.strengths !== 'undefined') result.strengths = input.strengths
  if (typeof input.weaknesses !== 'undefined') result.weaknesses = input.weaknesses
  if (typeof input.risks !== 'undefined') result.risks = input.risks
  if (typeof input.aiQuestions !== 'undefined') result.aiQuestions = input.aiQuestions
  if (typeof input.nextRoundRecommendation !== 'undefined') result.nextRoundRecommendation = input.nextRoundRecommendation
  if (typeof input.recommendedConclusion !== 'undefined') result.recommendedConclusion = input.recommendedConclusion
  if (typeof input.aiRawTextResult !== 'undefined') result.aiRawTextResult = input.aiRawTextResult
  if (typeof input.aiFormatWarning !== 'undefined') result.aiFormatWarning = input.aiFormatWarning
  return result
}

function pickAiFields(input: CandidateUpdateInput): Partial<Candidate> {
  return pickAiReportFields(input)
}

function pickAiMetaFields(input: CandidateUpdateInput): Partial<Candidate> {
  const result: Partial<Candidate> = {}
  if (typeof input.aiUpdatedAt !== 'undefined') result.aiUpdatedAt = input.aiUpdatedAt
  if (typeof input.aiStale !== 'undefined') result.aiStale = input.aiStale
  return result
}

function getServiceErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    return `${fallback} 原因：${String((error as { message?: unknown }).message)}`
  }
  return fallback
}

async function insertCandidateWithSchemaFallback(payload: Record<string, unknown>) {
  const result = await supabase!.from('candidates').insert(payload).select('*').single()
  if (!isMissingSchemaCacheError(result.error)) return result

  console.warn('Retry candidates insert with minimum columns.', result.error)
  return supabase!.from('candidates').insert(stripOptionalCandidateColumns(payload)).select('*').single()
}

async function updateCandidateWithSchemaFallback(id: string, payload: Record<string, unknown>) {
  const result = await supabase!.from('candidates').update(payload).eq('id', id).select('*').single()
  if (!isMissingSchemaCacheError(result.error)) return result

  console.warn('Retry candidates update with minimum columns.', result.error)
  const legacyPayload = stripOptionalCandidateColumns(payload)
  if (Object.keys(legacyPayload).length === 0) {
    return supabase!.from('candidates').select('*').eq('id', id).single()
  }
  return supabase!.from('candidates').update(legacyPayload).eq('id', id).select('*').single()
}

async function listCandidateRowsWithSchemaFallback() {
  const result = await supabase!.from('candidates').select('*').order('updated_at', { ascending: false })
  if (!isMissingSchemaCacheError(result.error)) return result

  console.warn('Retry candidates select with known V2.0 columns.', result.error)
  return supabase!
    .from('candidates')
    .select(
      [
        'id',
        'name',
        'position',
        'source',
        'status',
        'is_archived',
        'interview_time',
        'interviewer',
        'interview_feedback',
        'strengths',
        'weaknesses',
        'result_note',
        'onboard_date',
        'probation_status',
        'resume_text',
        'resume_file_url',
        'resume_file_name',
        'jd_text',
        'created_by',
        'created_at',
        'updated_at',
      ].join(','),
    )
    .order('updated_at', { ascending: false })
}

function isMissingSchemaCacheError(error: unknown) {
  if (!error || typeof error !== 'object' || !('message' in error)) return false
  const message = String((error as { message?: unknown }).message)
  return message.includes('Could not find') || message.includes('schema cache')
}

function stripOptionalCandidateColumns(payload: Record<string, unknown>) {
  const {
    phone,
    email,
    resume_parsed_info,
    resume_imported_at,
    ai_stale,
    ai_updated_at,
    status_updated_at,
    ...legacyPayload
  } = payload
  return legacyPayload
}

function stripUndefined<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => typeof value !== 'undefined'))
}

function toMinimumCandidatePayload(payload: Record<string, unknown>) {
  return stripUndefined({
    name: payload.name,
    position: payload.position,
    source: payload.source,
    status: payload.status,
    is_archived: payload.is_archived,
    interview_time: payload.interview_time,
    interviewer: payload.interviewer,
    interview_feedback: payload.interview_feedback,
    strengths: payload.strengths,
    weaknesses: payload.weaknesses,
    result_note: payload.result_note,
    onboard_date: payload.onboard_date,
    probation_status: payload.probation_status,
    resume_text: payload.resume_text,
    resume_file_name: payload.resume_file_name,
    jd_text: payload.jd_text,
    created_by: payload.created_by,
  })
}
