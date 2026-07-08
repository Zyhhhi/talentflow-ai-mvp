import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { AiSettings } from './types/ai'
import type { AgentRun, AgentWorkflowType, RagResult } from './types/agent'
import { agentConfidenceLabels, agentRecommendationLabels, agentWorkflowLabels } from './types/agent'
import type { Candidate, CandidateDraft, CandidateStatus, ProbationStatus } from './types/candidate'
import { probationLabels, statusLabels } from './types/candidate'
import type { KnowledgeDocument, KnowledgeDocumentType, RagQuery } from './types/knowledge'
import { knowledgeDocumentTypeLabels } from './types/knowledge'
import { agentDemoCandidates, agentDemoKnowledgeDocuments } from './data/agentDemoData'
import {
  clearStoredAgentRecords,
  loadAgentRuns,
  loadAiSettings,
  loadCandidates,
  loadKnowledgeDocuments,
  loadLastActiveAgentRunId,
  saveAgentRuns,
  saveAiSettings,
  saveKnowledgeDocuments,
  saveLastActiveAgentRunId,
} from './utils/storage'
import { analyzeCandidateWithSettings } from './utils/realAi'
import { cleanPosition, extractResumeInfo, getExtractedFieldLabels } from './utils/resumeExtractor'
import { cleanResumeText, parseResumeFile } from './utils/resumeParser'
import { createKnowledgeDocument, queryKnowledgeBase, RAG_SYSTEM_PROMPT } from './utils/knowledgeRag'
import { runRecruitingAgent } from './utils/recruitingAgent'
import { formatDateTime } from './utils/date'
import {
  createCandidate as createCandidateRecord,
  deleteCandidate as deleteCandidateRecord,
  getCandidateDataMode,
  listCandidates,
  updateCandidate as updateCandidateRecord,
} from './services/candidateService'
import { isSupabaseConfigured, supabase } from './services/supabaseClient'
import {
  getFunnelAnalytics,
  getAgentAnalytics,
  getOverview,
  getPeriodAnalytics,
  getRoleAnalytics,
  getSourceAnalytics,
} from './utils/analytics'

type ViewKey = 'dashboard' | 'candidates' | 'pipeline' | 'ai' | 'agent' | 'analytics' | 'knowledge' | 'notes'
type StatusFilter = CandidateStatus | 'all' | 'archived'
type ProbationFilter = ProbationStatus | 'all'
type ArchiveFilter = 'all' | 'active' | 'archived'

const navigation: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: '工作台', icon: '⌂' },
  { key: 'candidates', label: '候选人库', icon: '▦' },
  { key: 'pipeline', label: '面试流程', icon: '↳' },
  { key: 'ai', label: 'AI 分析', icon: '✦' },
  { key: 'agent', label: '招聘分析 Agent', icon: '◆' },
  { key: 'analytics', label: '数据看板', icon: '◫' },
  { key: 'knowledge', label: '招聘知识库', icon: '◎' },
  { key: 'notes', label: 'MVP 说明', icon: 'i' },
]

const emptyDraft: CandidateDraft = {
  name: '',
  phone: '',
  email: '',
  targetRole: 'AI 产品经理',
  resumeText: '',
  resumeFileName: '',
  resumeImportType: 'paste',
  resumeParsedInfo: {},
  jdText: '',
  source: 'Boss 直聘',
  interviewer: '',
  interviewTime: '',
  status: 'new',
  interviewFeedback: '',
  resultNote: '',
  onboardDate: '',
  probationStatus: 'not_started',
  isArchived: false,
}

function App() {
  const [candidates, setCandidates] = useState<Candidate[]>(() => (isSupabaseConfigured ? [] : loadCandidates()))
  const [session, setSession] = useState<Session | null>(null)
  const [isAuthReady, setIsAuthReady] = useState(!isSupabaseConfigured)
  const [isDataReady, setIsDataReady] = useState(!isSupabaseConfigured)
  const [dataMode, setDataMode] = useState<'localStorage' | 'supabase'>(isSupabaseConfigured ? 'supabase' : 'localStorage')
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('全部岗位')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState('全部来源')
  const [probationFilter, setProbationFilter] = useState<ProbationFilter>('all')
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('all')
  const [editing, setEditing] = useState<Candidate | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings())
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>(() => loadKnowledgeDocuments())
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>(() => loadAgentRuns())
  const [lastActiveAgentRunId, setLastActiveAgentRunId] = useState(() => loadLastActiveAgentRunId())
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [operationError, setOperationError] = useState('')

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0]
  const overview = useMemo(() => getOverview(candidates), [candidates])
  const roleAnalytics = useMemo(() => getRoleAnalytics(candidates), [candidates])
  const funnelAnalytics = useMemo(() => getFunnelAnalytics(candidates), [candidates])
  const sourceAnalytics = useMemo(() => getSourceAnalytics(candidates), [candidates])
  const weeklyAnalytics = useMemo(() => getPeriodAnalytics(candidates, 'week'), [candidates])
  const monthlyAnalytics = useMemo(() => getPeriodAnalytics(candidates, 'month'), [candidates])
  const agentAnalytics = useMemo(() => getAgentAnalytics(agentRuns, candidates), [agentRuns, candidates])
  const roles = useMemo(() => ['全部岗位', ...Array.from(new Set(candidates.map((candidate) => candidate.targetRole)))], [candidates])
  const sources = useMemo(() => ['全部来源', ...Array.from(new Set(candidates.map((candidate) => candidate.source)))], [candidates])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setIsAuthReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsAuthReady(true)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isSupabaseConfigured && !session) return
    refreshCandidates()
  }, [session])

  async function refreshCandidates() {
    setIsDataReady(false)
    const nextCandidates = await listCandidates()
    setCandidates(nextCandidates)
    setDataMode(await getCandidateDataMode())
    if (!nextCandidates.some((candidate) => candidate.id === selectedId)) {
      setSelectedId(nextCandidates[0]?.id ?? '')
    }
    setIsDataReady(true)
  }

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return candidates.filter((candidate) => {
      const matchesQuery =
        !normalizedQuery ||
        [candidate.name, candidate.targetRole, candidate.phone, candidate.interviewer, candidate.source]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesRole = roleFilter === '全部岗位' || candidate.targetRole === roleFilter
      const matchesSource = sourceFilter === '全部来源' || candidate.source === sourceFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'archived' ? Boolean(candidate.isArchived) : candidate.status === statusFilter)
      const matchesProbation = probationFilter === 'all' || (candidate.probationStatus ?? 'not_started') === probationFilter
      const matchesArchive =
        archiveFilter === 'all' ||
        (archiveFilter === 'archived' ? Boolean(candidate.isArchived) : !candidate.isArchived)
      return matchesQuery && matchesRole && matchesSource && matchesStatus && matchesProbation && matchesArchive
    })
  }, [archiveFilter, candidates, probationFilter, query, roleFilter, sourceFilter, statusFilter])

  function persistLocalState(nextCandidates: Candidate[]) {
    setCandidates(nextCandidates)
    if (!nextCandidates.some((candidate) => candidate.id === selectedId)) {
      setSelectedId(nextCandidates[0]?.id ?? '')
    }
  }

  function updateAiSettings(nextSettings: AiSettings) {
    setAiSettings(nextSettings)
    saveAiSettings(nextSettings)
  }

  function persistKnowledgeDocuments(nextDocuments: KnowledgeDocument[]) {
    setKnowledgeDocuments(nextDocuments)
    saveKnowledgeDocuments(nextDocuments)
  }

  function persistAgentRuns(nextRuns: AgentRun[]) {
    setAgentRuns(nextRuns)
    saveAgentRuns(nextRuns)
  }

  function persistLastActiveAgentRunId(runId: string) {
    setLastActiveAgentRunId(runId)
    saveLastActiveAgentRunId(runId)
  }

  function clearAgentRecords() {
    clearStoredAgentRecords()
    setAgentRuns([])
    setLastActiveAgentRunId('')
  }

  async function loadAgentDemoData() {
    setOperationError('')
    try {
      const demoDocuments = agentDemoKnowledgeDocuments
        .filter((demoDocument) =>
          !knowledgeDocuments.some((document) => document.id === demoDocument.id || document.title === demoDocument.title),
        )
        .map((demoDocument) =>
          createKnowledgeDocument({
            title: demoDocument.title,
            type: demoDocument.type,
            content: demoDocument.content,
            existingId: demoDocument.id,
          }),
        )
      const retainedDocuments = knowledgeDocuments.filter((document) => !isLowQualityKnowledgeDocument(document))
      if (demoDocuments.length > 0 || retainedDocuments.length !== knowledgeDocuments.length) {
        persistKnowledgeDocuments([...demoDocuments, ...retainedDocuments])
      }

      for (const demoCandidate of agentDemoCandidates) {
        if (candidates.some((candidate) => candidate.name === demoCandidate.name && candidate.targetRole === demoCandidate.targetRole)) continue
        const { id: _id, ...candidateInput } = demoCandidate
        await createCandidateRecord(candidateInput)
      }
      await refreshCandidates()
      setActiveView('agent')
    } catch (error) {
      setOperationError(getOperationErrorMessage(error))
    }
  }

  function isLowQualityKnowledgeDocument(document: KnowledgeDocument) {
    const normalized = `${document.title}${document.content}`.replace(/\s+/g, '')
    const chineseCount = (normalized.match(/[\u4e00-\u9fa5]/g) ?? []).length
    return chineseCount < 20 || /^[\d\W_]+$/u.test(normalized)
  }

  async function generateAnalysis(input: Pick<Candidate, 'targetRole' | 'resumeText'> & Partial<Candidate>) {
    return analyzeCandidateWithSettings(
      {
        name: input.name,
        targetRole: input.targetRole,
        resumeText: buildResumeAnalysisText(input.resumeText, input.resumeParsedInfo),
        jdText: input.jdText,
        interviewFeedback: input.interviewFeedback,
      },
      aiSettings,
    )
  }

  function hasAiAnalysisInput(candidate: Partial<Candidate>) {
    return Boolean(
      candidate.resumeText?.trim() ||
        candidate.jdText?.trim() ||
        candidate.interviewFeedback?.trim(),
    )
  }

  function hasAiKeyFieldsChanged(original: Candidate, draft: CandidateDraft) {
    return (
      normalizeComparableText(original.resumeText) !== normalizeComparableText(draft.resumeText) ||
      normalizeComparableText(original.jdText) !== normalizeComparableText(draft.jdText) ||
      normalizeComparableText(original.interviewFeedback) !== normalizeComparableText(draft.interviewFeedback) ||
      normalizeComparableText(original.targetRole) !== normalizeComparableText(draft.targetRole) ||
      JSON.stringify(original.resumeParsedInfo ?? {}) !== JSON.stringify(draft.resumeParsedInfo ?? {})
    )
  }

  function normalizeComparableText(value?: string) {
    return (value ?? '').trim()
  }

  function hasDraftChanged(original: Candidate, draft: CandidateDraft) {
    return JSON.stringify(normalizeCandidateForCompare(original)) !== JSON.stringify(normalizeCandidateForCompare(draft))
  }

  function normalizeCandidateForCompare(candidate: Partial<Candidate>) {
    return {
      name: candidate.name ?? '',
      phone: candidate.phone ?? '',
      email: candidate.email ?? '',
      targetRole: candidate.targetRole ?? '',
      resumeText: candidate.resumeText ?? '',
      resumeFileName: candidate.resumeFileName ?? '',
      resumeImportType: candidate.resumeImportType ?? 'paste',
      resumeParsedInfo: candidate.resumeParsedInfo ?? {},
      resumeImportedAt: candidate.resumeImportedAt ?? '',
      jdText: candidate.jdText ?? '',
      source: candidate.source ?? '',
      interviewer: candidate.interviewer ?? '',
      interviewTime: candidate.interviewTime ?? '',
      status: candidate.status ?? 'new',
      interviewRating: candidate.interviewRating ?? null,
      interviewFeedback: candidate.interviewFeedback ?? '',
      resultNote: candidate.resultNote ?? '',
      onboardDate: candidate.onboardDate ?? '',
      probationStatus: candidate.probationStatus ?? 'not_started',
      isArchived: Boolean(candidate.isArchived),
    }
  }

  function hasPatchChanged(candidate: Candidate, patch: Partial<Candidate>) {
    return Object.entries(patch).some(([key, value]) => {
      const currentValue = candidate[key as keyof Candidate]
      return JSON.stringify(currentValue ?? null) !== JSON.stringify(value ?? null)
    })
  }

  function isAiOnlyPatch(patch: Partial<Candidate>) {
    const keys = Object.keys(patch)
    if (keys.length === 0) return false
    const aiKeys = new Set([
      'matchScore',
      'strengths',
      'weaknesses',
      'risks',
      'aiQuestions',
      'nextRoundRecommendation',
      'recommendedConclusion',
      'aiRawTextResult',
      'aiFormatWarning',
      'aiUpdatedAt',
      'aiStale',
    ])
    return keys.every((key) => aiKeys.has(key))
  }

  async function upsertCandidate(draft: CandidateDraft, id?: string) {
    const now = new Date().toISOString()
    setOperationError('')
    try {
      if (id) {
        const original = candidates.find((candidate) => candidate.id === id)
        if (original && !hasDraftChanged(original, draft)) {
          setIsFormOpen(false)
          setEditing(null)
          return
        }
        const aiStale = original ? hasAiKeyFieldsChanged(original, draft) : false
        const statusChanged = original ? original.status !== draft.status : false
        const resumeImportedAt =
          original && draft.resumeImportedAt && draft.resumeImportedAt !== original.resumeImportedAt
            ? draft.resumeImportedAt
            : original?.resumeImportedAt
        const updated = await updateCandidateRecord(id, {
          ...draft,
          resumeImportedAt,
          statusUpdatedAt: statusChanged ? now : original?.statusUpdatedAt ?? draft.statusUpdatedAt,
          aiStale: aiStale ? true : original?.aiStale ?? false,
          updatedAt: now,
        })
        const next = candidates.map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                ...(updated ?? {}),
                ...draft,
                resumeImportedAt,
                statusUpdatedAt: statusChanged ? now : candidate.statusUpdatedAt,
                aiStale: aiStale ? true : candidate.aiStale,
                updatedAt: now,
              }
            : candidate,
        )
        persistLocalState(next)
        setSelectedId(id)
      } else {
        let ai: Partial<Candidate> = {}
        if (hasAiAnalysisInput(draft)) {
          setIsAnalyzing(true)
          ai = {
            ...(await generateAnalysis(draft)),
            aiUpdatedAt: now,
            aiStale: false,
          }
        }
        const candidate = await createCandidateRecord({
          ...draft,
          createdAt: now,
          updatedAt: now,
          statusUpdatedAt: now,
          resumeImportedAt: draft.resumeImportedAt,
          strengths: [],
          weaknesses: [],
          risks: [],
          aiQuestions: [],
          ...ai,
          aiStale: false,
        })
        persistLocalState([candidate, ...candidates])
        setSelectedId(candidate.id)
      }
      setIsFormOpen(false)
      setEditing(null)
    } catch (error) {
      setOperationError(getOperationErrorMessage(error))
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function updateCandidate(id: string, patch: Partial<Candidate>) {
    setOperationError('')
    try {
      const current = candidates.find((candidate) => candidate.id === id)
      if (current && !hasPatchChanged(current, patch)) return

      const now = new Date().toISOString()
      const statusChanged = Boolean(current && typeof patch.status !== 'undefined' && patch.status !== current.status)
      const aiOnlyPatch = isAiOnlyPatch(patch)
      const updatePatch: Partial<Candidate> = {
        ...patch,
        ...(statusChanged ? { statusUpdatedAt: now } : {}),
        ...(aiOnlyPatch ? {} : { updatedAt: now }),
      }
      const updated = await updateCandidateRecord(id, updatePatch)
      persistLocalState(
        candidates.map((candidate) =>
          candidate.id === id ? { ...candidate, ...(updated ?? {}), ...updatePatch } : candidate,
        ),
      )
    } catch (error) {
      setOperationError(getOperationErrorMessage(error))
    }
  }

  async function refreshCandidateAnalysis(candidate: Candidate, patch: Partial<Candidate> = {}) {
    setOperationError('')
    try {
      setIsAnalyzing(true)
      const mergedCandidate = { ...candidate, ...patch }
      const ai = await generateAnalysis(mergedCandidate)
      await updateCandidate(candidate.id, { ...patch, ...ai, aiUpdatedAt: new Date().toISOString(), aiStale: false })
    } catch (error) {
      setOperationError(getOperationErrorMessage(error))
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function deleteCandidate(id: string) {
    if (!confirm('确认删除该候选人？该记录会从当前人才库中移除。')) return
    setOperationError('')
    try {
      await deleteCandidateRecord(id)
      persistLocalState(candidates.filter((candidate) => candidate.id !== id))
    } catch (error) {
      setOperationError(getOperationErrorMessage(error))
    }
  }

  if (isSupabaseConfigured && !isAuthReady) {
    return <AuthShell title="正在检查登录状态" description="请稍候。" />
  }

  if (isSupabaseConfigured && !session) {
    return <LoginView />
  }

  if (!isDataReady) {
    return <AuthShell title="正在加载人才库数据" description="正在从当前数据源读取候选人记录。" />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">TF</div>
          <div>
            <strong>TalentFlow AI</strong>
            <span>面试人才库 MVP</span>
          </div>
        </div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.key}
              className={activeView === item.key ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveView(item.key)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>{dataMode === 'supabase' ? '内部试用模式' : '本地试用模式'}</strong>
          <span>
            {dataMode === 'supabase'
              ? 'Supabase Database'
              : '数据保存在当前浏览器。'}
          </span>
          {isSupabaseConfigured && session && (
            <button className="secondary sidebar-signout" onClick={() => supabase?.auth.signOut()}>
              退出登录
            </button>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">HR 招聘工作台</p>
            <h1>{navigation.find((item) => item.key === activeView)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="primary"
              onClick={() => {
                setEditing(null)
                setIsFormOpen(true)
              }}
            >
              新增候选人
            </button>
          </div>
        </header>

        {operationError && <div className="operation-error">{operationError}</div>}

        {activeView === 'dashboard' && (
          <Dashboard
            overview={overview}
            candidates={candidates}
            roleAnalytics={roleAnalytics}
            onOpenCandidate={(id) => {
              setSelectedId(id)
              setActiveView('candidates')
            }}
          />
        )}

        {activeView === 'candidates' && (
          <CandidatesView
            allCandidates={candidates}
            candidates={filteredCandidates}
            selectedCandidate={selectedCandidate}
            query={query}
            roleFilter={roleFilter}
            statusFilter={statusFilter}
            sourceFilter={sourceFilter}
            probationFilter={probationFilter}
            archiveFilter={archiveFilter}
            roles={roles}
            sources={sources}
            onQueryChange={setQuery}
            onRoleFilterChange={setRoleFilter}
            onStatusFilterChange={setStatusFilter}
            onSourceFilterChange={setSourceFilter}
            onProbationFilterChange={setProbationFilter}
            onArchiveFilterChange={setArchiveFilter}
            onSelect={setSelectedId}
            onEdit={(candidate) => {
              setEditing(candidate)
              setIsFormOpen(true)
            }}
            onDelete={deleteCandidate}
            onUpdate={updateCandidate}
            onRefreshAnalysis={refreshCandidateAnalysis}
            agentRuns={agentRuns}
          />
        )}

        {activeView === 'pipeline' && <PipelineView candidates={candidates} onUpdate={updateCandidate} onSelect={setSelectedId} />}

        {activeView === 'ai' && (
          <AiView
            candidates={candidates}
            selectedCandidate={selectedCandidate}
            onSelect={setSelectedId}
            onRefresh={(candidate) => refreshCandidateAnalysis(candidate)}
            isAnalyzing={isAnalyzing}
          />
        )}

        {activeView === 'agent' && (
          <RecruitingAgentView
            candidates={candidates}
            knowledgeDocuments={knowledgeDocuments}
            agentRuns={agentRuns}
            onSaveRuns={persistAgentRuns}
            lastActiveAgentRunId={lastActiveAgentRunId}
            onSetLastActiveRunId={persistLastActiveAgentRunId}
            onLoadDemoData={loadAgentDemoData}
            onClearAgentRecords={clearAgentRecords}
          />
        )}

        {activeView === 'analytics' && (
          <AnalyticsView
            overview={overview}
            roleAnalytics={roleAnalytics}
            funnelAnalytics={funnelAnalytics}
            sourceAnalytics={sourceAnalytics}
            weeklyAnalytics={weeklyAnalytics}
            monthlyAnalytics={monthlyAnalytics}
            agentAnalytics={agentAnalytics}
          />
        )}

        {activeView === 'knowledge' && (
          <KnowledgeBaseView
            documents={knowledgeDocuments}
            onChange={persistKnowledgeDocuments}
          />
        )}

        {activeView === 'notes' && <MvpNotes settings={aiSettings} onSettingsChange={updateAiSettings} />}
      </main>

      {isFormOpen && (
        <CandidateForm
          candidate={editing}
          onClose={() => {
            setIsFormOpen(false)
            setEditing(null)
          }}
          onSubmit={(draft) => upsertCandidate(draft, editing?.id)}
          isAnalyzing={isAnalyzing}
        />
      )}
    </div>
  )
}

function buildResumeAnalysisText(resumeText: string, parsedInfo?: Candidate['resumeParsedInfo']) {
  if (!parsedInfo) return resumeText

  const parts = [
    resumeText,
    parsedInfo.educationSummary ? `教育背景摘要：${parsedInfo.educationSummary}` : '',
    parsedInfo.skills?.length ? `技能关键词：${parsedInfo.skills.join('、')}` : '',
    parsedInfo.projectSummary ? `项目经历摘要：${parsedInfo.projectSummary}` : '',
  ].filter(Boolean)

  return parts.join('\n\n')
}

function AuthShell({ title, description }: { title: string; description: string }) {
  return (
    <div className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">TF</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
    </div>
  )
}

function LoginView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return

    setIsSubmitting(true)
    setError('')
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setIsSubmitting(false)
    if (loginError) setError(loginError.message)
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand-mark">TF</div>
        <div>
          <p className="eyebrow">内部试用版</p>
          <h1>登录 TalentFlow AI</h1>
          <p>使用 Supabase Auth 邮箱密码登录后进入系统。</p>
        </div>
        <label className="field-label">
          邮箱
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field-label">
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        {error && <div className="auth-error">{error}</div>}
        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '登录中' : '登录'}
        </button>
      </form>
    </div>
  )
}

function getOperationErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message)
  }
  return '操作失败，请检查 Supabase 配置、数据库字段或网络状态后重试。'
}

