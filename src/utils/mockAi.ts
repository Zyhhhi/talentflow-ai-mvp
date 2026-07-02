import type { Candidate } from '../types/candidate'

type AnalysisResult = Pick<
  Candidate,
  'strengths' | 'weaknesses' | 'risks' | 'aiQuestions' | 'matchScore' | 'nextRoundRecommendation' | 'recommendedConclusion'
>

const roleQuestions: Record<string, string[]> = {
  'AI 产品经理': [
    '请拆解一个 AI 产品从需求识别到上线验证的完整流程。',
    '当 AI 输出不稳定时，你会如何设计人工兜底和风险提示？',
  ],
  前端工程师: [
    '请说明你如何设计一个可维护的 B 端表格和筛选系统。',
    '当页面数据较多时，你会如何优化性能和交互反馈？',
  ],
  数据分析师: [
    '你会如何定义岗位面试转化率和到岗率的分析口径？',
    '如果周度数据波动异常，你会如何定位原因？',
  ],
  HRBP: [
    '你会如何沉淀不同岗位的人才画像？',
    '如何推动业务面试官及时、结构化地提交评价？',
  ],
}

export function analyzeCandidate(
  candidate: Pick<Candidate, 'targetRole' | 'resumeText'> & Partial<Pick<Candidate, 'jdText' | 'interviewFeedback'>>,
): AnalysisResult {
  const resumeText = candidate.resumeText.trim()
  const normalizedResume = resumeText.toLowerCase()
  const normalizedJd = (candidate.jdText ?? '').trim().toLowerCase()
  const normalizedFeedback = (candidate.interviewFeedback ?? '').trim().toLowerCase()

  if (!hasUsefulResumeText(resumeText)) {
    return {
      strengths: ['简历信息不足，暂不生成优势判断'],
      weaknesses: ['缺少简历文本，无法判断候选人的经验、能力和岗位匹配度'],
      risks: ['当前 AI 分析需要基于简历文本、JD 文本和面试评价综合生成；请先补充简历后重新分析'],
      aiQuestions: ['请先补充候选人的简历文本，再生成针对性的面试追问。'],
      matchScore: 0,
      nextRoundRecommendation: '暂不建议进入下一轮',
      recommendedConclusion: '待补充简历',
    }
  }

  const text = `${normalizedResume} ${normalizedJd} ${normalizedFeedback}`
  const strengths: string[] = []
  const weaknesses: string[] = []
  const risks: string[] = []
  let score = 55

  if (text.includes('ai') || text.includes('大模型') || text.includes('agent')) {
    strengths.push('具备 AI 应用或智能化项目相关经验')
    score += 10
  }
  if (text.includes('b 端') || text.includes('后台') || text.includes('系统')) {
    strengths.push('有企业级系统或 B 端业务理解')
    score += 8
  }
  if (text.includes('数据') || text.includes('指标') || text.includes('sql')) {
    strengths.push('具备数据分析和指标拆解意识')
    score += 8
  }
  if (text.includes('协作') || text.includes('跨团队') || text.includes('推进')) {
    strengths.push('有跨团队协作和项目推进经验')
    score += 6
  }
  if (normalizedJd && hasKeywordOverlap(normalizedResume, normalizedJd)) {
    strengths.push('简历关键词与 JD 要求存在匹配')
    score += 8
  }
  if (normalizedFeedback.includes('扎实') || normalizedFeedback.includes('通过') || normalizedFeedback.includes('推荐')) {
    strengths.push('面试评价中出现正向反馈')
    score += 6
  }

  if (!normalizedResume.includes('ai') && candidate.targetRole.includes('AI')) {
    weaknesses.push('AI 产品实践信息不足，需要追问真实项目深度')
    score -= 8
  }
  if (!normalizedResume.includes('数据') && !normalizedResume.includes('指标')) {
    weaknesses.push('简历中数据复盘和量化结果描述不足')
    score -= 6
  }
  if (!normalizedResume.includes('协作') && !normalizedResume.includes('推进')) {
    weaknesses.push('跨团队推进案例不明显')
    score -= 5
  }
  if (!normalizedJd) {
    weaknesses.push('缺少岗位要求/JD，匹配度判断仍偏粗略')
    score -= 5
  }
  if (normalizedFeedback.includes('风险') || normalizedFeedback.includes('不足') || normalizedFeedback.includes('一般')) {
    risks.push('面试评价中存在负向信号，需要复核是否影响岗位胜任')
    score -= 6
  }

  risks.push('需要通过结构化追问确认简历描述和实际负责范围是否一致')
  if (weaknesses.length > 1) {
    risks.push('岗位匹配度存在不确定性，建议增加业务场景题验证')
  }

  const matchScore = Math.max(0, Math.min(95, score))
  const nextRoundRecommendation = matchScore >= 75 ? '建议进入下一轮' : matchScore >= 60 ? '谨慎进入下一轮' : '暂不建议进入下一轮'
  const recommendedConclusion = matchScore >= 75 ? '建议通过' : matchScore >= 60 ? '待补充面试验证' : '建议暂缓'

  return {
    strengths: strengths.length ? strengths : ['基础经历与岗位存在一定相关性'],
    weaknesses: weaknesses.length ? weaknesses : ['暂未发现明显短板，建议面试中继续验证深度'],
    risks,
    aiQuestions: roleQuestions[candidate.targetRole] ?? [
      '请介绍一个你最能体现岗位匹配度的项目。',
      '如果入职后负责该岗位，你前三周会如何展开工作？',
    ],
    matchScore,
    nextRoundRecommendation,
    recommendedConclusion,
  }
}

export function hasUsefulResumeText(value: string) {
  const normalized = value.trim().toLowerCase()
  return Boolean(normalized) && !['无', '暂无', '没有', '未填写', 'none', 'n/a', 'na', '-'].includes(normalized)
}

function hasKeywordOverlap(resume: string, jd: string) {
  const keywords = ['ai', '大模型', 'agent', '数据', '指标', 'b 端', '后台', '协作', '推进', 'react', 'typescript', 'sql']
  return keywords.some((keyword) => resume.includes(keyword) && jd.includes(keyword))
}
