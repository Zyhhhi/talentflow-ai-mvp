import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Candidate, CandidateDraft, CandidateStatus, ProbationStatus } from './types/candidate'
import { probationLabels, statusLabels } from './types/candidate'
import { loadCandidates, resetCandidates, saveCandidates } from './utils/storage'
import { analyzeCandidate } from './utils/mockAi'
import { getOverview, getPeriodAnalytics, getRoleAnalytics } from './utils/analytics'

type ViewKey = 'dashboard' | 'candidates' | 'pipeline' | 'ai' | 'analytics' | 'notes'

const navigation: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'dashboard', label: '工作台', icon: '⌂' },
  { key: 'candidates', label: '候选人库', icon: '▦' },
  { key: 'pipeline', label: '面试流程', icon: '↳' },
  { key: 'ai', label: 'AI 分析', icon: '✦' },
  { key: 'analytics', label: '数据看板', icon: '◫' },
  { key: 'notes', label: 'MVP 说明', icon: 'i' },
]

const emptyDraft: CandidateDraft = {
  name: '',
  phone: '',
  email: '',
  targetRole: 'AI 产品经理',
  resumeText: '',
  source: 'Boss 直聘',
  interviewer: '',
  interviewTime: '',
  status: 'new',
  interviewFeedback: '',
  resultNote: '',
  onboardDate: '',
  probationStatus: 'not_started',
}