function Dashboard({
  overview,
  candidates,
  roleAnalytics,
  onOpenCandidate,
}: {
  overview: ReturnType<typeof getOverview>
  candidates: Candidate[]
  roleAnalytics: ReturnType<typeof getRoleAnalytics>
  onOpenCandidate: (id: string) => void
}) {
  const hasCandidates = candidates.length > 0
  const upcoming = candidates
    .filter((candidate) => ['new', 'scheduled', 'interviewed', 'offer'].includes(candidate.status))
    .slice(0, 5)
  const insightItems = hasCandidates ? buildRecruitingInsights(candidates, overview, roleAnalytics) : []

  return (
    <section className="stack">
      <div className="metric-grid">
        <Metric label="候选人总数" value={overview.total} hint="当前人才库记录" />
        <Metric label="活跃流程" value={overview.active} hint="待安排、面试、结论和报到" />
        <Metric label="面试通过率" value={`${overview.passRate}%`} hint="通过 / 总候选人" />
        <Metric label="报到转化率" value={`${overview.onboardRate}%`} hint="报到 / 已通过" />
        <Metric label="待评价" value={overview.pendingFeedback} hint="已面试但未完成结论" />
        <Metric label="试用期风险" value={overview.probationRisk} hint="需要 HR 跟进" tone="risk" />
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>待跟进候选人</h2>
              <p>优先处理状态不完整或临近面试的候选人。</p>
            </div>
          </div>
          <div className="follow-list">
            {upcoming.length > 0 ? (
              upcoming.map((candidate) => (
                <button key={candidate.id} className="follow-item" onClick={() => onOpenCandidate(candidate.id)}>
                  <div>
                    <strong>{candidate.name}</strong>
                    <span>{candidate.targetRole}</span>
                  </div>
                  <StatusBadge status={candidate.status} />
                </button>
              ))
            ) : (
              <EmptyState
                title={hasCandidates ? '暂无待跟进候选人' : '暂无候选人数据'}
                description={hasCandidates ? '当前没有待安排、待结论或待报到的候选人。' : '请点击右上角新增候选人，录入简历与面试信息后查看招聘洞察。'}
              />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>AI 招聘洞察</h2>
              <p>基于当前人才库自动归纳的流程提醒。</p>
            </div>
          </div>
          <div className="insight-list">
            {hasCandidates ? (
              insightItems.map((item) => <p key={item}>{item}</p>)
            ) : (
              <EmptyState
                title="暂无候选人数据"
                description="新增候选人后，系统会基于人才库数据生成招聘洞察。"
              />
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>岗位面试概览</h2>
            <p>按岗位查看当前招聘漏斗。</p>
          </div>
        </div>
        <div className="role-grid">
          {roleAnalytics.length > 0 ? (
            roleAnalytics.map((item) => (
              <div className="role-card" key={item.role}>
                <strong>{item.role}</strong>
                <span>{item.total} 人进入流程</span>
                <div className="progress-track">
                  <div style={{ width: `${item.passRate}%` }} />
                </div>
                <small>通过率 {item.passRate}% · 报到率 {item.onboardRate}%</small>
              </div>
            ))
          ) : (
            <EmptyState title="暂无岗位数据" description="新增候选人后，将按岗位生成候选人数、通过率和报到率概览。" />
          )}
        </div>
      </section>
    </section>
  )
}

function buildRecruitingInsights(
  candidates: Candidate[],
  overview: ReturnType<typeof getOverview>,
  roleAnalytics: ReturnType<typeof getRoleAnalytics>,
) {
  const insights = [
    '产品闭环：候选人录入 → 面试安排 → AI 优劣势分析 → 面试评价 → 结果跟进 → 报到/试用期记录 → 岗位与周/月度分析。',
  ]
  const topRole = [...roleAnalytics].sort((a, b) => b.total - a.total)[0]
  const topRoleName = cleanPosition(topRole?.role) || '暂无明确岗位'
  if (topRole && topRoleName !== '暂无明确岗位') {
    insights.push(`${topRoleName}岗位当前候选人最多，共 ${topRole.total} 人，建议统一面试评价口径和追问重点。`)
  }

  const pendingFeedbackCandidates = candidates.filter((candidate) => candidate.status === 'interviewed')
  if (pendingFeedbackCandidates.length > 0) {
    const names = pendingFeedbackCandidates.slice(0, 3).map((candidate) => candidate.name).join('、')
    insights.push(`当前有 ${overview.pendingFeedback} 位候选人待补充面试评价：${names}${pendingFeedbackCandidates.length > 3 ? '等' : ''}。`)
  } else {
    insights.push('当前没有待补充面试评价的候选人。')
  }

  const followUpCount = candidates.filter((candidate) => ['new', 'scheduled', 'interviewed', 'offer'].includes(candidate.status)).length
  if (followUpCount > 0) {
    insights.push(`当前有 ${followUpCount} 位候选人处于待跟进流程，建议 HR 按面试时间和结果状态优先处理。`)
  } else {
    insights.push('当前没有待跟进候选人，可进入岗位和周/月度复盘。')
  }

  if (overview.probationRisk > 0) {
    insights.push(`试用期风险人数为 ${overview.probationRisk}，建议建立入职后 7/14/30 天跟进节奏。`)
  } else {
    insights.push('当前没有试用期风险记录。')
  }

  insights.push('建议每周复盘候选人进入流程、通过、淘汰和报到数据，每月对岗位来源质量做一次汇总。')
  return insights
}

function CandidatesView(props: {
  allCandidates: Candidate[]
  candidates: Candidate[]
  selectedCandidate?: Candidate
  query: string
  roleFilter: string
  statusFilter: StatusFilter
  sourceFilter: string
  probationFilter: ProbationFilter
  archiveFilter: ArchiveFilter
  roles: string[]
  sources: string[]
  onQueryChange: (value: string) => void
  onRoleFilterChange: (value: string) => void
  onStatusFilterChange: (value: StatusFilter) => void
  onSourceFilterChange: (value: string) => void
  onProbationFilterChange: (value: ProbationFilter) => void
  onArchiveFilterChange: (value: ArchiveFilter) => void
  onSelect: (id: string) => void
  onEdit: (candidate: Candidate) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: Partial<Candidate>) => void
  onRefreshAnalysis: (candidate: Candidate, patch?: Partial<Candidate>) => void
  agentRuns: AgentRun[]
}) {
  const [detailCandidateId, setDetailCandidateId] = useState<string | null>(null)
  const detailCandidate = props.allCandidates.find((candidate) => candidate.id === detailCandidateId)
  const stats = getCandidateLibraryStats(props.allCandidates)

  return (
    <section className="candidate-library">
      <div className="library-stat-grid">
        <Metric label="候选人总数" value={stats.total} hint="当前人才库记录" />
        <Metric label="待跟进" value={stats.pending} hint="待评价或待结论" />
        <Metric label="已安排" value={stats.scheduled} hint="已安排面试" />
        <Metric label="已通过" value={stats.passed} hint="面试通过" />
        <Metric label="已淘汰" value={stats.rejected} hint="面试淘汰" />
        <Metric label="已到岗" value={stats.onboarded} hint="已报到记录" />
        <Metric label="已归档" value={stats.archived} hint="已归档候选人" />
      </div>

      <section className="panel library-filter-panel">
        <div className="library-filter-grid">
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="搜索姓名 / 岗位 / 手机" />
          <select value={props.roleFilter} onChange={(event) => props.onRoleFilterChange(event.target.value)}>
            {props.roles.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
          <select value={props.sourceFilter} onChange={(event) => props.onSourceFilterChange(event.target.value)}>
            {props.sources.map((source) => (
              <option key={source}>{source}</option>
            ))}
          </select>
          <select
            value={props.statusFilter}
            onChange={(event) => props.onStatusFilterChange(event.target.value as StatusFilter)}
          >
            <option value="all">全部面试结果</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={props.probationFilter}
            onChange={(event) => props.onProbationFilterChange(event.target.value as ProbationFilter)}
          >
            <option value="all">全部试用期状态</option>
            {Object.entries(probationLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={props.archiveFilter} onChange={(event) => props.onArchiveFilterChange(event.target.value as ArchiveFilter)}>
            <option value="all">全部归档状态</option>
            <option value="active">未归档</option>
            <option value="archived">已归档</option>
          </select>
        </div>
      </section>

      <section className="panel table-panel library-table-panel">
        <div className="panel-header">
          <div>
            <h2>候选人列表</h2>
            <p>用于候选人管理、筛选、状态维护和快速查看。</p>
          </div>
          <span className="table-count">当前 {props.candidates.length} 条</span>
        </div>
        <div className="table-wrap">
          <table className="candidate-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>应聘岗位</th>
                <th>来源</th>
                <th>面试时间</th>
                <th>面试官</th>
                <th>面试结果</th>
                <th>匹配度</th>
                <th>试用期状态</th>
                <th>简历来源</th>
                <th>简历导入时间</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {props.candidates.map((candidate) => {
                const interviewTime = formatDateTime(candidate.interviewTime)
                const interviewer = candidate.interviewer || '待安排'
                const resumeSource = getResumeSourceLabel(candidate.resumeImportType, candidate.resumeFileName)
                const resumeImportedAt = formatDateTime(candidate.resumeImportedAt)
                const updatedAt = formatDateTime(candidate.updatedAt)

                return (
                  <tr key={candidate.id}>
                    <td>
                      <strong>{candidate.name}</strong>
                      {candidate.isArchived && <span>已归档</span>}
                    </td>
                    <td className="truncate-cell" title={candidate.targetRole}>{candidate.targetRole}</td>
                    <td className="truncate-cell" title={candidate.source}>{candidate.source}</td>
                    <td className="truncate-cell" title={interviewTime}>{interviewTime}</td>
                    <td className="truncate-cell" title={interviewer}>{interviewer}</td>
                    <td><StatusBadge status={candidate.status} /></td>
                    <td>{candidate.matchScore ?? '-'} / 100</td>
                    <td><ProbationBadge status={candidate.probationStatus} /></td>
                    <td className="truncate-cell" title={resumeSource}>{resumeSource}</td>
                    <td className="truncate-cell" title={resumeImportedAt}>{resumeImportedAt}</td>
                    <td className="truncate-cell" title={updatedAt}>{updatedAt}</td>
                    <td className="operation-cell">
                      <div className="table-actions">
                        <button className="secondary" onClick={() => { props.onSelect(candidate.id); setDetailCandidateId(candidate.id) }}>
                          查看详情
                        </button>
                        <button className="secondary" onClick={() => props.onEdit(candidate)}>
                          编辑
                        </button>
                        <details className="more-actions">
                          <summary>更多</summary>
                          <div className="more-actions-menu">
                            <button type="button" onClick={() => props.onUpdate(candidate.id, { isArchived: !candidate.isArchived })}>
                              {candidate.isArchived ? '取消归档' : '归档'}
                            </button>
                            <button type="button" className="danger-text" onClick={() => props.onDelete(candidate.id)}>
                              删除
                            </button>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {props.candidates.length === 0 && (
            <EmptyState
              title={props.allCandidates.length === 0 ? '暂无候选人' : '没有匹配的候选人'}
              description={props.allCandidates.length === 0 ? '暂无候选人，请新增候选人。' : '调整筛选条件后再查看结果。'}
            />
          )}
        </div>
      </section>

      {detailCandidate && (
        <CandidateDetailDrawer
          candidate={detailCandidate}
          onClose={() => setDetailCandidateId(null)}
          onEdit={props.onEdit}
          onRefreshAnalysis={props.onRefreshAnalysis}
          agentRuns={props.agentRuns.filter((run) => run.candidateId === detailCandidate.id)}
        />
      )}
    </section>
  )
}

function getCandidateLibraryStats(candidates: Candidate[]) {
  return {
    total: candidates.length,
    pending: candidates.filter((candidate) => ['new', 'interviewed'].includes(candidate.status)).length,
    scheduled: candidates.filter((candidate) => candidate.status === 'scheduled').length,
    passed: candidates.filter((candidate) => candidate.status === 'passed').length,
    rejected: candidates.filter((candidate) => candidate.status === 'rejected').length,
    onboarded: candidates.filter((candidate) => candidate.status === 'onboarded').length,
    archived: candidates.filter((candidate) => Boolean(candidate.isArchived)).length,
  }
}

function CandidateDetailDrawer({
  candidate,
  onClose,
  onEdit,
  onRefreshAnalysis,
  agentRuns,
}: {
  candidate: Candidate
  onClose: () => void
  onEdit: (candidate: Candidate) => void
  onRefreshAnalysis: (candidate: Candidate, patch?: Partial<Candidate>) => void
  agentRuns: AgentRun[]
}) {
  const [isResumeExpanded, setIsResumeExpanded] = useState(false)

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true">
      <aside className="candidate-drawer">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">候选人详情</p>
            <h2>{candidate.name}</h2>
            <span>{candidate.targetRole}</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭详情">
            ×
          </button>
        </div>

        <div className="drawer-actions">
          <button className="secondary" onClick={() => onEdit(candidate)}>编辑</button>
          <button className="secondary" onClick={() => onRefreshAnalysis(candidate)}>重新生成 AI 分析</button>
        </div>

        {candidate.aiStale && (
          <section className="ai-callout stale-callout">
            <strong>AI 分析可能不是最新</strong>
            <span>候选人关键信息已更新，建议重新生成 AI 分析。</span>
          </section>
        )}

        <section className="drawer-section">
          <h3>基本信息</h3>
          <div className="profile-grid">
            <ProfileField label="来源" value={candidate.source} />
            <ProfileField label="面试时间" value={formatDateTime(candidate.interviewTime)} />
            <ProfileField label="面试官" value={candidate.interviewer || '待安排'} />
            <ProfileField label="面试结果" value={statusLabels[candidate.status]} />
            <ProfileField label="匹配度" value={`${candidate.matchScore ?? '-'} / 100`} />
            <ProfileField label="试用期" value={probationLabels[candidate.probationStatus ?? 'not_started']} />
            <ProfileField label="创建时间" value={formatDateTime(candidate.createdAt)} />
            <ProfileField label="最近更新时间" value={formatDateTime(candidate.updatedAt)} />
            <ProfileField label="简历导入时间" value={formatDateTime(candidate.resumeImportedAt)} />
            <ProfileField label="状态更新时间" value={formatDateTime(candidate.statusUpdatedAt)} />
            <ProfileField label="AI 分析时间" value={formatDateTime(candidate.aiUpdatedAt)} />
          </div>
        </section>

        <section className="drawer-section">
          <h3>面试评价</h3>
          <p>{candidate.interviewFeedback || '待补充面试评价'}</p>
        </section>

        <section className="drawer-section">
          <h3>AI 分析摘要</h3>
          <ul>
            <li>优势：{candidate.strengths[0] ?? '待分析'}</li>
            <li>不足：{candidate.weaknesses[0] ?? '待分析'}</li>
            <li>风险：{candidate.risks[0] ?? '待分析'}</li>
            <li>推荐结论：{candidate.recommendedConclusion ?? '待分析'}</li>
          </ul>
        </section>

        <AgentReportHistory agentRuns={agentRuns} compact />

        <section className="drawer-section">
          <h3>JD 文本</h3>
          <p>{getTextSummary(candidate.jdText || '未填写岗位要求/JD 文本', 300)}</p>
        </section>

        <ResumeParsedInfoCard parsedInfo={candidate.resumeParsedInfo} />

        <ResumeTextPreview
          resumeText={candidate.resumeText}
          resumeFileName={candidate.resumeFileName}
          resumeImportType={candidate.resumeImportType}
          isExpanded={isResumeExpanded}
          onToggle={() => setIsResumeExpanded((value) => !value)}
        />
      </aside>
    </div>
  )
}

function ResumeParsedInfoCard({ parsedInfo }: { parsedInfo?: Candidate['resumeParsedInfo'] }) {
  const hasParsedInfo = Boolean(
    parsedInfo?.educationSummary || parsedInfo?.projectSummary || (parsedInfo?.skills && parsedInfo.skills.length > 0),
  )

  if (!hasParsedInfo) return null

  return (
    <section className="drawer-section parsed-info-card">
      <h3>简历解析结果</h3>
      {parsedInfo?.educationSummary && (
        <div>
          <strong>教育背景摘要</strong>
          <p>{parsedInfo.educationSummary}</p>
        </div>
      )}
      {parsedInfo?.skills && parsedInfo.skills.length > 0 && (
        <div>
          <strong>技能关键词</strong>
          <div className="skill-tags">
            {parsedInfo.skills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
        </div>
      )}
      {parsedInfo?.projectSummary && (
        <div>
          <strong>项目经历摘要</strong>
          <p>{parsedInfo.projectSummary}</p>
        </div>
      )}
    </section>
  )
}

function CandidateProfilePanel({
  candidate,
  onEdit,
  onDelete,
  onUpdate,
}: {
  candidate?: Candidate
  onEdit: (candidate: Candidate) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: Partial<Candidate>) => void
}) {
  if (!candidate) {
    return (
      <section className="panel profile-panel">
        <EmptyState title="请选择候选人查看详情" description="从左侧候选人列表选择一条记录后，这里会展示核心档案。" />
      </section>
    )
  }

  return (
    <section className="panel profile-panel">
      <div className="detail-head">
        <div>
          <h2>{candidate.name}</h2>
          <p>{candidate.targetRole}</p>
        </div>
        <div className="status-stack">
          <StatusBadge status={candidate.status} />
          {candidate.isArchived && <ArchiveBadge />}
        </div>
      </div>

      <div className="action-row">
        <button className="secondary" onClick={() => onEdit(candidate)}>
          编辑
        </button>
        <button className="secondary" onClick={() => onUpdate(candidate.id, { isArchived: !candidate.isArchived })}>
          {candidate.isArchived ? '取消归档' : '归档'}
        </button>
        <button className="danger" onClick={() => onDelete(candidate.id)}>
          删除
        </button>
      </div>

      <div className="profile-grid">
        <ProfileField label="姓名" value={candidate.name} />
        <ProfileField label="应聘岗位" value={candidate.targetRole} />
        <ProfileField label="来源" value={candidate.source} />
        <ProfileField label="面试时间" value={formatDateTime(candidate.interviewTime)} />
        <ProfileField label="面试官" value={candidate.interviewer || '待安排'} />
        <ProfileField label="报到时间" value={formatDateTime(candidate.onboardDate)} />
        <ProfileField label="匹配度评分" value={`${candidate.matchScore ?? 0}/100`} />
        <ProfileField label="是否建议进入下一轮" value={candidate.nextRoundRecommendation ?? '待分析'} />
        <ProfileField label="推荐面试结论" value={candidate.recommendedConclusion ?? '待分析'} wide />
        <ProfileField label="创建时间" value={formatDateTime(candidate.createdAt)} />
        <ProfileField label="最近更新时间" value={formatDateTime(candidate.updatedAt)} />
        <ProfileField label="简历导入时间" value={formatDateTime(candidate.resumeImportedAt)} />
        <ProfileField label="状态更新时间" value={formatDateTime(candidate.statusUpdatedAt)} />
        <ProfileField label="AI 分析时间" value={formatDateTime(candidate.aiUpdatedAt)} />
      </div>

      <label className="field-label">
        面试结果
        <select value={candidate.status} onChange={(event) => onUpdate(candidate.id, { status: event.target.value as CandidateStatus })}>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        试用期状态
        <select
          value={candidate.probationStatus ?? 'not_started'}
          onChange={(event) => onUpdate(candidate.id, { probationStatus: event.target.value as ProbationStatus })}
        >
          {Object.entries(probationLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <InfoBlock title="岗位要求/JD 摘要" items={[candidate.jdText || '未填写岗位要求']} />
    </section>
  )
}

function CandidateInsightPanel({
  candidate,
  onRefreshAnalysis,
}: {
  candidate?: Candidate
  onRefreshAnalysis: (candidate: Candidate, patch?: Partial<Candidate>) => void
}) {
  const [resumeDraft, setResumeDraft] = useState(candidate?.resumeText ?? '')
  const [isResumeExpanded, setIsResumeExpanded] = useState(false)

  useEffect(() => {
    setResumeDraft(candidate?.resumeText ?? '')
    setIsResumeExpanded(false)
  }, [candidate?.id, candidate?.resumeText])

  if (!candidate) {
    return (
      <section className="panel insight-panel">
        <EmptyState title="选择候选人后可查看 AI 分析与简历内容" description="AI 优劣势、风险点、追问建议和简历摘要会集中显示在这里。" />
      </section>
    )
  }

  function saveResumeText() {
    if (!candidate) return
    const nextResumeText = cleanResumeText(resumeDraft)
    onRefreshAnalysis(candidate, {
      resumeText: nextResumeText,
      resumeImportType: candidate.resumeImportType === 'file' ? 'file' : candidate.resumeFileName ? 'mock_parse' : 'paste',
    })
  }

  return (
    <aside className="panel insight-panel">
      <InfoBlock
        title="AI 匹配结论"
        items={[
          `匹配度评分：${candidate.matchScore ?? 0}/100`,
          `下一轮建议：${candidate.nextRoundRecommendation ?? '待分析'}`,
          `推荐面试结论：${candidate.recommendedConclusion ?? '待分析'}`,
        ]}
      />
      {candidate.aiFormatWarning && <InfoBlock title="AI 调用提示" items={[candidate.aiFormatWarning]} />}
      {candidate.aiRawTextResult && <InfoBlock title="AI 文本结果" items={[candidate.aiRawTextResult]} />}
      <InfoBlock title="优势" items={candidate.strengths} />
      <InfoBlock title="不足" items={candidate.weaknesses} />
      <InfoBlock title="风险点" items={candidate.risks} />
      <InfoBlock title="建议追问" items={candidate.aiQuestions} />
      <InfoBlock title="面试评价" items={[candidate.interviewFeedback || '待补充面试评价']} />
      <ResumeTextPreview
        resumeText={candidate.resumeText}
        resumeFileName={candidate.resumeFileName}
        resumeImportType={candidate.resumeImportType}
        isExpanded={isResumeExpanded}
        onToggle={() => setIsResumeExpanded((value) => !value)}
      />
      <section className="resume-editor">
        <div>
          <h3>补充简历文本</h3>
          <p>粘贴或更新简历后，会同步重新生成 AI 分析。</p>
        </div>
        <textarea
          rows={5}
          value={resumeDraft}
          onChange={(event) => setResumeDraft(event.target.value)}
          placeholder="粘贴候选人的简历文本"
        />
        <button className="secondary" type="button" onClick={saveResumeText}>
          保存简历并重新分析
        </button>
      </section>
    </aside>
  )
}

function ProfileField({ label, value, wide }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={wide ? 'profile-field wide' : 'profile-field'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )
}

function CandidateDetail({
  candidate,
  onEdit,
  onDelete,
  onUpdate,
  onRefreshAnalysis,
}: {
  candidate: Candidate
  onEdit: (candidate: Candidate) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: Partial<Candidate>) => void
  onRefreshAnalysis: (candidate: Candidate, patch?: Partial<Candidate>) => void
}) {
  const [resumeDraft, setResumeDraft] = useState(candidate.resumeText)
  const [isResumeExpanded, setIsResumeExpanded] = useState(false)

  useEffect(() => {
    setResumeDraft(candidate.resumeText)
    setIsResumeExpanded(false)
  }, [candidate.id, candidate.resumeText])

  function saveResumeText() {
    const nextResumeText = cleanResumeText(resumeDraft)
    onRefreshAnalysis(candidate, {
      resumeText: nextResumeText,
      resumeImportType: candidate.resumeImportType === 'file' ? 'file' : candidate.resumeFileName ? 'mock_parse' : 'paste',
    })
  }

  return (
    <aside className="panel detail-panel">
      <div className="detail-head">
        <div>
          <h2>{candidate.name}</h2>
          <p>{candidate.targetRole}</p>
        </div>
        <div className="status-stack">
          <StatusBadge status={candidate.status} />
          {candidate.isArchived && <ArchiveBadge />}
        </div>
      </div>

      <div className="action-row">
        <button className="secondary" onClick={() => onEdit(candidate)}>
          编辑
        </button>
        <button className="secondary" onClick={() => onUpdate(candidate.id, { isArchived: !candidate.isArchived })}>
          {candidate.isArchived ? '取消归档' : '归档'}
        </button>
        <button className="danger" onClick={() => onDelete(candidate.id)}>
          删除
        </button>
      </div>

      <label className="field-label">
        面试结果
        <select value={candidate.status} onChange={(event) => onUpdate(candidate.id, { status: event.target.value as CandidateStatus })}>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        试用期情况
        <select
          value={candidate.probationStatus ?? 'not_started'}
          onChange={(event) => onUpdate(candidate.id, { probationStatus: event.target.value as ProbationStatus })}
        >
          {Object.entries(probationLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <section className="resume-editor">
        <div>
          <h3>补充简历文本</h3>
          <p>粘贴或更新简历后，会同步重新生成 AI 分析。</p>
        </div>
        <textarea
          rows={5}
          value={resumeDraft}
          onChange={(event) => setResumeDraft(event.target.value)}
          placeholder="粘贴候选人的简历文本"
        />
        <button className="secondary" type="button" onClick={saveResumeText}>
          保存简历并重新分析
        </button>
      </section>

      <InfoBlock title="岗位要求/JD 摘要" items={[candidate.jdText || '未填写岗位要求']} />
      <InfoBlock
        title="AI 匹配结论"
        items={[
          `匹配度评分：${candidate.matchScore ?? 0}/100`,
          `下一轮建议：${candidate.nextRoundRecommendation ?? '待分析'}`,
          `推荐面试结论：${candidate.recommendedConclusion ?? '待分析'}`,
        ]}
      />
      {candidate.aiFormatWarning && <InfoBlock title="AI 调用提示" items={[candidate.aiFormatWarning]} />}
      {candidate.aiRawTextResult && <InfoBlock title="AI 文本结果" items={[candidate.aiRawTextResult]} />}
      <InfoBlock title="AI 优势" items={candidate.strengths} />
      <InfoBlock title="不足与风险" items={[...candidate.weaknesses, ...candidate.risks]} />
      <InfoBlock title="建议追问" items={candidate.aiQuestions} />
      <InfoBlock title="面试评价" items={[candidate.interviewFeedback || '待补充面试评价']} />
      <ResumeTextPreview
        resumeText={candidate.resumeText}
        resumeFileName={candidate.resumeFileName}
        resumeImportType={candidate.resumeImportType}
        isExpanded={isResumeExpanded}
        onToggle={() => setIsResumeExpanded((value) => !value)}
      />
    </aside>
  )
}

function ResumeTextPreview({
  resumeText,
  resumeFileName,
  resumeImportType,
  isExpanded,
  onToggle,
}: {
  resumeText: string
  resumeFileName?: string
  resumeImportType?: Candidate['resumeImportType']
  isExpanded: boolean
  onToggle: () => void
}) {
  const cleanedText = cleanResumeText(resumeText || '')
  const hasResumeText = cleanedText.length > 0
  const shouldCollapse = cleanedText.length > 300
  const summary = shouldCollapse ? `${cleanedText.slice(0, 300)}...` : cleanedText
  const sourceLabel = getResumeSourceLabel(resumeImportType, resumeFileName)

  return (
    <section className="resume-preview">
      <div className="resume-preview-head">
        <div>
          <h3>当前简历文本</h3>
          {resumeFileName && <p>简历文件：{resumeFileName}</p>}
          <p>简历来源：{sourceLabel}</p>
        </div>
        {hasResumeText && shouldCollapse && (
          <button className="secondary" type="button" onClick={onToggle}>
            {isExpanded ? '收起完整简历文本' : '展开完整简历文本'}
          </button>
        )}
      </div>

      <p className="resume-summary">{hasResumeText ? summary : '未填写'}</p>

      {hasResumeText && isExpanded && (
        <div className="resume-full-text" aria-label="完整简历文本">
          {cleanedText}
        </div>
      )}
    </section>
  )
}

function getResumeSourceLabel(resumeImportType?: Candidate['resumeImportType'], resumeFileName?: string) {
  if (resumeImportType === 'file') return '文件导入'
  if (resumeImportType === 'mock_parse') return '模拟解析'
  if (resumeImportType === 'upload' || resumeFileName) return '文件已选择'
  return '手动录入'
}

function PipelineView({
  candidates,
  onUpdate,
  onSelect,
}: {
  candidates: Candidate[]
  onUpdate: (id: string, patch: Partial<Candidate>) => void
  onSelect: (id: string) => void
}) {
  const columns: CandidateStatus[] = ['new', 'scheduled', 'interviewed', 'passed', 'offer', 'onboarded', 'probation', 'rejected']
  return (
    <section className="pipeline">
      {columns.map((status) => (
        <div className="pipeline-column" key={status}>
          <div className="pipeline-header">
            <strong>{statusLabels[status]}</strong>
            <span>{candidates.filter((candidate) => candidate.status === status).length}</span>
          </div>
          {candidates
            .filter((candidate) => candidate.status === status)
            .map((candidate) => (
              <div className="pipeline-card" key={candidate.id} onClick={() => onSelect(candidate.id)}>
                <strong>{candidate.name}</strong>
                <span>{candidate.targetRole}</span>
                <small>{candidate.interviewer || '待安排面试官'}</small>
                <select
                  value={candidate.status}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => onUpdate(candidate.id, { status: event.target.value as CandidateStatus })}
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
        </div>
      ))}
    </section>
  )
}

function AiView({
  candidates,
  selectedCandidate,
  onSelect,
  onRefresh,
  isAnalyzing,
}: {
  candidates: Candidate[]
  selectedCandidate?: Candidate
  onSelect: (id: string) => void
  onRefresh: (candidate: Candidate) => void
  isAnalyzing: boolean
}) {
  const [activeEvidenceTab, setActiveEvidenceTab] = useState<'summary' | 'full' | 'jd' | 'feedback'>('summary')

  useEffect(() => {
    setActiveEvidenceTab('summary')
  }, [selectedCandidate?.id])

  return (
    <section className="ai-workbench">
      <aside className="panel ai-candidate-list">
        <div className="panel-header">
          <div>
            <h2>候选人列表</h2>
            <p>选择候选人查看 AI 评审结果。</p>
          </div>
        </div>
        <div className="ai-candidate-list-body">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              className={selectedCandidate?.id === candidate.id ? 'ai-candidate-card active' : 'ai-candidate-card'}
              onClick={() => onSelect(candidate.id)}
            >
              <div>
                <strong>{candidate.name}</strong>
                <span>{candidate.targetRole}</span>
              </div>
              <small>{formatDateTime(candidate.interviewTime)}</small>
              <div className="candidate-card-meta">
                <b>{candidate.matchScore ?? '-'}</b>
                <StatusBadge status={candidate.status} />
              </div>
            </button>
          ))}
          {candidates.length === 0 && <EmptyState title="暂无候选人可分析" description="暂无候选人可分析，请先新增候选人或导入简历。" />}
        </div>
      </aside>

      <main className="ai-main-workspace">
        {selectedCandidate ? (
          <div className="ai-main-stack">
            <section className="panel ai-summary-bar">
              <div className="ai-summary-person">
                <p className="eyebrow">AI 候选人评审工作台</p>
                <h2>{selectedCandidate.name}</h2>
                <span>{selectedCandidate.targetRole}</span>
              </div>
              <div className="score-ring" aria-label={`匹配度评分 ${selectedCandidate.matchScore ?? 0} 分`}>
                <strong>{selectedCandidate.matchScore ?? 0}</strong>
                <span>匹配度</span>
              </div>
              <div className="ai-summary-fields">
                <ProfileField label="来源" value={selectedCandidate.source} />
                <ProfileField label="面试官" value={selectedCandidate.interviewer || '待安排'} />
                <ProfileField label="当前状态" value={statusLabels[selectedCandidate.status]} />
                <ProfileField label="是否建议进入下一轮" value={selectedCandidate.nextRoundRecommendation ?? '待分析'} />
                <ProfileField label="推荐面试结论" value={selectedCandidate.recommendedConclusion ?? '待分析'} wide />
              </div>
              <button className="primary" onClick={() => onRefresh(selectedCandidate)} disabled={isAnalyzing}>
                {isAnalyzing ? '分析中' : '重新生成 AI 分析'}
              </button>
            </section>

            {selectedCandidate.aiStale && (
              <section className="ai-callout stale-callout">
                <strong>AI 分析可能不是最新</strong>
                <span>候选人关键信息已更新，请点击“重新生成 AI 分析”刷新匹配度、优势、不足和风险点。</span>
              </section>
            )}

            {selectedCandidate.aiFormatWarning && (
              <section className="ai-callout">
                <strong>AI 调用提示</strong>
                <span>{selectedCandidate.aiFormatWarning}</span>
              </section>
            )}

            <section className="ai-core-grid">
              <AiAnalysisCard title="候选人优势" items={selectedCandidate.strengths} />
              <AiAnalysisCard title="候选人不足" items={selectedCandidate.weaknesses} />
              <AiAnalysisCard title="风险点" items={selectedCandidate.risks} />
              <AiAnalysisCard title="建议追问问题" items={selectedCandidate.aiQuestions} />
            </section>

            {selectedCandidate.aiRawTextResult && (
              <AiAnalysisCard title="AI 文本结果" items={[selectedCandidate.aiRawTextResult]} />
            )}

            <section className="panel evidence-panel">
              <div className="panel-header">
                <div>
                  <h2>分析依据</h2>
                  <p>简历、JD 和面试评价用于支撑 AI 判断。</p>
                </div>
              </div>
              <div className="evidence-tabs" role="tablist" aria-label="分析依据">
                {[
                  ['summary', '简历摘要'],
                  ['full', '完整简历'],
                  ['jd', 'JD 文本'],
                  ['feedback', '面试评价'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={activeEvidenceTab === key ? 'active' : ''}
                    type="button"
                    onClick={() => setActiveEvidenceTab(key as typeof activeEvidenceTab)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <EvidenceContent candidate={selectedCandidate} activeTab={activeEvidenceTab} />
            </section>
          </div>
        ) : (
          <section className="panel ai-empty-workspace">
            <EmptyState
              title="暂无候选人可分析"
              description="请先新增候选人或导入简历，再生成 AI 候选人评审结果。"
            />
          </section>
        )}
      </main>
    </section>
  )
}

function EvidenceContent({
  candidate,
  activeTab,
}: {
  candidate: Candidate
  activeTab: 'summary' | 'full' | 'jd' | 'feedback'
}) {
  const resumeText = cleanResumeText(candidate.resumeText || '')
  const resumeSource = getResumeSourceLabel(candidate.resumeImportType, candidate.resumeFileName)

  return (
    <div className="evidence-content">
      <div className="evidence-meta">
        <span>简历来源：{resumeSource}</span>
        {candidate.resumeFileName && <span>简历文件：{candidate.resumeFileName}</span>}
      </div>
      {activeTab === 'summary' && <p>{resumeText ? getTextSummary(resumeText, 300) : '未填写简历文本'}</p>}
      {activeTab === 'full' && <pre>{resumeText || '未填写简历文本'}</pre>}
      {activeTab === 'jd' && <p>{candidate.jdText || '未填写岗位要求/JD 文本'}</p>}
      {activeTab === 'feedback' && <p>{candidate.interviewFeedback || '待补充面试评价'}</p>}
    </div>
  )
}

function AiAnalysisCard({ title, items }: { title: string; items: string[] }) {
  const normalizedItems = items.length > 0 ? items : ['待分析']

  return (
    <section className="ai-analysis-card">
      <h3>{title}</h3>
      <ul>
        {normalizedItems.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function getTextSummary(text: string, maxLength: number) {
  const cleanedText = cleanResumeText(text)
  if (cleanedText.length <= maxLength) return cleanedText
  return `${cleanedText.slice(0, maxLength)}...`
}

function AnalyticsView({
  overview,
  roleAnalytics,
  funnelAnalytics,
  sourceAnalytics,
  weeklyAnalytics,
  monthlyAnalytics,
  agentAnalytics,
}: {
  overview: ReturnType<typeof getOverview>
  roleAnalytics: ReturnType<typeof getRoleAnalytics>
  funnelAnalytics: ReturnType<typeof getFunnelAnalytics>
  sourceAnalytics: ReturnType<typeof getSourceAnalytics>
  weeklyAnalytics: ReturnType<typeof getPeriodAnalytics>
  monthlyAnalytics: ReturnType<typeof getPeriodAnalytics>
  agentAnalytics: ReturnType<typeof getAgentAnalytics>
}) {
  return (
    <section className="stack">
      <div className="metric-grid analytics-metrics">
        <Metric label="已归档人数" value={overview.archived} hint="已归档但保留原始面试结果" />
        <Metric label="Agent 分析次数" value={agentAnalytics.totalRuns} hint="已完成 / 已保存报告" />
        <Metric label="已分析候选人" value={agentAnalytics.analyzedCandidates} hint="按 candidateId 去重，取最新有效报告" />
        <Metric label="建议进入面试人数" value={agentAnalytics.recommended} hint="按候选人最新报告统计" />
        <Metric label="谨慎推进人数" value={agentAnalytics.cautious} hint="按候选人最新报告统计" />
        <Metric label="暂不推进人数" value={agentAnalytics.notRecommended} hint="按候选人最新报告统计" />
        <Metric label="需重点复核候选人" value={agentAnalytics.priorityReviewCandidates} hint="低匹配、暂不推进、依据不足或严重风险" tone="risk" />
        <Metric label="知识库引用次数" value={agentAnalytics.citationCount} hint="Agent 报告引用片段" />
        <Metric label="HR 人工确认率" value={`${agentAnalytics.humanConfirmRate}%`} hint="已人工确认 / 报告数" />
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>招聘流程漏斗</h2>
              <p>展示从新增候选人到报到的流程转化。</p>
            </div>
          </div>
          <div className="funnel-list">
            {funnelAnalytics.map((item, index) => (
              <div className="funnel-item" key={item.label}>
                <span>{index + 1}</span>
                <strong>{item.label}</strong>
                <b>{item.value}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>候选人来源质量分析</h2>
              <p>按来源查看人数和通过率。</p>
            </div>
          </div>
          <div className="source-list">
            {sourceAnalytics.map((item) => (
              <div className="source-item" key={item.source}>
                <div>
                  <strong>{item.source}</strong>
                  <span>{item.total} 人 · 通过 {item.passed}</span>
                </div>
                <b>{item.passRate}%</b>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>岗位面试情况分析</h2>
            <p>用于展示不同岗位的候选人数量、通过率和报到率。</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>岗位</th>
                <th>总人数</th>
                <th>已安排</th>
                <th>待结论</th>
                <th>通过</th>
                <th>淘汰</th>
                <th>已报到</th>
                <th>已归档</th>
                <th>通过率</th>
                <th>报到率</th>
              </tr>
            </thead>
            <tbody>
              {roleAnalytics.map((item) => (
                <tr key={item.role}>
                  <td>{item.role}</td>
                  <td>{item.total}</td>
                  <td>{item.scheduled}</td>
                  <td>{item.interviewed}</td>
                  <td>{item.passed}</td>
                  <td>{item.rejected}</td>
                  <td>{item.onboarded}</td>
                  <td>{item.archived}</td>
                  <td>{item.passRate}%</td>
                  <td>{item.onboardRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="two-column">
        <PeriodPanel title="周度面试情况分析" data={weeklyAnalytics} />
        <PeriodPanel title="月度面试情况分析" data={monthlyAnalytics} />
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>各岗位 Agent 平均匹配度</h2>
              <p>基于已保存 / 已完成 Agent 报告统计。</p>
            </div>
          </div>
          <div className="source-list">
            {agentAnalytics.averageMatchByRole.length === 0 ? (
              <EmptyState title="暂无 Agent 匹配度数据" description="保存候选人初筛或面试后评审报告后会显示。" />
            ) : (
              agentAnalytics.averageMatchByRole.map((item) => (
                <div className="source-item" key={item.role}>
                  <div>
                    <strong>{item.role}</strong>
                    <span>{item.total} 名候选人</span>
                  </div>
                  <b>{item.averageMatchScore}</b>
                </div>
              ))
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>常见短板与风险关键词</h2>
              <p>用于复盘岗位要求、面试标准和知识库覆盖情况。</p>
            </div>
          </div>
          <div className="tag-cloud">
            {[...agentAnalytics.commonWeaknessKeywords, ...agentAnalytics.commonRiskKeywords].length === 0 ? (
              <span>暂无关键词</span>
            ) : (
              [...agentAnalytics.commonWeaknessKeywords, ...agentAnalytics.commonRiskKeywords].map((item) => (
                <span key={`${item.keyword}-${item.count}`}>{item.keyword} · {item.count}</span>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  )
}

function PeriodPanel({ title, data }: { title: string; data: ReturnType<typeof getPeriodAnalytics> }) {
  const max = Math.max(...data.map((item) => item.total), 1)
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>按候选人进入系统时间统计。</p>
        </div>
      </div>
      <div className="bar-list">
        {data.map((item) => (
          <div className="bar-item" key={item.label}>
            <div>
              <strong>{item.label}</strong>
              <span>
                {item.total} 人 · 通过 {item.passed} · 报到 {item.onboarded}
              </span>
            </div>
            <div className="bar-track">
              <div style={{ width: `${(item.total / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RecruitingAgentView({
  candidates,
  knowledgeDocuments,
  agentRuns,
  onSaveRuns,
  lastActiveAgentRunId,
  onSetLastActiveRunId,
  onLoadDemoData,
  onClearAgentRecords,
}: {
  candidates: Candidate[]
  knowledgeDocuments: KnowledgeDocument[]
  agentRuns: AgentRun[]
  onSaveRuns: (runs: AgentRun[]) => void
  lastActiveAgentRunId: string
  onSetLastActiveRunId: (runId: string) => void
  onLoadDemoData: () => Promise<void>
  onClearAgentRecords: () => void
}) {
  const initialActiveRun = agentRuns.find((run) => run.id === lastActiveAgentRunId) ?? null
  const [candidateId, setCandidateId] = useState(initialActiveRun?.candidateId ?? candidates[0]?.id ?? '')
  const [workflowType, setWorkflowType] = useState<AgentWorkflowType>(initialActiveRun?.workflowType ?? 'candidate_screening')
  const [jdText, setJdText] = useState(initialActiveRun?.jdText ?? candidates[0]?.jdText ?? '')
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(initialActiveRun?.selectedKnowledgeDocIds ?? [])
  const [currentRun, setCurrentRun] = useState<AgentRun | null>(initialActiveRun)
  const [hrNote, setHrNote] = useState(initialActiveRun?.hrNote ?? '')
  const [humanConfirmed, setHumanConfirmed] = useState(Boolean(initialActiveRun?.humanConfirmed))
  const [restoreMessage, setRestoreMessage] = useState(() => {
    if (!initialActiveRun) return ''
    return initialActiveRun.status === 'saved' ? '已恢复上次 Agent 分析结果。' : '已恢复上次未保存的 Agent 分析结果。'
  })
  const [isConfigDirty, setIsConfigDirty] = useState(false)

  const selectedCandidate = candidates.find((candidate) => candidate.id === candidateId)
  const relatedRuns = selectedCandidate ? agentRuns.filter((run) => run.candidateId === selectedCandidate.id) : agentRuns.slice(0, 6)

  useEffect(() => {
    const restoredRun = agentRuns.find((run) => run.id === lastActiveAgentRunId)
    if (!restoredRun) return
    const restoredDocIds = restoredRun.selectedKnowledgeDocIds ?? []
    if (currentRun?.id === restoredRun.id) return

    setCurrentRun(restoredRun)
    setHrNote(restoredRun.hrNote ?? '')
    setHumanConfirmed(Boolean(restoredRun.humanConfirmed))
    setCandidateId(restoredRun.candidateId ?? '')
    setWorkflowType(restoredRun.workflowType)
    setJdText(restoredRun.jdText)
    setSelectedDocIds(restoredDocIds)
    setRestoreMessage(restoredRun.status === 'saved' ? '已恢复上次 Agent 分析结果。' : '已恢复上次未保存的 Agent 分析结果。')
    setIsConfigDirty(false)
  }, [agentRuns, currentRun, lastActiveAgentRunId])

  useEffect(() => {
    if (!currentRun || currentRun.status === 'saved') return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = '当前 Agent 分析尚未保存，刷新后可能丢失，是否继续？'
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentRun])

  function toggleDocument(documentId: string) {
    setSelectedDocIds((current) => {
      const next = current.includes(documentId) ? current.filter((id) => id !== documentId) : [...current, documentId]
      markConfigDirty()
      return next
    })
  }

  function markConfigDirty() {
    if (currentRun) {
      setIsConfigDirty(true)
      setRestoreMessage('')
    }
  }

  function changeCandidate(nextCandidateId: string) {
    setCandidateId(nextCandidateId)
    const candidate = candidates.find((item) => item.id === nextCandidateId)
    setJdText(candidate?.jdText || candidate?.targetRole || '')
    markConfigDirty()
  }

  function changeWorkflowType(nextWorkflowType: AgentWorkflowType) {
    setWorkflowType(nextWorkflowType)
    markConfigDirty()
  }

  function changeJdText(nextJdText: string) {
    setJdText(nextJdText)
    markConfigDirty()
  }

  function runAgent() {
    const run = runRecruitingAgent({
      workflowType,
      candidate: selectedCandidate,
      jdText: jdText || selectedCandidate?.jdText || selectedCandidate?.targetRole || '',
      knowledgeDocuments,
      selectedKnowledgeDocIds: selectedDocIds,
    })
    setCurrentRun(run)
    setHrNote('')
    setHumanConfirmed(false)
    onSaveRuns([run, ...agentRuns.filter((item) => item.id !== run.id)])
    onSetLastActiveRunId(run.id)
    setRestoreMessage('')
    setIsConfigDirty(false)
  }

  function resetAgent() {
    setCurrentRun(null)
    setHrNote('')
    setHumanConfirmed(false)
    onSetLastActiveRunId('')
    setRestoreMessage('')
    setIsConfigDirty(false)
  }

  function saveReport() {
    if (!currentRun) return
    const savedRun: AgentRun = {
      ...currentRun,
      status: 'saved',
      hrNote,
      humanConfirmed,
      updatedAt: new Date().toISOString(),
    }
    const nextRuns = [savedRun, ...agentRuns.filter((run) => run.id !== savedRun.id)]
    onSaveRuns(nextRuns)
    onSetLastActiveRunId(savedRun.id)
    setCurrentRun(savedRun)
    setRestoreMessage('')
    setIsConfigDirty(false)
  }

  function updateCurrentRunDraft(patch: Partial<Pick<AgentRun, 'hrNote' | 'humanConfirmed'>>) {
    if (!currentRun) return
    const nextRun: AgentRun = {
      ...currentRun,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    setCurrentRun(nextRun)
    onSaveRuns([nextRun, ...agentRuns.filter((run) => run.id !== nextRun.id)])
    onSetLastActiveRunId(nextRun.id)
  }

  function changeHrNote(value: string) {
    setHrNote(value)
    updateCurrentRunDraft({ hrNote: value })
  }

  function changeHumanConfirmed(value: boolean) {
    setHumanConfirmed(value)
    updateCurrentRunDraft({ humanConfirmed: value })
  }

  function clearAgentRecordsSafely() {
    const shouldClear = confirm('确定清理 Agent 测试记录吗？这只会清理 AgentRun / AgentReport，不会删除候选人和知识库文档。')
    if (!shouldClear) return
    onClearAgentRecords()
    setCurrentRun(null)
    setHrNote('')
    setHumanConfirmed(false)
    setRestoreMessage('')
    setIsConfigDirty(false)
  }

  async function loadDemoDataSafely() {
    if (currentRun && currentRun.status !== 'saved') {
      const shouldContinue = confirm('加载演示数据可能覆盖当前未保存分析，是否继续？')
      if (!shouldContinue) return
    }
    if (agentRuns.length > 0) {
      const shouldClearRecords = confirm('当前已有 Agent 测试记录。是否先清理旧记录，避免演示统计数字膨胀？')
      if (shouldClearRecords) {
        onClearAgentRecords()
        setCurrentRun(null)
        setHrNote('')
        setHumanConfirmed(false)
        setRestoreMessage('')
        setIsConfigDirty(false)
      }
    }
    await onLoadDemoData()
    setSelectedDocIds(agentDemoKnowledgeDocuments.map((document) => document.id))
    markConfigDirty()
  }

  return (
    <section className="agent-page">
      <div className="agent-hero panel">
        <div>
          <p className="eyebrow">HR 招聘分析 Agent 自动化工作流 MVP</p>
          <h2>招聘分析 Agent 工作台</h2>
          <p>
            基于候选人资料、岗位 JD 与招聘知识库，自动生成初筛、追问与面试评审建议，最终由 HR 人工确认。
          </p>
        </div>
        <div className="agent-warning">
          AI 输出仅作为招聘辅助建议，不作为最终人选决策。
        </div>
      </div>

      <AgentRunSummaryCards run={currentRun} humanConfirmed={humanConfirmed || Boolean(currentRun?.humanConfirmed)} />

      {restoreMessage && (
        <div className="agent-restore-notice">
          {restoreMessage}
        </div>
      )}

      {isConfigDirty && (
        <div className="agent-dirty-notice">
          配置已变更，建议重新运行 Agent。
        </div>
      )}

      <div className="agent-workspace">
        <aside className="panel agent-config">
          <div className="panel-header">
            <div>
              <h2>输入与配置</h2>
              <p>选择候选人、JD、知识库和固定工作流。</p>
            </div>
          </div>
          <button className="secondary" type="button" onClick={loadDemoDataSafely}>
            加载 Agent 演示数据
          </button>
          <button className="danger secondary" type="button" onClick={clearAgentRecordsSafely}>
            清理 Agent 测试记录
          </button>
          <label>
            选择候选人
            <select value={candidateId} onChange={(event) => changeCandidate(event.target.value)}>
              <option value="">不选择候选人，仅分析 JD</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} · {candidate.targetRole}
                </option>
              ))}
            </select>
          </label>
          <label>
            Agent 工作流类型
            <select value={workflowType} onChange={(event) => changeWorkflowType(event.target.value as AgentWorkflowType)}>
              {Object.entries(agentWorkflowLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            岗位 JD
            <textarea
              rows={8}
              value={jdText}
              onChange={(event) => changeJdText(event.target.value)}
              placeholder="粘贴岗位职责、任职要求或从候选人档案带入 JD。"
            />
          </label>
          <div className="agent-doc-picker">
            <strong>选择招聘知识库文档</strong>
            {knowledgeDocuments.length === 0 ? (
              <p className="no-evidence">暂无知识文档，可先到“招聘知识库”上传 JD / 面试标准 / 招聘 FAQ。</p>
            ) : (
              knowledgeDocuments.map((document) => (
                <label key={document.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(document.id)}
                    onChange={() => toggleDocument(document.id)}
                  />
                  <span>{document.title} · {knowledgeDocumentTypeLabels[document.type]}</span>
                </label>
              ))
            )}
          </div>
          <div className="agent-actions">
            <button className="primary" type="button" onClick={runAgent}>
              运行 Agent 分析
            </button>
            <button className="secondary" type="button" onClick={resetAgent}>
              重置
            </button>
          </div>
        </aside>

        <section className="panel agent-steps">
          <div className="panel-header">
            <div>
              <h2>Agent 执行步骤</h2>
              <p>展示每一步状态、摘要、RAG 使用情况和置信度。</p>
            </div>
          </div>
          {!currentRun ? (
            <EmptyState title="尚未运行 Agent" description="配置候选人、JD 和知识库后，点击“运行 Agent 分析”。" />
          ) : (
            <div className="step-list">
              {currentRun.steps.map((step, index) => (
                <article key={step.id} className={`agent-step ${step.status}`}>
                  <div className="step-index">{index + 1}</div>
                  <div>
                    <div className="step-title-row">
                      <strong>{step.title}</strong>
                      <span className={`step-status ${step.status}`}>{getAgentStepStatusLabel(step.status)}</span>
                      <ConfidenceBadge confidence={step.confidence} />
                    </div>
                    <p>{step.outputSummary}</p>
                    <small>{step.usedRag ? '使用知识库依据' : '基于输入资料 / AI 辅助整理'} · {step.description}</small>
                    {step.keyFindings.length > 0 && (
                      <ul>
                        {step.keyFindings.slice(0, 2).map((finding) => (
                          <li key={finding}>{finding}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel agent-rag">
          <div className="panel-header">
            <div>
              <h2>知识库引用来源</h2>
              <p>展示命中的文档、chunk、关键词、相关性和是否进入最终报告。</p>
            </div>
          </div>
          {!currentRun ? (
            <EmptyState title="暂无引用来源" description="运行 Agent 后会显示本次命中的知识库片段。" />
          ) : currentRun.ragResults.length === 0 ? (
            <p className="no-evidence">当前知识库依据不足，不能生成确定结论。以下内容仅可作为辅助思路，请 HR 结合实际情况判断。</p>
          ) : (
            <div className="agent-citations">
              {currentRun.ragResults.map((result) => (
                <RagResultCard key={result.id} result={result} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel agent-report-panel">
        <div className="panel-header">
          <div>
            <h2>AI 辅助评审报告</h2>
            <p>报告区分候选人资料、JD / 知识库依据、AI 推断和 HR 人工确认项。</p>
          </div>
          {currentRun && (
            <div className="report-actions">
              <button className="secondary" onClick={runAgent}>重新运行</button>
              <button className="primary" onClick={saveReport}>
                {currentRun.status === 'saved' ? '已保存到候选人详情' : selectedCandidate ? '保存报告到候选人详情' : '保存 Agent 报告'}
              </button>
            </div>
          )}
        </div>
        {!currentRun ? (
          <EmptyState title="暂无报告" description="运行任一固定 Agent 工作流后，会在这里生成结构化报告。" />
        ) : (
          <AgentReportPanel
            run={currentRun}
            hrNote={hrNote}
            humanConfirmed={humanConfirmed}
            onHrNoteChange={changeHrNote}
            onHumanConfirmedChange={changeHumanConfirmed}
          />
        )}
      </section>

      <AgentReportHistory agentRuns={relatedRuns} />
    </section>
  )
}

function AgentRunSummaryCards({ run, humanConfirmed }: { run: AgentRun | null; humanConfirmed: boolean }) {
  return (
    <div className="agent-summary-cards">
      <Metric
        label="推荐结论"
        value={run ? agentRecommendationLabels[run.finalReport.recommendation] : '待运行'}
        hint="推荐 / 谨慎推进 / 暂不推荐 / 信息不足"
      />
      <Metric
        label="匹配度"
        value={run && typeof run.finalReport.matchScore === 'number' ? run.finalReport.matchScore : '-'}
        hint="0-100，仅为辅助评分"
      />
      <Metric
        label="RAG 置信度"
        value={run ? agentConfidenceLabels[run.finalReport.confidence] : '-'}
        hint={run?.ragResults.length ? `${run.ragResults.length} 条有效引用` : '暂无有效引用'}
      />
      <Metric
        label="HR 确认状态"
        value={humanConfirmed ? '已确认' : '待确认'}
        hint="最终由 HR / 用人部门判断"
      />
    </div>
  )
}

function AgentReportPanel({
  run,
  hrNote,
  humanConfirmed,
  onHrNoteChange,
  onHumanConfirmedChange,
}: {
  run: AgentRun
  hrNote: string
  humanConfirmed: boolean
  onHrNoteChange: (value: string) => void
  onHumanConfirmedChange: (value: boolean) => void
}) {
  const report = run.finalReport
  return (
    <div className="agent-report">
      <section className="report-executive-summary">
        <div className="report-summary-head">
          <div>
            <p className="eyebrow">{agentWorkflowLabels[run.workflowType]} · {run.candidateName || run.jobTitle || '未绑定候选人'}</p>
            <h3>报告摘要</h3>
          </div>
          <span className={`recommendation ${report.recommendation}`}>{agentRecommendationLabels[report.recommendation]}</span>
        </div>
        <div className="report-summary-mini-grid">
          <ProfileField label="推荐结论" value={agentRecommendationLabels[report.recommendation]} />
          <ProfileField label="匹配度评分" value={`${report.matchScore ?? '-'} / 100`} />
          <ProfileField label="RAG 置信度" value={agentConfidenceLabels[report.confidence]} />
          <ProfileField label="HR 确认状态" value={humanConfirmed ? '已确认' : '待确认'} />
        </div>
        <div className="report-detail-grid compact">
          <InfoBlock title="核心匹配点 3 条" items={ensureListSize(report.strengths, 3)} />
          <InfoBlock title="主要短板 3 条" items={ensureListSize(report.weaknesses, 3)} />
          <InfoBlock title="主要风险 3 条" items={ensureListSize(report.risks, 3)} />
          <InfoBlock title="建议追问 3-5 条" items={ensureListSize(report.interviewQuestions, 3).slice(0, 5)} />
        </div>
        <InfoBlock title="HR 需确认事项" items={[report.sections.humanReviewRequired]} />
      </section>
      {report.confidence === 'none' && (
        <p className="no-evidence">当前知识库依据不足，不能生成确定结论。以下内容仅可作为辅助思路，请 HR 结合实际情况判断。</p>
      )}
      <details className="report-details">
        <summary>查看详细报告</summary>
        <div className="answer-sections">
          <section className="answer-card">
            <h3>基于候选人资料的判断</h3>
            <p>{report.sections.candidateBasedJudgement}</p>
          </section>
          <section className="answer-card">
            <h3>基于 JD / 知识库的依据</h3>
            <p>{report.sections.jdAndKnowledgeBaseEvidence}</p>
          </section>
          <section className="answer-card">
            <h3>AI 推断与建议</h3>
            <p>{report.sections.aiInferenceAndSuggestions}</p>
          </section>
          <section className="answer-card warning-card">
            <h3>需要 HR 人工确认的内容</h3>
            <p>{report.sections.humanReviewRequired}</p>
          </section>
        </div>
        {report.probationFocus.length > 0 && <InfoBlock title="试用期关注点" items={report.probationFocus} />}
      </details>
      <section className="hr-confirmation">
        <h3>HR 人工确认</h3>
        <label className="checkbox-row">
          <input type="checkbox" checked={humanConfirmed} onChange={(event) => onHumanConfirmedChange(event.target.checked)} />
          <span>我已人工复核候选人资料、JD、知识库依据和 AI 辅助建议。</span>
        </label>
        <textarea rows={4} value={hrNote} onChange={(event) => onHrNoteChange(event.target.value)} placeholder="填写 HR 修改备注、补充判断或待确认问题。" />
        <p>{report.finalNote}</p>
      </section>
    </div>
  )
}

function ensureListSize(items: string[], minSize: number) {
  if (items.length >= minSize) return items.slice(0, minSize)
  return [...items, ...Array.from({ length: minSize - items.length }, () => '待补充资料后确认')]
}

function AgentReportHistory({ agentRuns, compact }: { agentRuns: AgentRun[]; compact?: boolean }) {
  const runsWithVersion = getAgentRunsWithVersion(agentRuns)
  const visibleLimit = compact ? 3 : 5
  const visibleRuns = runsWithVersion.slice(0, visibleLimit)
  const hiddenRuns = runsWithVersion.slice(visibleLimit)
  return (
    <section className={compact ? 'drawer-section agent-history compact' : 'panel agent-history'}>
      <h3>Agent 评审记录</h3>
      {visibleRuns.length === 0 ? (
        <p className="no-evidence">暂无已保存 Agent 报告。</p>
      ) : (
        <div className="agent-history-list">
          {visibleRuns.map((item) => (
            <AgentHistoryItem key={item.run.id} run={item.run} version={item.version} />
          ))}
          {hiddenRuns.length > 0 && (
            <details className="agent-history-more">
              <summary>查看全部历史记录（{hiddenRuns.length} 条）</summary>
              <div className="agent-history-list">
                {hiddenRuns.map((item) => (
                  <AgentHistoryItem key={item.run.id} run={item.run} version={item.version} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  )
}

function AgentHistoryItem({ run, version }: { run: AgentRun; version: number }) {
  return (
    <details className="agent-history-item">
      <summary>
        <span>
          <strong>{agentWorkflowLabels[run.workflowType]} v{version}</strong>
          <small>{formatDateTime(run.createdAt)} · {run.jobTitle}</small>
        </span>
        <span className={`recommendation ${run.finalReport.recommendation}`}>
          {agentRecommendationLabels[run.finalReport.recommendation]}
        </span>
      </summary>
      <div className="history-detail">
        <p>匹配度评分：{run.finalReport.matchScore ?? '-'} / 100</p>
        <p>HR 确认状态：{run.humanConfirmed ? '已确认' : '待确认'}</p>
        <p>保存状态：{run.status === 'saved' ? '已保存' : '已完成未保存'}</p>
        <p>风险标签：{run.finalReport.risks.slice(0, 3).join('；') || '暂无'}</p>
        <p>HR 备注：{run.hrNote || '暂无备注'}</p>
        <p>{run.finalReport.sections.aiInferenceAndSuggestions}</p>
      </div>
    </details>
  )
}

function getAgentRunsWithVersion(agentRuns: AgentRun[]) {
  const sortedAscending = [...agentRuns].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const counters = new Map<string, number>()
  const versions = new Map<string, number>()

  sortedAscending.forEach((run) => {
    const key = `${run.candidateId || 'no-candidate'}:${run.workflowType}`
    const nextVersion = (counters.get(key) ?? 0) + 1
    counters.set(key, nextVersion)
    versions.set(run.id, nextVersion)
  })

  return [...agentRuns]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((run) => ({ run, version: versions.get(run.id) ?? 1 }))
}

function RagResultCard({ result }: { result: RagResult }) {
  return (
    <article className="citation-card agent-citation-card">
      <div className="citation-meta">
        <strong>{result.docTitle}</strong>
        <span>{knowledgeDocumentTypeLabels[result.docType]}</span>
        <span>{result.chunkId}</span>
      </div>
      <div className="citation-summary">
        <span>有效命中内容摘要</span>
        <p>{renderHighlightedText(result.summary, result.matchedKeywords)}</p>
      </div>
      <div className="rag-meta-row">
        <span>命中关键词：{result.matchedKeywords.join('、') || '暂无'}</span>
        <span>相关性：{result.relevanceScore}</span>
        <ConfidenceBadge confidence={result.confidence} />
        <span>{result.usedInFinalReport ? '已被最终报告引用' : '未进入最终报告'}</span>
      </div>
    </article>
  )
}

function ConfidenceBadge({ confidence }: { confidence: AgentRun['finalReport']['confidence'] }) {
  return <span className={`confidence-badge ${confidence}`}>置信度：{agentConfidenceLabels[confidence]}</span>
}

function getAgentStepStatusLabel(status: AgentRun['steps'][number]['status']) {
  if (status === 'pending') return '等待中'
  if (status === 'running') return '执行中'
  if (status === 'completed') return '已完成'
  return '需人工确认'
}

function KnowledgeBaseView({
  documents,
  onChange,
}: {
  documents: KnowledgeDocument[]
  onChange: (documents: KnowledgeDocument[]) => void
}) {
  const [selectedId, setSelectedId] = useState(documents[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<KnowledgeDocumentType>('JD')
  const [content, setContent] = useState('')
  const [question, setQuestion] = useState('')
  const [ragResult, setRagResult] = useState<RagQuery | null>(null)
  const [fileError, setFileError] = useState('')

  const selectedDocument = documents.find((document) => document.id === selectedId) ?? null
  const totalChunks = documents.reduce((sum, document) => sum + document.chunks.length, 0)

  useEffect(() => {
    if (!selectedDocument) return
    setTitle(selectedDocument.title)
    setType(selectedDocument.type)
    setContent(selectedDocument.content)
  }, [selectedDocument])

  function resetForm() {
    setSelectedId('')
    setTitle('')
    setType('JD')
    setContent('')
    setFileError('')
  }

  function saveDocument(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || !content.trim()) return

    const nextDocument = createKnowledgeDocument({
      title,
      type,
      content,
      existingId: selectedDocument?.id,
    })

    if (selectedDocument) {
      onChange(documents.map((document) => (document.id === selectedDocument.id ? nextDocument : document)))
      setSelectedId(nextDocument.id)
      return
    }

    onChange([nextDocument, ...documents])
    setSelectedId(nextDocument.id)
  }

  async function importTextFile(file?: File) {
    if (!file) return
    setFileError('')
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.txt') && !lowerName.endsWith('.md')) {
      setFileError('当前 MVP 仅支持 txt / md 文本文件，也可以直接粘贴文档内容。')
      return
    }

    try {
      const text = await file.text()
      setTitle((current) => current || file.name.replace(/\.(txt|md)$/i, ''))
      setContent(text)
    } catch {
      setFileError('文件读取失败，请改用手动粘贴文本。')
    }
  }

  function deleteDocument(documentId: string) {
    const document = documents.find((item) => item.id === documentId)
    if (!document || !confirm(`确认删除知识文档“${document.title}”？相关知识片段也会一起删除。`)) return

    const nextDocuments = documents.filter((item) => item.id !== documentId)
    onChange(nextDocuments)
    if (selectedId === documentId) {
      setSelectedId(nextDocuments[0]?.id ?? '')
      if (nextDocuments.length === 0) resetForm()
    }
    if (ragResult?.matchedChunks.some((chunk) => chunk.documentId === documentId)) {
      setRagResult(null)
    }
  }

  function askKnowledgeBase(event: FormEvent) {
    event.preventDefault()
    setRagResult(queryKnowledgeBase(question, documents))
  }

  return (
    <section className="knowledge-page">
      <div className="knowledge-hero panel">
        <div>
          <p className="eyebrow">招聘知识库 RAG MVP / 内部试用能力</p>
          <h2>招聘知识库</h2>
          <p>
            上传 JD、面试标准、招聘 FAQ 等资料，系统可基于知识库回答 HR 问题，并展示引用来源，降低 AI 幻觉风险。
          </p>
        </div>
        <div className="knowledge-stats">
          <Metric label="知识文档" value={documents.length} hint="localStorage 本地保存" />
          <Metric label="知识片段" value={totalChunks} hint="关键词检索模拟 RAG" />
        </div>
      </div>

      <div className="knowledge-layout">
        <aside className="panel knowledge-doc-list">
          <div className="panel-header">
            <div>
              <h2>知识文档</h2>
              <p>JD、面试标准、招聘 FAQ、岗位画像等。</p>
            </div>
            <button className="secondary" onClick={resetForm}>新增</button>
          </div>
          {documents.length === 0 ? (
            <div className="empty-state compact">
              <strong>请先上传 JD、面试标准或招聘 FAQ。</strong>
              <span>当前不会使用真实候选人隐私数据作为默认示例。</span>
            </div>
          ) : (
            <div className="knowledge-doc-items">
              {documents.map((document) => (
                <button
                  key={document.id}
                  className={selectedId === document.id ? 'knowledge-doc-item active' : 'knowledge-doc-item'}
                  onClick={() => setSelectedId(document.id)}
                >
                  <strong>{document.title}</strong>
                  <span>{knowledgeDocumentTypeLabels[document.type]} · {document.chunks.length} 个片段</span>
                  <small>更新：{formatDateTime(document.updatedAt)}</small>
                  <span
                    role="button"
                    tabIndex={0}
                    className="danger-link"
                    onClick={(event) => {
                      event.stopPropagation()
                      deleteDocument(document.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.stopPropagation()
                        deleteDocument(document.id)
                      }
                    }}
                  >
                    删除
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <form className="panel knowledge-editor" onSubmit={saveDocument}>
          <div className="panel-header">
            <div>
              <h2>{selectedDocument ? '编辑知识文档' : '新增知识文档'}</h2>
              <p>保存时会自动切分为 chunks，用于后续问题检索。</p>
            </div>
          </div>
          <div className="settings-grid">
            <label>
              文档标题
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="如：AI 产品经理 JD / 试用期评价标准" />
            </label>
            <label>
              文档类型
              <select value={type} onChange={(event) => setType(event.target.value as KnowledgeDocumentType)}>
                {Object.entries(knowledgeDocumentTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="wide-field">
            上传 txt / md 文本
            <input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => importTextFile(event.target.files?.[0])} />
          </label>
          {fileError && <div className="parse-error">{fileError}</div>}
          <label className="wide-field">
            文档内容
            <textarea
              rows={11}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="粘贴 JD、面试标准、招聘 FAQ、岗位画像、试用期评价标准或招聘流程说明。"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={resetForm}>清空</button>
            <button className="primary" type="submit" disabled={!title.trim() || !content.trim()}>
              保存并切片
            </button>
          </div>
          {selectedDocument && (
            <section className="chunk-preview">
              <h3>知识片段</h3>
              {selectedDocument.chunks.map((chunk) => (
                <article key={chunk.id} className="chunk-card">
                  <strong>{chunk.id}</strong>
                  <p>{chunk.content}</p>
                  <small>关键词：{chunk.keywords.slice(0, 12).join('、') || '暂无'}</small>
                </article>
              ))}
            </section>
          )}
        </form>

        <section className="panel rag-panel">
          <div className="panel-header">
            <div>
              <h2>知识库问答</h2>
              <p>优先基于知识片段回答，区分知识库依据和 AI 推断建议。</p>
            </div>
          </div>
          <form className="rag-question" onSubmit={askKnowledgeBase}>
            <textarea
              rows={4}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例如：这个岗位最核心的能力要求是什么？面试时应该重点追问哪些问题？"
            />
            <button className="primary" disabled={!question.trim()}>提问</button>
          </form>
          <details className="rag-prompt">
            <summary>RAG 系统 Prompt</summary>
            <pre>{RAG_SYSTEM_PROMPT}</pre>
          </details>
          {!ragResult ? (
            <div className="empty-state compact">
              <strong>输入招聘问题后开始检索。</strong>
              <span>当前阶段使用关键词 / 简单相似度检索模拟 RAG 流程。</span>
            </div>
          ) : (
            <div className="rag-result">
              <div className={`confidence ${ragResult.confidence}`}>
                置信提示：{getConfidenceLabel(ragResult.confidence)}
              </div>
              <div className="answer-sections">
                <section className="answer-card">
                  <h3>基于知识库的结论</h3>
                  <p>{ragResult.answerSections.conclusion}</p>
                </section>
                <section className="answer-card">
                  <h3>引用依据</h3>
                  <p>{ragResult.answerSections.evidence}</p>
                </section>
                <section className="answer-card">
                  <h3>AI 补充建议</h3>
                  <p>{ragResult.answerSections.suggestion}</p>
                </section>
                <section className="answer-card warning-card">
                  <h3>不确定项 / 需人工确认</h3>
                  <p>{ragResult.answerSections.uncertainty}</p>
                </section>
              </div>
              <section className="citation-list">
                <h3>引用来源</h3>
                {ragResult.citations.length === 0 ? (
                  <p className="no-evidence">知识库中未找到足够依据，建议补充相关资料后再提问。</p>
                ) : (
                  ragResult.citations.map((citation) => (
                    <article key={citation.chunkId} className="citation-card">
                      <div className="citation-meta">
                        <strong>{citation.documentTitle}</strong>
                        <span>{knowledgeDocumentTypeLabels[citation.documentType]}</span>
                        <span>{citation.chunkId}</span>
                      </div>
                      <p>{renderHighlightedText(citation.quote, ragResult.matchedKeywords)}</p>
                    </article>
                  ))
                )}
              </section>
              <section className="chunk-preview">
                <h3>命中的知识片段</h3>
                {ragResult.matchedChunks.length === 0 ? (
                  <p className="no-evidence">没有命中片段。</p>
                ) : (
                  ragResult.matchedChunks.map((chunk) => (
                    <article key={chunk.id} className="chunk-card">
                      <strong>{chunk.documentTitle} · {knowledgeDocumentTypeLabels[chunk.documentType]}</strong>
                      <p>{renderHighlightedText(chunk.content, ragResult.matchedKeywords)}</p>
                    </article>
                  ))
                )}
              </section>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

function getConfidenceLabel(confidence: RagQuery['confidence']) {
  if (confidence === 'high') return '高：找到多个相关片段，可作为较强依据。'
  if (confidence === 'medium') return '中：找到部分相关片段，可作为初步参考。'
  if (confidence === 'low') return '低：依据不足，仅能作为提示。'
  return '无：知识库中未找到足够依据，不能生成确定结论。'
}

function renderHighlightedText(text: string, keywords: string[]) {
  const effectiveKeywords = Array.from(
    new Set(keywords.filter((keyword) => keyword.length >= 3 || /^[a-z0-9+#.]+$/i.test(keyword))),
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, 12)

  if (effectiveKeywords.length === 0) return text

  const pattern = new RegExp(`(${effectiveKeywords.map(escapeRegExp).join('|')})`, 'gi')
  return text.split(pattern).map((part, index) => {
    const isMatch = effectiveKeywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase())
    return isMatch ? <mark key={`${part}-${index}`}>{part}</mark> : part
  })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function MvpNotes({
  settings,
  onSettingsChange,
}: {
  settings: AiSettings
  onSettingsChange: (settings: AiSettings) => void
}) {
  function updateSetting<K extends keyof AiSettings>(key: K, value: AiSettings[K]) {
    onSettingsChange({ ...settings, [key]: value })
  }

  return (
    <section className="panel notes">
      <h2>TalentFlow AI 内部试用版说明</h2>
      <p>
        本项目是为 AI 产品经理（Vibe Coding 方向）岗位定制的 HR 招聘分析 Agent 自动化工作流 MVP，用于展示需求拆解、产品流程设计、AI Agent
        工作流、RAG 引用依据、AI 输出边界和快速落地能力。
      </p>
      <p className="loop-copy">
        产品闭环：候选人录入 → 简历导入 → JD 分析 → 招聘知识库 RAG → Agent 初筛 / 追问 / 面试后评审 → HR 人工确认 → 报告沉淀 → 数据看板复盘。
      </p>
      <section className="ai-settings">
        <div>
          <h3>AI API 试用模式</h3>
          <p>
            当前支持 Mock AI、默认 AI 服务代理和自定义 API Key 三种模式，可根据演示场景切换。
          </p>
        </div>
        <div className="mode-options">
          <label>
            <input
              type="radio"
              name="ai-mode"
              checked={settings.mode === 'mock'}
              onChange={() => updateSetting('mode', 'mock')}
            />
            Mock AI
          </label>
          <label>
            <input
              type="radio"
              name="ai-mode"
              checked={settings.mode === 'default'}
              onChange={() => updateSetting('mode', 'default')}
            />
            默认 AI 服务
          </label>
          <label>
            <input
              type="radio"
              name="ai-mode"
              checked={settings.mode === 'custom'}
              onChange={() => updateSetting('mode', 'custom')}
            />
            自定义 API Key
          </label>
        </div>
        {settings.mode === 'default' && (
          <div className="settings-grid single-setting">
            <label>
              默认代理地址
              <input
                value={settings.defaultProxyUrl}
                onChange={(event) => updateSetting('defaultProxyUrl', event.target.value)}
                placeholder="https://xxx.workers.dev/analyze"
              />
            </label>
          </div>
        )}
        {settings.mode === 'custom' && (
          <div className="settings-grid">
            <label>
              API Key
              <input
                type="password"
                value={settings.apiKey}
                onChange={(event) => updateSetting('apiKey', event.target.value)}
                placeholder="仅保存在当前浏览器 localStorage"
              />
            </label>
            <label>
              Base URL
              <input
                value={settings.baseUrl}
                onChange={(event) => updateSetting('baseUrl', event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              Model
              <input
                value={settings.model}
                onChange={(event) => updateSetting('model', event.target.value)}
                placeholder="deepseek-chat / gpt-4o-mini"
              />
            </label>
          </div>
        )}
        <p className="settings-note">
          {settings.mode === 'mock' &&
            '不调用真实模型，仅使用本地规则模拟 AI 分析流程。'}
          {settings.mode === 'default' &&
            '默认 AI 服务通过 Cloudflare Worker 代理调用，前端只发送简历、JD 和面试评价等业务数据，不保存也不暴露 DeepSeek API Key。'}
          {settings.mode === 'custom' &&
            '仅用于本地演示，API Key 保存在当前浏览器 localStorage，不建议用于正式环境。'}
        </p>
      </section>
      <div className="notes-grid">
        <div>
          <h3>当前已覆盖</h3>
          <ul>
            <li>候选人库表格管理、搜索筛选、详情查看、归档和状态更新</li>
            <li>面试安排、面试评价、报到时间、试用期状态和关键时间记录</li>
            <li>txt / docx / pdf 简历文本在浏览器本地解析，不上传服务器</li>
            <li>前端本地基础信息抽取，可识别姓名、手机号、邮箱、求职意向和技能关键词</li>
            <li>JD 匹配分析、Mock / 默认代理 / 自定义 Key 三种 AI 分析模式</li>
            <li>默认 AI 服务代理模式，前端不暴露 DeepSeek API Key</li>
            <li>编辑关键字段后标记 AI 分析可能过期，由用户手动重新生成</li>
            <li>招聘流程漏斗、来源质量、岗位、周度、月度招聘数据分析</li>
            <li>招聘知识库 RAG MVP，支持文档管理、文本切片、关键词 / 简单相似度 / 文档类型加权 Hybrid 检索、带引用来源的问答兜底</li>
            <li>招聘分析 Agent 工作台，支持 JD 分析、候选人初筛、面试追问生成和面试后评审 4 个固定工作流</li>
            <li>Agent 执行步骤、RAG 引用来源、AI 辅助评审报告、HR 人工确认和报告沉淀</li>
            <li>localStorage 本地试用模式，Supabase Auth / Database 内部试用模式</li>
          </ul>
        </div>
        <div>
          <h3>当前边界</h3>
          <ul>
            <li>不是商业化 SaaS，不做多租户、计费和复杂组织架构</li>
            <li>权限能力处于内部试用阶段，暂未完整实现面试官 / 管理者协作流程</li>
            <li>简历解析以浏览器本地文本提取为主，暂未接生产级文件存储和审计</li>
            <li>招聘知识库当前使用关键词 / 简单相似度 / 文档类型加权 Hybrid 检索 MVP，暂未接企业级向量数据库</li>
            <li>Agent 当前为结构化 Mock 工作流，不执行最终录用决策、流程终止或候选人通知动作</li>
            <li>操作日志、通知中心和隐私合规流程仍需后续完善</li>
            <li>不使用真实候选人隐私数据做公开演示</li>
            <li>不允许将真实 API Key 写入前端代码或 GitHub 仓库</li>
          </ul>
        </div>
        <div>
          <h3>后续扩展</h3>
          <ul>
            <li>接入 Supabase Storage，安全保存 PDF / DOCX 简历文件</li>
            <li>完善 operation_logs 操作记录和后台审计查看</li>
            <li>细化 admin / hr / interviewer 权限和 RLS 策略</li>
            <li>通过 Cloudflare Worker 或后端统一代理真实 AI API</li>
            <li>招聘知识库可升级为 Supabase pgvector / Chroma / Pinecone 语义检索，并接入候选人 AI 评审依据选择</li>
            <li>AgentRun / AgentReport 可接入 Supabase Database、RLS、操作日志和面试官协作流程</li>
            <li>增加面试官在线评价和管理者招聘进度看板</li>
            <li>对接企业微信 / 飞书通知</li>
            <li>增强候选人隐私保护、数据脱敏和访问日志</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

function CandidateForm({
  candidate,
  onClose,
  onSubmit,
  isAnalyzing,
}: {
  candidate: Candidate | null
  onClose: () => void
  onSubmit: (draft: CandidateDraft) => Promise<void>
  isAnalyzing: boolean
}) {
  const [draft, setDraft] = useState<CandidateDraft>(() =>
    candidate
      ? {
          name: candidate.name,
          phone: candidate.phone,
          email: candidate.email,
          targetRole: candidate.targetRole,
          resumeText: candidate.resumeText,
          resumeFileName: candidate.resumeFileName,
          resumeImportType: candidate.resumeImportType ?? 'paste',
          resumeParsedInfo: candidate.resumeParsedInfo ?? {},
          resumeImportedAt: candidate.resumeImportedAt,
          statusUpdatedAt: candidate.statusUpdatedAt,
          aiUpdatedAt: candidate.aiUpdatedAt,
          aiStale: candidate.aiStale,
          jdText: candidate.jdText,
          source: candidate.source,
          interviewer: candidate.interviewer,
          interviewTime: candidate.interviewTime,
          status: candidate.status,
          interviewRating: candidate.interviewRating,
          interviewFeedback: candidate.interviewFeedback,
          resultNote: candidate.resultNote,
          onboardDate: candidate.onboardDate,
          probationStatus: candidate.probationStatus,
          isArchived: Boolean(candidate.isArchived),
        }
      : emptyDraft,
  )
  const [selectedResumeFile, setSelectedResumeFile] = useState<File | null>(null)
  const [resumeParseError, setResumeParseError] = useState('')
  const [resumeExtractedLabels, setResumeExtractedLabels] = useState<string[]>([])
  const [isParsingResume, setIsParsingResume] = useState(false)

  function update<K extends keyof CandidateDraft>(key: K, value: CandidateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function handleResumeFile(file?: File) {
    if (!file) return
    setSelectedResumeFile(file)
    setResumeParseError('')
    setResumeExtractedLabels([])
    update('resumeFileName', file.name)
    update('resumeImportType', 'upload')
  }

  async function parseSelectedResume() {
    if (!selectedResumeFile) {
      setResumeParseError('请先选择 .txt / .docx / .pdf 简历文件。')
      return
    }

    setIsParsingResume(true)
    setResumeParseError('')
    try {
      const result = await parseResumeFile(selectedResumeFile)
      const parsedAt = new Date().toISOString()
      if (!result.text) {
        throw new Error('未能从文件中提取到有效文本，请检查文件内容或使用模拟解析兜底。')
      }
      const extractedInfo = extractResumeInfo(result.text)
      setResumeExtractedLabels(getExtractedFieldLabels(extractedInfo))
      setDraft((current) => ({
        ...current,
        name: current.name || extractedInfo.name || '',
        phone: current.phone || extractedInfo.phone || '',
        email: current.email || extractedInfo.email || '',
        targetRole: shouldUseExtractedPosition(current.targetRole) ? extractedInfo.position || current.targetRole : current.targetRole,
        resumeFileName: result.fileName,
        resumeImportType: 'file',
        resumeImportedAt: parsedAt,
        resumeParsedInfo: {
          educationSummary: extractedInfo.educationSummary,
          skills: extractedInfo.skills,
          projectSummary: extractedInfo.projectSummary,
        },
        resumeText: result.text,
      }))
    } catch (error) {
      setResumeParseError(error instanceof Error ? error.message : '简历解析失败，请使用模拟解析内容兜底。')
    } finally {
      setIsParsingResume(false)
    }
  }

  function simulateResumeParse() {
    const fileName = draft.resumeFileName || `${draft.name || '候选人'}_模拟简历.docx`
    const parsedResume = [
      `${draft.name || '候选人'}，应聘${draft.targetRole}。`,
      '简历显示其具备项目推进、跨团队协作和业务流程梳理经验。',
      draft.targetRole.includes('AI') ? '参与过 AI 工具、知识库或智能化流程相关项目。' : '有相关岗位项目经验，能结合业务目标推进交付。',
      '熟悉需求分析、数据复盘和结果跟进，适合进入结构化面试验证。',
    ].join('\n')

    const extractedInfo = extractResumeInfo(parsedResume)
    const parsedAt = new Date().toISOString()
    setResumeExtractedLabels(getExtractedFieldLabels(extractedInfo))
    setDraft((current) => ({
      ...current,
      name: current.name || extractedInfo.name || '',
      phone: current.phone || extractedInfo.phone || '',
      email: current.email || extractedInfo.email || '',
      targetRole: shouldUseExtractedPosition(current.targetRole) ? extractedInfo.position || current.targetRole : current.targetRole,
      resumeFileName: fileName,
      resumeImportType: 'mock_parse',
      resumeImportedAt: parsedAt,
      resumeParsedInfo: {
        educationSummary: extractedInfo.educationSummary,
        skills: extractedInfo.skills,
        projectSummary: extractedInfo.projectSummary,
      },
      resumeText: parsedResume,
    }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onSubmit(draft)
  }

  function shouldUseExtractedPosition(currentPosition: string) {
    return !currentPosition.trim() || currentPosition === emptyDraft.targetRole
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>{candidate ? '编辑候选人' : '新增候选人'}</h2>
            <p>保存后将基于简历文本生成一版 AI 辅助分析。</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="form-grid">
          <label>
            姓名
            <input required value={draft.name} onChange={(event) => update('name', event.target.value)} />
          </label>
          <label>
            应聘岗位
            <input required value={draft.targetRole} onChange={(event) => update('targetRole', event.target.value)} />
          </label>
          <label>
            手机
            <input value={draft.phone} onChange={(event) => update('phone', event.target.value)} />
          </label>
          <label>
            邮箱
            <input value={draft.email} onChange={(event) => update('email', event.target.value)} />
          </label>
          <label>
            来源
            <input value={draft.source} onChange={(event) => update('source', event.target.value)} />
          </label>
          <label>
            面试官
            <input value={draft.interviewer} onChange={(event) => update('interviewer', event.target.value)} />
          </label>
          <label>
            面试时间
            <input type="datetime-local" value={draft.interviewTime} onChange={(event) => update('interviewTime', event.target.value)} />
          </label>
          <label>
            面试结果
            <select value={draft.status} onChange={(event) => update('status', event.target.value as CandidateStatus)}>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {candidate && (
            <label>
              评分
              <input
                type="number"
                min="1"
                max="5"
                placeholder="待评价"
                value={draft.interviewRating ?? ''}
                onChange={(event) => update('interviewRating', event.target.value ? Number(event.target.value) : undefined)}
              />
            </label>
          )}
          <label>
            报到时间
            <input type="date" value={draft.onboardDate} onChange={(event) => update('onboardDate', event.target.value)} />
          </label>
          <label>
            试用期情况
            <select value={draft.probationStatus} onChange={(event) => update('probationStatus', event.target.value as ProbationStatus)}>
              {Object.entries(probationLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="resume-upload">
          <div>
            <h3>简历上传/导入</h3>
            <p>当前为前端 MVP，可解析 txt/docx/pdf 文本内容；正式版建议通过后端解析并存储简历文件。</p>
          </div>
          <div className="upload-row">
            <input
              type="file"
              accept=".txt,.pdf,.doc,.docx"
              onChange={(event) => handleResumeFile(event.target.files?.[0])}
            />
            <button className="secondary" type="button" onClick={parseSelectedResume} disabled={isParsingResume}>
              {isParsingResume ? '解析中' : '解析简历'}
            </button>
          </div>
          <span className="file-name">当前文件：{draft.resumeFileName || '未选择文件'}</span>
          {resumeExtractedLabels.length > 0 && (
            <div className="extract-success">已从简历中提取：{resumeExtractedLabels.join('、')}</div>
          )}
          {resumeParseError && (
            <div className="parse-error">
              <span>{resumeParseError}</span>
              <button className="secondary" type="button" onClick={simulateResumeParse}>
                使用模拟解析内容
              </button>
            </div>
          )}
        </section>

        <label className="wide-field">
          岗位要求/JD 文本
          <textarea
            rows={4}
            value={draft.jdText ?? ''}
            onChange={(event) => update('jdText', event.target.value)}
            placeholder="粘贴岗位职责、任职要求或 JD 关键内容"
          />
        </label>

        <label className="wide-field">
          简历文本
          <textarea required rows={5} value={draft.resumeText} onChange={(event) => update('resumeText', event.target.value)} />
        </label>
        <label className="wide-field">
          面试评价
          <textarea rows={4} value={draft.interviewFeedback} onChange={(event) => update('interviewFeedback', event.target.value)} />
        </label>
        <label className="wide-field">
          结果备注
          <input value={draft.resultNote} onChange={(event) => update('resultNote', event.target.value)} />
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="submit" disabled={isAnalyzing}>
            {isAnalyzing ? '分析中' : '保存候选人'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Metric({ label, value, hint, tone }: { label: string; value: string | number; hint: string; tone?: 'risk' }) {
  return (
    <div className={tone === 'risk' ? 'metric risk' : 'metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  )
}

function StatusBadge({ status }: { status: CandidateStatus }) {
  return <span className={`status ${status}`}>{statusLabels[status]}</span>
}

function ArchiveBadge() {
  return <span className="archive-badge">已归档</span>
}

function ProbationBadge({ status }: { status?: ProbationStatus }) {
  const normalizedStatus = status ?? 'not_started'
  return <span className={`probation-badge ${normalizedStatus}`}>试用期：{probationLabels[normalizedStatus]}</span>
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="info-block">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export default App
