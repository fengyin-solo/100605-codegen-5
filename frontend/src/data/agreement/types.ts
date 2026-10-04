/** 航司地面服务协议管理领域模型：协议主体、服务项挂接、状态流转、裁决与历史快照都在这里定型。 */

export type AgreementStatus = '草稿' | '待生效' | '生效中' | '已失效'

export const AGREEMENT_STATUSES: AgreementStatus[] = ['草稿', '待生效', '生效中', '已失效']

export type LineKind = '正式' | '临时加项'

export type ActorRole = 'manager' | 'scheduler' | 'airline' | 'team'

export type Actor = {
  id: string
  name: string
  title: string
  role: ActorRole
  airlineId?: string
  teamId?: string
}

export type Airline = {
  id: string
  name: string
  shortName: string
}

export type GroundTeam = {
  id: string
  name: string
  area: string
}

export type ServicePackage = {
  id: string
  name: string
  desc: string
}

export type ServiceItem = {
  id: string
  packageId: string
  name: string
  unit: string
  /** 目录参考价；挂进协议时复制一份到协议行，之后改目录不影响已签协议。 */
  referencePrice: number
  teamId: string
}

export type AgreementLine = {
  id: string
  serviceItemId: string
  kind: LineKind
  /** 临时加项必须经签约航司对接人确认才算数；正式项随协议签订自动确认。 */
  confirmed: boolean
  /** 该服务项在协议内的生效日期。 */
  effectiveDate: string
  price: number
  unit: string
  note: string
  attachedAt: string
}

export type Agreement = {
  id: string
  code: string
  airlineId: string
  /** 协议主体名称（合同全称）。 */
  subject: string
  /** 当前归属对接人（actor id）；只允许在同航司对接人之间变更。 */
  ownerId: string
  signDate: string
  effectiveDate: string
  expiryDate: string
  status: AgreementStatus
  note: string
  lines: AgreementLine[]
  createdAt: string
  updatedAt: string
}

/** 冻结行：按冻结当时的口径保留服务项名称、班组、价格，不再随后续改动变化。 */
export type FrozenLine = {
  lineId: string
  serviceItemId: string
  packageId: string
  packageName: string
  name: string
  teamId: string
  teamName: string
  unit: string
  price: number
  kind: LineKind
  effectiveDate: string
}

export type AgreementSnapshot = {
  id: string
  agreementId: string
  version: number
  reason: string
  frozenAt: string
  frozenBy: string
  windowStart: string
  windowEnd: string
  lines: FrozenLine[]
}

export type OwnershipChange = {
  id: string
  agreementId: string
  agreementCode: string
  airlineId: string
  fromOwnerId: string
  fromOwnerName: string
  toOwnerId: string
  toOwnerName: string
  reason: string
  at: string
  operatorId: string
  operatorName: string
}

export type Arbitration = {
  id: string
  airlineId: string
  winnerAgreementId: string
  loserAgreementId: string
  overlapStart: string
  overlapEnd: string
  note: string
  at: string
  arbitratorId: string
  arbitratorName: string
}

export type TodoKind = '协议生效' | '协议失效' | '临时加项确认' | '重叠裁决' | '归属变更'

export type ScheduleTodo = {
  id: string
  kind: TodoKind
  title: string
  detail: string
  airlineId?: string
  agreementId?: string
  at: string
  read: boolean
}

export type BillingRef = {
  id: string
  agreementId: string
  agreementCode: string
  airlineId: string
  lineId: string
  serviceItemName: string
  packageName: string
  unit: string
  price: number
  billingDate: string
  at: string
  operatorId: string
  operatorName: string
}

export type ActionLogEntry = {
  id: string
  agreementId: string
  at: string
  actorId: string
  actorName: string
  action: string
  detail: string
}

export type DomainState = {
  seq: number
  agreements: Agreement[]
  snapshots: AgreementSnapshot[]
  ownershipChanges: OwnershipChange[]
  arbitrations: Arbitration[]
  todos: ScheduleTodo[]
  billingRefs: BillingRef[]
  logs: ActionLogEntry[]
}