function App() {
  const [candidates, setCandidates] = useState<Candidate[]>(() => loadCandidates())
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('全部岗位')
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | 'all'>('all')
  const [editing, setEditing] = useState<Candidate | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0]
  const overview = useMemo(() => getOverview(candidates), [candidates])
  const roleAnalytics = useMemo(() => getRoleAnalytics(candidates), [candidates])
  const weeklyAnalytics = useMemo(() => getPeriodAnalytics(candidates, 'week'), [candidates])
  const monthlyAnalytics = useMemo(() => getPeriodAnalytics(candidates, 'month'), [candidates])
  const roles = useMemo(() => ['全部岗位', ...Array.from(new Set(candidates.map((candidate) => candidate.targetRole)))], [candidates])

  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return candidates.filter((candidate) => {
      const matchesQuery =
        !normalizedQuery ||
        [candidate.name, candidate.targetRole, candidate.interviewer, candidate.source]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesRole = roleFilter === '全部岗位' || candidate.targetRole === roleFilter
      const matchesStatus = statusFilter === 'all' || candidate.status === statusFilter
      return matchesQuery && matchesRole && matchesStatus
    })
  }, [candidates, query, roleFilter, statusFilter])

  function persist(nextCandidates: Candidate[]) {
    setCandidates(nextCandidates)
    saveCandidates(nextCandidates)
    if (!nextCandidates.some((candidate) => candidate.id === selectedId)) {
      setSelectedId(nextCandidates[0]?.id ?? '')
    }
  }

  function upsertCandidate(draft: CandidateDraft, id?: string) {
    const now = new Date().toISOString()
    const ai = analyzeCandidate({ targetRole: draft.targetRole, resumeText: draft.resumeText })
    if (id) {
      const next = candidates.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              ...draft,
              ...ai,
              updatedAt: now,
            }
          : candidate,
      )
      persist(next)
      setSelectedId(id)
    } else {
      const candidate: Candidate = {
        ...draft,
        ...ai,
        id: `cand-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      }
      persist([candidate, ...candidates])
      setSelectedId(candidate.id)
    }
    setIsFormOpen(false)
    setEditing(null)
  }

  function updateCandidate(id: string, patch: Partial<Candidate>) {
    persist(
      candidates.map((candidate) =>
        candidate.id === id ? { ...candidate, ...patch, updatedAt: new Date().toISOString() } : candidate,
      ),
    )
  }

  function deleteCandidate(id: string) {
    if (!confirm('确认删除该候选人？演示数据会从本地浏览器中移除。')) return
    persist(candidates.filter((candidate) => candidate.id !== id))
  }

  function handleReset() {
    const next = resetCandidates()
    setCandidates(next)
    setSelectedId(next[0]?.id ?? '')
    setQuery('')
    setRoleFilter('全部岗位')
    setStatusFilter('all')
    setEditing(null)
    setIsFormOpen(false)
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
          <strong>演示模式</strong>
          <span>Mock 数据 + localStorage，不含真实候选人隐私数据。</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">HR 招聘工作台</p>
            <h1>{navigation.find((item) => item.key === activeView)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <button className="secondary" onClick={handleReset}>
              恢复默认演示数据
            </button>
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
            candidates={filteredCandidates}
            selectedCandidate={selectedCandidate}
            query={query}
            roleFilter={roleFilter}
            statusFilter={statusFilter}
            roles={roles}
            onQueryChange={setQuery}
            onRoleFilterChange={setRoleFilter}
            onStatusFilterChange={setStatusFilter}
            onSelect={setSelectedId}
            onEdit={(candidate) => {
              setEditing(candidate)
              setIsFormOpen(true)
            }}
            onDelete={deleteCandidate}
            onUpdate={updateCandidate}
          />
        )}

        {activeView === 'pipeline' && <PipelineView candidates={candidates} onUpdate={updateCandidate} onSelect={setSelectedId} />}

        {activeView === 'ai' && (
          <AiView
            candidates={candidates}
            selectedCandidate={selectedCandidate}
            onSelect={setSelectedId}
            onRefresh={(candidate) => updateCandidate(candidate.id, analyzeCandidate(candidate))}
          />
        )}

        {activeView === 'analytics' && (
          <AnalyticsView roleAnalytics={roleAnalytics} weeklyAnalytics={weeklyAnalytics} monthlyAnalytics={monthlyAnalytics} />
        )}

        {activeView === 'notes' && <MvpNotes />}
      </main>

      {isFormOpen && (
        <CandidateForm
          candidate={editing}
          onClose={() => {
            setIsFormOpen(false)
            setEditing(null)
          }}
          onSubmit={(draft) => upsertCandidate(draft, editing?.id)}
        />
      )}
    </div>
  )
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
  const upcoming = candidates
    .filter((candidate) => ['new', 'scheduled', 'interviewed', 'offer'].includes(candidate.status))
    .slice(0, 5)

  return (
    <section className="stack">
      <div className="metric-grid">
        <Metric label="候选人总数" value={overview.total} hint="当前人才库记录" />
        <Metric label="活跃流程" value={overview.active} hint="待安排、面试、结论和报到" />
        <Metric label="面试通过率" value={`${overview.passRate}%`} hint="通过 / 总候选人" />
        <Metric label="到岗转化率" value={`${overview.onboardRate}%`} hint="报到 / 已通过" />
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
            {upcoming.map((candidate) => (
              <button key={candidate.id} className="follow-item" onClick={() => onOpenCandidate(candidate.id)}>
                <div>
                  <strong>{candidate.name}</strong>
                  <span>{candidate.targetRole}</span>
                </div>
                <StatusBadge status={candidate.status} />
              </button>
            ))}
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
            <p>产品闭环：候选人录入 → 面试安排 → AI 优劣势分析 → 面试评价 → 结果跟进 → 报到/试用期记录 → 岗位与周/月度分析。</p>
            <p>AI 产品经理岗位候选人数量较多，建议统一追问 AI 工作流设计和落地案例。</p>
            <p>当前有 {overview.pendingFeedback} 位候选人待补充面试结论，可能影响周度复盘准确性。</p>
            <p>试用期风险人数为 {overview.probationRisk}，建议 HR 建立入职后 7/14/30 天跟进节奏。</p>
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
          {roleAnalytics.map((item) => (
            <div className="role-card" key={item.role}>
              <strong>{item.role}</strong>
              <span>{item.total} 人进入流程</span>
              <div className="progress-track">
                <div style={{ width: `${item.passRate}%` }} />
              </div>
              <small>通过率 {item.passRate}% · 到岗率 {item.onboardRate}%</small>
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

function CandidatesView(props: {
  candidates: Candidate[]
  selectedCandidate?: Candidate
  query: string
  roleFilter: string
  statusFilter: CandidateStatus | 'all'
  roles: string[]
  onQueryChange: (value: string) => void
  onRoleFilterChange: (value: string) => void
  onStatusFilterChange: (value: CandidateStatus | 'all') => void
  onSelect: (id: string) => void
  onEdit: (candidate: Candidate) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: Partial<Candidate>) => void
}) {
  return (
    <section className="content-grid">
      <div className="panel table-panel">
        <div className="filter-row">
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} placeholder="搜索姓名、岗位、面试官" />
          <select value={props.roleFilter} onChange={(event) => props.onRoleFilterChange(event.target.value)}>
            {props.roles.map((role) => (
              <option key={role}>{role}</option>
            ))}
          </select>
          <select
            value={props.statusFilter}
            onChange={(event) => props.onStatusFilterChange(event.target.value as CandidateStatus | 'all')}
          >
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>候选人</th>
                <th>岗位</th>
                <th>面试时间</th>
                <th>面试官</th>
                <th>状态 / 试用期</th>
                <th>评分</th>
              </tr>
            </thead>
            <tbody>
              {props.candidates.map((candidate) => (
                <tr
                  key={candidate.id}
                  className={props.selectedCandidate?.id === candidate.id ? 'selected' : ''}
                  onClick={() => props.onSelect(candidate.id)}
                >
                  <td>
                    <strong>{candidate.name}</strong>
                    <span>{candidate.source}</span>
                  </td>
                  <td>{candidate.targetRole}</td>
                  <td>{formatDateTime(candidate.interviewTime)}</td>
                  <td>{candidate.interviewer || '待安排'}</td>
                  <td>
                    <div className="status-stack">
                      <StatusBadge status={candidate.status} />
                      <ProbationBadge status={candidate.probationStatus} />
                    </div>
                  </td>
                  <td>{candidate.interviewRating ?? '-'} / 5</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {props.selectedCandidate && (
        <CandidateDetail
          candidate={props.selectedCandidate}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
          onUpdate={props.onUpdate}
        />
      )}
    </section>
  )
}

function CandidateDetail({
  candidate,
  onEdit,
  onDelete,
  onUpdate,
}: {
  candidate: Candidate
  onEdit: (candidate: Candidate) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, patch: Partial<Candidate>) => void
}) {
  const [resumeDraft, setResumeDraft] = useState(candidate.resumeText)

  useEffect(() => {
    setResumeDraft(candidate.resumeText)
  }, [candidate.id, candidate.resumeText])

  function saveResumeText() {
    const nextResumeText = resumeDraft.trim()
    onUpdate(candidate.id, {
      resumeText: nextResumeText,
      ...analyzeCandidate({ targetRole: candidate.targetRole, resumeText: nextResumeText }),
    })
  }

  return (
    <aside className="panel detail-panel">
      <div className="detail-head">
        <div>
          <h2>{candidate.name}</h2>
          <p>{candidate.targetRole}</p>
        </div>
        <StatusBadge status={candidate.status} />
      </div>

      <div className="action-row">
        <button className="secondary" onClick={() => onEdit(candidate)}>
          编辑
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

      <InfoBlock title="当前简历文本" items={[candidate.resumeText || '未填写']} />
      <InfoBlock title="AI 优势" items={candidate.strengths} />
      <InfoBlock title="不足与风险" items={[...candidate.weaknesses, ...candidate.risks]} />
      <InfoBlock title="建议追问" items={candidate.aiQuestions} />
      <InfoBlock title="面试评价" items={[candidate.interviewFeedback || '待补充面试评价']} />
    </aside>
  )
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
}: {
  candidates: Candidate[]
  selectedCandidate?: Candidate
  onSelect: (id: string) => void
  onRefresh: (candidate: Candidate) => void
}) {
  return (
    <section className="content-grid">
      <div className="panel list-panel">
        <div className="panel-header">
          <div>
            <h2>候选人</h2>
            <p>选择候选人查看 Mock AI 分析。</p>
          </div>
        </div>
        <div className="simple-list">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              className={selectedCandidate?.id === candidate.id ? 'active' : ''}
              onClick={() => onSelect(candidate.id)}
            >
              <strong>{candidate.name}</strong>
              <span>{candidate.targetRole}</span>
            </button>
          ))}
        </div>
      </div>
      {selectedCandidate && (
        <div className="panel ai-panel">
          <div className="panel-header">
            <div>
              <h2>{selectedCandidate.name} 的 AI 面试辅助</h2>
              <p>当前版本使用 Mock AI 规则模拟分析，正式版可接入真实 AI API，由后端代理保护 API Key。</p>
            </div>
            <button className="secondary" onClick={() => onRefresh(selectedCandidate)}>
              重新生成
            </button>
          </div>
          <div className="analysis-grid">
            <InfoBlock title="优势" items={selectedCandidate.strengths} />
            <InfoBlock title="不足" items={selectedCandidate.weaknesses} />
            <InfoBlock title="风险点" items={selectedCandidate.risks} />
            <InfoBlock title="追问问题" items={selectedCandidate.aiQuestions} />
          </div>
        </div>
      )}
    </section>
  )
}

function AnalyticsView({
  roleAnalytics,
  weeklyAnalytics,
  monthlyAnalytics,
}: {
  roleAnalytics: ReturnType<typeof getRoleAnalytics>
  weeklyAnalytics: ReturnType<typeof getPeriodAnalytics>
  monthlyAnalytics: ReturnType<typeof getPeriodAnalytics>
}) {
  return (
    <section className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>岗位面试情况分析</h2>
            <p>用于展示不同岗位的候选人数量、通过率和到岗率。</p>
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
                <th>已到岗</th>
                <th>通过率</th>
                <th>到岗率</th>
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
                {item.total} 人 · 通过 {item.passed} · 到岗 {item.onboarded}
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

function MvpNotes() {
  return (
    <section className="panel notes">
      <h2>TalentFlow AI MVP 边界</h2>
      <p>
        本项目是为 AI 产品经理（Vibe Coding 方向）岗位定制的第一版 MVP，用于展示基于真实业务场景的需求拆解、产品流程设计、AI
        工作流设计和快速原型落地能力。
      </p>
      <p className="loop-copy">
        产品闭环：候选人录入 → 面试安排 → AI 优劣势分析 → 面试评价 → 结果跟进 → 报到/试用期记录 → 岗位与周/月度分析。
      </p>
      <div className="notes-grid">
        <div>
          <h3>第一版已覆盖</h3>
          <ul>
            <li>候选人录入、编辑、删除和状态更新</li>
            <li>简历文本粘贴和面试信息维护</li>
            <li>当前版本使用 Mock 规则模拟 AI 分析，正式版可接入真实 AI API</li>
            <li>岗位、周度、月度招聘数据分析</li>
            <li>localStorage 本地保存和演示数据重置</li>
          </ul>
        </div>
        <div>
          <h3>暂不包含</h3>
          <ul>
            <li>登录、权限和多角色账号体系</li>
            <li>真实数据库和后端服务</li>
            <li>PDF / Word 简历上传解析</li>
            <li>真实候选人隐私数据</li>
            <li>前端代码中写死 API Key</li>
          </ul>
        </div>
        <div>
          <h3>后续扩展</h3>
          <ul>
            <li>接入服务端数据库和审计日志</li>
            <li>接入真实 AI API 和简历解析服务</li>
            <li>增加面试官协作和管理者看板</li>
            <li>对接企业微信 / 飞书通知</li>
            <li>支持 GitHub Pages 演示部署</li>
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
}: {
  candidate: Candidate | null
  onClose: () => void
  onSubmit: (draft: CandidateDraft) => void
}) {
  const [draft, setDraft] = useState<CandidateDraft>(() =>
    candidate
      ? {
          name: candidate.name,
          phone: candidate.phone,
          email: candidate.email,
          targetRole: candidate.targetRole,
          resumeText: candidate.resumeText,
          source: candidate.source,
          interviewer: candidate.interviewer,
          interviewTime: candidate.interviewTime,
          status: candidate.status,
          interviewRating: candidate.interviewRating,
          interviewFeedback: candidate.interviewFeedback,
          resultNote: candidate.resultNote,
          onboardDate: candidate.onboardDate,
          probationStatus: candidate.probationStatus,
        }
      : emptyDraft,
  )

  function update<K extends keyof CandidateDraft>(key: K, value: CandidateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(draft)
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
          <button className="primary" type="submit">
            保存候选人
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

function formatDateTime(value: string) {
  if (!value) return '待安排'
  return value.replace('T', ' ')
}

export default App
