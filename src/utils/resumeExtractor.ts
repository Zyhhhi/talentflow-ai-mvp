import { cleanResumeText } from './resumeParser'

export type ExtractedResumeInfo = {
  name?: string
  phone?: string
  email?: string
  position?: string
  educationSummary?: string
  skills?: string[]
  projectSummary?: string
}

const phonePattern = /(?<!\d)1[3-9]\d{9}(?!\d)/
const phoneGlobalPattern = /(?<!\d)1[3-9]\d{9}(?!\d)/g
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const urlPattern = /(https?:\/\/|www\.)\S+|github\.com\/\S+/gi
const positionStopPattern = /(电话|手机|手机号|联系方式|邮箱|邮件|Email|E-mail|GitHub|Github|作品集|个人主页|主页|链接|项目链接|博客)[:：\s]*/i
const positionLabelPattern = /(求职意向|应聘岗位|目标岗位|意向岗位|求职方向)/

const skillKeywords = [
  'AI 产品经理',
  'AI Builder',
  'Prompt',
  'Codex',
  'Claude Code',
  'DeepSeek',
  'React',
  'TypeScript',
  'Python',
  'SQL',
  '数据分析',
  'Agent',
  'MVP',
  'Supabase',
  'GitHub Pages',
]

export function extractResumeInfo(resumeText: string): ExtractedResumeInfo {
  const text = cleanResumeText(resumeText)
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    name: extractName(text, lines),
    phone: text.match(/(?<!\d)1[3-9]\d{9}(?!\d)/)?.[0],
    email: text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0],
    position: extractPosition(text, lines),
    educationSummary: extractSectionSummary(lines, ['教育背景', '教育经历', '学历', '毕业院校']),
    skills: extractSkills(text),
    projectSummary: extractSectionSummary(lines, ['项目经历', '项目经验', '项目实践', '工作经历']),
  }
}

export function getExtractedFieldLabels(info: ExtractedResumeInfo) {
  const labels: string[] = []
  if (info.name) labels.push('姓名')
  if (info.phone) labels.push('手机号')
  if (info.email) labels.push('邮箱')
  if (info.position) labels.push('求职意向')
  return labels
}

function extractName(text: string, lines: string[]) {
  const explicitName = text.match(/姓名[:：\s]+([\u4e00-\u9fa5]{2,5})/)
  if (explicitName?.[1]) return explicitName[1]

  const intentLineName = text.match(/([\u4e00-\u9fa5]{2,5})\s*(求职意向|应聘岗位|目标岗位|意向岗位|求职方向)/)
  if (intentLineName?.[1]) return intentLineName[1]

  const firstChineseLine = lines.find((line) => /^[\u4e00-\u9fa5]{2,5}$/.test(line))
  return firstChineseLine
}

function extractPosition(text: string, lines: string[]) {
  const lineWithLabel = lines.find((item) => positionLabelPattern.test(item))
  if (lineWithLabel) {
    const rawPosition = lineWithLabel.replace(new RegExp(`${positionLabelPattern.source}[:：\\s]*`), '')
    const cleaned = cleanPosition(rawPosition)
    if (isValidPosition(cleaned)) return cleaned
  }

  const pattern = /(求职意向|应聘岗位|目标岗位|意向岗位|求职方向)[:：\s]+([^\n]{2,80})/
  const match = text.match(pattern)
  if (!match?.[2]) return undefined

  const cleaned = cleanPosition(match[2])
  return isValidPosition(cleaned) ? cleaned : undefined
}

function extractSkills(text: string) {
  const lowerText = text.toLowerCase()
  return skillKeywords.filter((keyword) => lowerText.includes(keyword.toLowerCase()))
}

function extractSectionSummary(lines: string[], headings: string[]) {
  const startIndex = lines.findIndex((line) => headings.some((heading) => line.includes(heading)))
  if (startIndex < 0) return undefined

  const collected: string[] = []
  for (const line of lines.slice(startIndex, startIndex + 6)) {
    if (collected.length > 0 && /^(教育背景|教育经历|项目经历|项目经验|工作经历|技能|专业技能|自我评价)[:：]?$/.test(line)) break
    collected.push(line)
  }

  const summary = collected.join('；')
  return summary.length > 180 ? `${summary.slice(0, 180)}...` : summary
}

export function cleanPosition(value?: string) {
  if (!value) return ''

  const beforeStopField = value.split(positionStopPattern)[0] ?? ''
  return beforeStopField
    .replace(urlPattern, ' ')
    .replace(emailPattern, ' ')
    .replace(phoneGlobalPattern, ' ')
    .replace(/[|｜]/g, ' ')
    .replace(/[【】\[\]{}<>《》]/g, ' ')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9/+·\s-]/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isValidPosition(position: string) {
  if (!position) return false
  if (position.length > 40) return false
  if (phonePattern.test(position) || emailPattern.test(position) || urlPattern.test(position)) return false

  const digitCount = (position.match(/\d/g) ?? []).length
  if (digitCount >= 4) return false

  return /[\u4e00-\u9fa5A-Za-z]/.test(position)
}
