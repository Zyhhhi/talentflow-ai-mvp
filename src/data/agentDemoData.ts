import type { Candidate } from '../types/candidate'
import type { KnowledgeDocumentType } from '../types/knowledge'

export type DemoKnowledgeDocumentInput = {
  id: string
  title: string
  type: KnowledgeDocumentType
  content: string
}

export const agentDemoKnowledgeDocuments: DemoKnowledgeDocumentInput[] = [
  {
    id: 'demo-doc-ai-pm-jd',
    title: 'AI 产品经理 JD',
    type: 'JD',
    content: [
      '岗位职责：负责 AI 产品从 0 到 1 的需求拆解、业务流程梳理、MVP 范围定义、原型设计、验收标准制定和迭代复盘。',
      '需要能够围绕真实业务场景判断是否适合引入大模型能力，设计 Prompt 结构化输出、人机审核机制、Mock 兜底和风险边界。',
      '候选人需要理解候选人资料、岗位 JD、知识库依据之间的关系，能把 AI 分析能力落到可演示、可验证的产品工作流中。',
      '必备能力包括用户场景拆解、流程设计、PRD 表达、跨团队沟通、数据看板意识和基础 AI 工具链使用经验。',
      '加分项包括熟悉 RAG 产品设计、AI Agent 工作流、Supabase / Cloudflare Worker 等基础落地边界，以及对 API Key 安全有明确意识。',
    ].join('\n\n'),
  },
  {
    id: 'demo-doc-ai-pm-profile',
    title: 'AI 产品经理岗位画像',
    type: 'role_profile',
    content: [
      '岗位画像：优秀的初级 AI 产品经理应能把业务问题拆成用户、场景、输入、处理流程、输出结果和人工确认节点。',
      '该岗位不要求候选人承担研发工程师职责，但需要能使用 GPT、Codex、Claude Code 或 Cursor 快速推动 MVP 原型落地。',
      '重点观察候选人是否能说明为什么做某个功能、如何定义 MVP 边界、如何设计验收标准，以及如何处理模型输出不稳定。',
      '候选人如果只强调工具堆叠或代码实现，而无法解释业务流程、风险边界和人工审核机制，需要进一步追问。',
      '面试时应关注其是否有可访问作品、是否能讲清项目从需求到上线的流程、是否有真实反馈或可验证交付物。',
    ].join('\n\n'),
  },
  {
    id: 'demo-doc-ai-pm-interview',
    title: 'AI 产品面试标准',
    type: 'interview_standard',
    content: [
      '面试标准：第一，验证业务理解能力，要求候选人能清楚说明目标用户、核心场景、痛点和替代方案。',
      '第二，验证 AI 工作流设计能力，要求候选人能说明输入资料、检索依据、模型分析、结构化输出和人工确认之间的关系。',
      '第三，验证产品边界意识，要求候选人能主动说明 AI 只是辅助建议，不替代 HR、面试官或业务负责人做最终判断。',
      '第四，验证 MVP 落地能力，要求候选人能讲清如何用低成本方式完成可体验版本、如何处理 Mock 数据和异常兜底。',
      '第五，验证复盘能力，要求候选人能说明项目上线或试用后如何收集反馈、如何调整流程和指标。',
    ].join('\n\n'),
  },
  {
    id: 'demo-doc-probation-focus',
    title: 'AI 产品岗位试用期关注点',
    type: 'probation_standard',
    content: [
      '试用期关注点：入职 7 天内观察候选人是否能快速理解业务流程、关键角色和当前产品资料。',
      '入职 14 天内观察候选人是否能独立完成需求拆解、流程图、原型说明和验收标准草案。',
      '入职 30 天内观察候选人是否能推动一个小型 AI MVP 或功能迭代，并说明数据反馈、风险边界和后续优化方向。',
      '如果候选人在业务拆解、跨团队沟通、AI 输出边界或交付节奏上持续依赖他人，需要 HR 和用人部门及时复盘。',
      '试用期评价不应只看工具使用速度，还应关注问题定义、产品判断、风险意识和结果沉淀能力。',
    ].join('\n\n'),
  },
]

