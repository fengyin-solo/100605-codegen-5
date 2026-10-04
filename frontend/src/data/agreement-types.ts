/** 航司地面服务协议管理的领域类型。 */

// 协议状态只能沿 草稿 → 待生效 → 生效中 → 已失效 逐段推进，不允许跳步、不允许回退。
export type AgreementStatus = '草稿' | '待生效' | '生效中' | '已失效'

export const AGREEMENT_STATUSES: AgreementStatus[] = ['草稿', '待生效', '生效中', '已失效']

// 相邻状态的唯一推进动作，顺序即合法流转方向。
export const AGREEMENT_TRANSITIONS: { from: AgreementStatus; action: string; to: AgreementStatus }[] = [
  { from: '草稿', action: '提交待生效', to: '待生效' },
  { from: '待生效', action: '生效', to: '生效中' },
  { from: '生效中', action: '置为失效', to: '已失效' },
]

export type ServiceKind = '服务包' | '服务项'

// 临时加项与正式服务项都挂在协议下，结算时用 isAdHoc 区分是否为后补项。
export type ServiceItem = {
  id: string
  kind: ServiceKind
  packageName: string
  name: string
  teamCode: string
  unit: string
  price: number
  effectiveFrom: string
  effectiveTo: string
  isAdHoc: boolean
}

export type OwnerContact = {
  id: string
  name: string
  phone: string
}

export type Agreement = {
  id: string
  code: string
  airlineId: string
  title: string
  season: string
  status: AgreementStatus
  effectiveFrom: string
  effectiveTo: string
  owner: OwnerContact
  version: number
  remark: string
  createdAt: string
  updatedAt: string
}

// 归属变更记录：改别人（航司）的协议主体时单独留痕。
export type OwnershipChange = {
  id: string
  agreementId: string
  agreementCode: string
  airlineId: string
  fromOwner: string
  toOwner: string
  reason: string
  operatorId: string
  operatorName: string
  at: string
}

export type ChangeLog = {
  id: string
  agreementId: string
  agreementCode: string
  action: string
  detail: string
  operatorId: string
  operatorName: string
  version: number
  at: string
}

// 不可变快照：每次状态推进落一版，历史服务项按签订当时的口径冻结在这里，不被后来的改动覆盖。
export type AgreementSnapshot = {
  id: string
  agreementId: string
  agreementCode: string
  airlineId: string
  season: string
  version: number
  status: AgreementStatus
  effectiveFrom: string
  effectiveTo: string
  ownerName: string
  items: ServiceItem[]
  capturedAt: string
}

// 同一家航司同一时段出现重叠协议时，由管理员裁决以哪份为准，裁决理由必须写进说明。
export type ArbitrationNote = {
  id: string
  airlineId: string
  winnerAgreementId: string
  loserAgreementId: string
  periodFrom: string
  periodTo: string
  note: string
  operatorId: string
  operatorName: string
  at: string
}

// 资源调度待办：协议变更结果落到这里，调度页与协议页共用同一份数据源。
export type DispatchTodo = {
  id: string
  type: '协议生效' | '协议失效' | '临时加项' | '重叠裁决'
  airlineId: string
  agreementId: string
  agreementCode: string
  title: string
  summary: string
  refDate: string
  done: boolean
  createdAt: string
}

// 计费引用只能引用生效中的服务项，引用时把当时口径快照保存下来。
export type BillingReference = {
  id: string
  refNo: string
  agreementId: string
  agreementCode: string
  agreementVersion: number
  airlineId: string
  teamCode: string
  itemId: string
  itemName: string
  unit: string
  price: number
  periodLabel: string
  isAdHoc: boolean
  operatorId: string
  operatorName: string
  at: string
}

export type Airline = { id: string; name: string; iata: string }

export type GroundTeam = { code: string; name: string; duty: string }

export type Role = 'admin' | 'airline_contact' | 'team'

export type Identity = {
  id: string
  role: Role
  name: string
  airlineId?: string
  teamCode?: string
}

export type ServiceResult<T = undefined> = { ok: boolean; message: string; data?: T }