export const agentDemoCandidates: Candidate[] = [
  {
    id: 'demo-cand-ai-pm-strong',
    name: '周以恒',
    phone: '138****2607',
    email: 'yiheng.zhou@example.com',
    targetRole: 'AI 产品经理',
    resumeText:
      '电子信息工程背景，已完成招聘人才库、岗位匹配、ETF 数据分析等多个 AI MVP。熟悉需求拆解、MVP 边界、Prompt 结构化输出、人机审核机制和可体验原型交付。曾独立上线公考刷题小程序，能使用 Codex、Claude Code、Cursor、GitHub Pages、Supabase 和 Cloudflare Worker 完成基础落地。',
    resumeFileName: '周以恒_AI产品经理_简历.pdf',
    resumeImportType: 'mock_parse',
    resumeParsedInfo: {
      educationSummary: '本科，电子信息工程，具备软件工程、Python、嵌入式和产品原型基础。',
      skills: ['AI MVP', '需求拆解', 'Prompt 结构化输出', 'RAG 产品设计', '数据看板'],
      projectSummary: '完成 TalentFlow AI、简岗配、ETF-Agent、公考刷题小程序等项目。',
    },
    jdText: agentDemoKnowledgeDocuments[0].content,
    source: '作品集投递',
    interviewer: '产品负责人',
    interviewTime: '2026-07-10T10:00',
    status: 'scheduled',
    interviewRating: 4,
    interviewFeedback: '项目完整度较高，能说明 AI 输出边界和人工确认机制，需继续验证复杂业务抽象能力。',
    strengths: ['AI MVP 交付经验完整', '能说明业务流程和风险边界', '有可访问作品集和上线项目'],
    weaknesses: ['企业级系统经验有限', '需要继续验证跨团队推动经验'],
    risks: ['可能缺少正式企业内部协作经验，需要通过结构化问题确认'],
    aiQuestions: ['请拆解 TalentFlow 从候选人库到 Agent 报告的完整流程。', '当知识库依据不足时，你会如何设计兜底？'],
    matchScore: 84,
    nextRoundRecommendation: '建议进入下一轮',
    recommendedConclusion: '建议进入下一轮面试验证',
    resultNote: '演示候选人，高匹配度样例',
    probationStatus: 'not_started',
    createdAt: '2026-07-08T09:20:00',
    updatedAt: '2026-07-08T09:20:00',
  },
  {
    id: 'demo-cand-ai-pm-mid',
    name: '陈若安',
    phone: '137****8112',
    email: 'ruoan.chen@example.com',
    targetRole: 'AI 产品经理',
    resumeText:
      '2 年内容产品经验，参与过后台配置、运营活动和数据复盘。近期学习 AI 产品设计，做过简单 Prompt 工具和网页原型，能完成用户访谈和竞品分析，但缺少完整 AI 工作流和 RAG 场景落地经验。',
    resumeFileName: '陈若安_AI产品经理_简历.docx',
    resumeImportType: 'mock_parse',
    resumeParsedInfo: {
      educationSummary: '本科，信息管理与信息系统。',
      skills: ['用户访谈', '竞品分析', '原型设计', '数据复盘'],
      projectSummary: '参与内容运营后台和 Prompt 小工具原型。',
    },
    jdText: agentDemoKnowledgeDocuments[0].content,
    source: 'Boss 直聘',
    interviewer: '产品负责人',
    interviewTime: '2026-07-11T15:00',
    status: 'new',
    interviewRating: 3,
    interviewFeedback: '基础产品能力尚可，但 AI 工作流、RAG 引用依据和工程化落地边界需要重点追问。',
    strengths: ['基础产品方法较完整', '有运营和数据复盘经验'],
    weaknesses: ['AI 工作流项目经验较弱', 'RAG 和模型输出边界理解需要验证'],
    risks: ['短期独立负责 AI MVP 可能需要较多指导'],
    aiQuestions: ['请说明你会如何判断一个运营问题是否适合引入 AI。', '请设计一个带人工审核的 Prompt 输出流程。'],
    matchScore: 63,
    nextRoundRecommendation: '建议谨慎推进',
    recommendedConclusion: '建议补充面试验证',
    resultNote: '演示候选人，中等匹配度样例',
    probationStatus: 'not_started',
    createdAt: '2026-07-08T09:30:00',
    updatedAt: '2026-07-08T09:30:00',
  },
]
