import type {
  Agreement,
  AgreementSnapshot,
  ChangeLog,
  GroundTeam,
  Identity,
  Airline,
  OwnershipChange,
  ServiceItem,
} from './agreement-types'

// 签约航司主体
export const SEED_AIRLINES: Airline[] = [
  { id: 'CA', name: '中国国际航空', iata: 'CA' },
  { id: 'MU', name: '中国东方航空', iata: 'MU' },
  { id: 'CZ', name: '中国南方航空', iata: 'CZ' },
]

// 地面班组：只查看与自己班组对应的服务项
export const SEED_TEAMS: GroundTeam[] = [
  { code: 'T-CABIN', name: '客舱清洁班', duty: '客舱清洁 / 垃圾袋更换' },
  { code: 'T-BAGGAGE', name: '行李装卸班', duty: '行李装卸 / 机下传送' },
  { code: 'T-LINE', name: '机务勤务班', duty: '机务勤务 / 放行检查' },
  { code: 'T-CATERING', name: '配餐作业班', duty: '航空配餐 / 机供品交接' },
]

// 可切换的登录身份：管理员、各航司签约对接人、各地面班组
export const SEED_IDENTITIES: Identity[] = [
  { id: 'U-ADMIN', role: 'admin', name: '平台管理员' },
  { id: 'U-CA', role: 'airline_contact', name: '国航对接人 李航', airlineId: 'CA' },
  { id: 'U-MU', role: 'airline_contact', name: '东航对接人 王旅', airlineId: 'MU' },
  { id: 'U-CZ', role: 'airline_contact', name: '南航对接人 赵程', airlineId: 'CZ' },
  { id: 'U-CABIN', role: 'team', name: '客舱清洁班带班', teamCode: 'T-CABIN' },
  { id: 'U-BAGGAGE', role: 'team', name: '行李装卸班带班', teamCode: 'T-BAGGAGE' },
  { id: 'U-LINE', role: 'team', name: '机务勤务班带班', teamCode: 'T-LINE' },
  { id: 'U-CATERING', role: 'team', name: '配餐作业班带班', teamCode: 'T-CATERING' },
]

type SeedItemInput = Omit<ServiceItem, 'id'>

type SeedAgreementInput = {
  id: string
  code: string
  airlineId: string
  title: string
  season: string
  status: Agreement['status']
  effectiveFrom: string
  effectiveTo: string
  owner: { id: string; name: string; phone: string }
  version: number
  remark: string
  createdAt: string
  updatedAt: string
  items: SeedItemInput[]
}

let seq = 0
function itemId() {
  seq += 1
  return `SI-${String(seq).padStart(3, '0')}`
}

const rawAgreements: SeedAgreementInput[] = [
  {
    id: 'AGR-2025-CA-W',
    code: 'CA-GSA-2025-W',
    airlineId: 'CA',
    title: '国航 2025 年冬春航季地面服务协议',
    season: '2025 冬春',
    status: '已失效',
    effectiveFrom: '2025-10-26',
    effectiveTo: '2026-03-28',
    owner: { id: 'U-CA', name: '李航', phone: '010-8800-1001' },
    version: 3,
    remark: '上一航季口径，已被夏秋航季协议接替。',
    createdAt: '2025-09-20 10:00:00',
    updatedAt: '2026-03-28 02:00:00',
    items: [
      { kind: '服务包', packageName: '基础保障包', name: '基础保障包（客舱清洁+行李装卸）', teamCode: 'T-CABIN', unit: '架次', price: 320, effectiveFrom: '2025-10-26', effectiveTo: '2026-03-28', isAdHoc: false },
      { kind: '服务项', packageName: '基础保障包', name: '客舱深度清洁', teamCode: 'T-CABIN', unit: '架次', price: 95, effectiveFrom: '2025-10-26', effectiveTo: '2026-03-28', isAdHoc: false },
      { kind: '服务项', packageName: '基础保障包', name: '行李装卸（含机下传送）', teamCode: 'T-BAGGAGE', unit: '架次', price: 140, effectiveFrom: '2025-10-26', effectiveTo: '2026-03-28', isAdHoc: false },
      { kind: '服务包', packageName: '机务勤务包', name: '机务勤务包（航前航后）', teamCode: 'T-LINE', unit: '架次', price: 260, effectiveFrom: '2025-10-26', effectiveTo: '2026-03-28', isAdHoc: false },
      { kind: '服务项', packageName: '机务勤务包', name: '放行检查单复核', teamCode: 'T-LINE', unit: '次', price: 60, effectiveFrom: '2025-10-26', effectiveTo: '2026-03-28', isAdHoc: false },
    ],
  },
  {
    id: 'AGR-2026-CA-S',
    code: 'CA-GSA-2026-S',
    airlineId: 'CA',
    title: '国航 2026 年夏秋航季地面服务协议',
    season: '2026 夏秋',
    status: '生效中',
    effectiveFrom: '2026-03-29',
    effectiveTo: '2026-10-24',
    owner: { id: 'U-CA', name: '李航', phone: '010-8800-1001' },
    version: 2,
    remark: '当前执行口径，含 7 月临时加项一项。',
    createdAt: '2026-02-25 09:30:00',
    updatedAt: '2026-07-01 09:00:00',
    items: [
      { kind: '服务包', packageName: '基础保障包', name: '基础保障包（客舱清洁+行李装卸）', teamCode: 'T-CABIN', unit: '架次', price: 335, effectiveFrom: '2026-03-29', effectiveTo: '2026-10-24', isAdHoc: false },
      { kind: '服务项', packageName: '基础保障包', name: '客舱深度清洁', teamCode: 'T-CABIN', unit: '架次', price: 100, effectiveFrom: '2026-03-29', effectiveTo: '2026-10-24', isAdHoc: false },
      { kind: '服务项', packageName: '基础保障包', name: '行李装卸（含机下传送）', teamCode: 'T-BAGGAGE', unit: '架次', price: 145, effectiveFrom: '2026-03-29', effectiveTo: '2026-10-24', isAdHoc: false },
      { kind: '服务包', packageName: '配餐服务包', name: '配餐服务包（标准机供品）', teamCode: 'T-CATERING', unit: '架次', price: 410, effectiveFrom: '2026-03-29', effectiveTo: '2026-10-24', isAdHoc: false },
      { kind: '服务项', packageName: '配餐服务包', name: '夏季冷链饮品补给（临时加项）', teamCode: 'T-CATERING', unit: '份', price: 12, effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30', isAdHoc: true },
    ],
  },
  {
    id: 'AGR-2026-MU-W-A',
    code: 'MU-GSA-2026-W-A',
    airlineId: 'MU',
    title: '东航 2026 年冬春航季地面服务协议（A 版）',
    season: '2026 冬春',
    status: '待生效',
    effectiveFrom: '2026-10-25',
    effectiveTo: '2027-03-27',
    owner: { id: 'U-MU', name: '王旅', phone: '021-9553-2002' },
    version: 1,
    remark: '换季谈定 A 版；与 B 版时段重叠，待管理员裁决执行版本。',
    createdAt: '2026-09-05 14:00:00',
    updatedAt: '2026-09-20 16:00:00',
    items: [
      { kind: '服务包', packageName: '基础保障包', name: '基础保障包（客舱清洁+行李装卸）', teamCode: 'T-CABIN', unit: '架次', price: 330, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
      { kind: '服务项', packageName: '基础保障包', name: '行李装卸（含机下传送）', teamCode: 'T-BAGGAGE', unit: '架次', price: 142, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
      { kind: '服务包', packageName: '机务勤务包', name: '机务勤务包（航前航后）', teamCode: 'T-LINE', unit: '架次', price: 255, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
      { kind: '服务包', packageName: '配餐服务包', name: '配餐服务包（标准机供品）', teamCode: 'T-CATERING', unit: '架次', price: 405, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
    ],
  },
  {
    id: 'AGR-2026-MU-W-B',
    code: 'MU-GSA-2026-W-B',
    airlineId: 'MU',
    title: '东航 2026 年冬春航季地面服务协议（B 版·增量报价）',
    season: '2026 冬春',
    status: '待生效',
    effectiveFrom: '2026-10-25',
    effectiveTo: '2027-03-27',
    owner: { id: 'U-MU', name: '王旅', phone: '021-9553-2002' },
    version: 1,
    remark: '增量报价 B 版；与 A 版时段重叠，未裁决前不允许生效。',
    createdAt: '2026-09-08 10:30:00',
    updatedAt: '2026-09-22 11:00:00',
    items: [
      { kind: '服务包', packageName: '基础保障包', name: '基础保障包（客舱清洁+行李装卸）', teamCode: 'T-CABIN', unit: '架次', price: 342, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
      { kind: '服务项', packageName: '基础保障包', name: '行李装卸（含机下传送）', teamCode: 'T-BAGGAGE', unit: '架次', price: 150, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
      { kind: '服务包', packageName: '机务勤务包', name: '机务勤务包（航前航后+除冰协同）', teamCode: 'T-LINE', unit: '架次', price: 268, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
      { kind: '服务项', packageName: '机务勤务包', name: '冬季除冰协同检查', teamCode: 'T-LINE', unit: '次', price: 80, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
    ],
  },
  {
    id: 'AGR-2026-CZ-S',
    code: 'CZ-GSA-2026-S',
    airlineId: 'CZ',
    title: '南航 2026 年夏秋航季地面服务协议',
    season: '2026 夏秋',
    status: '生效中',
    effectiveFrom: '2026-03-29',
    effectiveTo: '2026-10-24',
    owner: { id: 'U-CZ', name: '赵程', phone: '020-9553-3003' },
    version: 1,
    remark: '当前执行口径。',
    createdAt: '2026-02-27 11:00:00',
    updatedAt: '2026-03-29 00:30:00',
    items: [
      { kind: '服务包', packageName: '基础保障包', name: '基础保障包（客舱清洁+行李装卸）', teamCode: 'T-CABIN', unit: '架次', price: 330, effectiveFrom: '2026-03-29', effectiveTo: '2026-10-24', isAdHoc: false },
      { kind: '服务项', packageName: '基础保障包', name: '客舱深度清洁', teamCode: 'T-CABIN', unit: '架次', price: 98, effectiveFrom: '2026-03-29', effectiveTo: '2026-10-24', isAdHoc: false },
      { kind: '服务项', packageName: '机务勤务包', name: '过站短停放行', teamCode: 'T-LINE', unit: '次', price: 70, effectiveFrom: '2026-03-29', effectiveTo: '2026-10-24', isAdHoc: false },
    ],
  },
  {
    id: 'AGR-2026-CZ-W-DRAFT',
    code: 'CZ-GSA-2026-W',
    airlineId: 'CZ',
    title: '南航 2026 年冬春航季地面服务协议（编制中）',
    season: '2026 冬春',
    status: '草稿',
    effectiveFrom: '2026-10-25',
    effectiveTo: '2027-03-27',
    owner: { id: 'U-CZ', name: '赵程', phone: '020-9553-3003' },
    version: 1,
    remark: '服务项仍在补充，草稿阶段可随时改。',
    createdAt: '2026-09-28 15:00:00',
    updatedAt: '2026-09-28 15:00:00',
    items: [
      { kind: '服务包', packageName: '基础保障包', name: '基础保障包（客舱清洁+行李装卸）', teamCode: 'T-CABIN', unit: '架次', price: 328, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
      { kind: '服务项', packageName: '基础保障包', name: '行李装卸（含机下传送）', teamCode: 'T-BAGGAGE', unit: '架次', price: 140, effectiveFrom: '2026-10-25', effectiveTo: '2027-03-27', isAdHoc: false },
    ],
  },
]

function buildAgreements(): {
  agreements: Agreement[]
  itemsByAgreement: Record<string, ServiceItem[]>
  snapshots: AgreementSnapshot[]
  logs: ChangeLog[]
} {
  const agreements: Agreement[] = []
  const itemsByAgreement: Record<string, ServiceItem[]> = {}
  const snapshots: AgreementSnapshot[] = []
  const logs: ChangeLog[] = []

  for (const input of rawAgreements) {
    const items = input.items.map((item) => ({ ...item, id: itemId() }))
    itemsByAgreement[input.id] = items

    const { items: _items, ...agreementFields } = input
    void _items
    agreements.push({ ...agreementFields })

    // 初始快照：按签订当时口径冻结，后续任何编辑都不会改写它。
    snapshots.push({
      id: `SNP-${input.id}-V1`,
      agreementId: input.id,
      agreementCode: input.code,
      airlineId: input.airlineId,
      season: input.season,
      version: 1,
      status: input.status === '草稿' ? '草稿' : input.status === '待生效' ? '待生效' : '生效中',
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      ownerName: input.owner.name,
      items: JSON.parse(JSON.stringify(items)) as ServiceItem[],
      capturedAt: input.createdAt,
    })

    logs.push({
      id: `LOG-${input.id}-CREATE`,
      agreementId: input.id,
      agreementCode: input.code,
      action: '建立协议',
      detail: `由对接人 ${input.owner.name} 建立${input.season}协议草稿`,
      operatorId: input.owner.id,
      operatorName: input.owner.name,
      version: 1,
      at: input.createdAt,
    })
  }

  // 补充几条推进/加项历史，让已失效与生效协议的轨迹可读。
  const advanceLogs: ChangeLog[] = [
    { id: 'LOG-CAW-SUBMIT', agreementId: 'AGR-2025-CA-W', agreementCode: 'CA-GSA-2025-W', action: '提交待生效', detail: '冬春航季协议提交待生效', operatorId: 'U-CA', operatorName: '李航', version: 2, at: '2025-09-25 10:00:00' },
    { id: 'LOG-CAW-EFFECT', agreementId: 'AGR-2025-CA-W', agreementCode: 'CA-GSA-2025-W', action: '生效', detail: '冬春航季协议按期生效', operatorId: 'U-ADMIN', operatorName: '平台管理员', version: 3, at: '2025-10-26 00:00:00' },
    { id: 'LOG-CAW-EXPIRE', agreementId: 'AGR-2025-CA-W', agreementCode: 'CA-GSA-2025-W', action: '置为失效', detail: '夏秋航季开始，协议到期失效', operatorId: 'U-ADMIN', operatorName: '平台管理员', version: 3, at: '2026-03-28 02:00:00' },
    { id: 'LOG-CAS-EFFECT', agreementId: 'AGR-2026-CA-S', agreementCode: 'CA-GSA-2026-S', action: '生效', detail: '夏秋航季协议按期生效', operatorId: 'U-ADMIN', operatorName: '平台管理员', version: 1, at: '2026-03-29 00:00:00' },
    { id: 'LOG-CAS-ADHOC', agreementId: 'AGR-2026-CA-S', agreementCode: 'CA-GSA-2026-S', action: '临时加项', detail: '新增临时加项「夏季冷链饮品补给」，2026-07-01 起执行', operatorId: 'U-CA', operatorName: '李航', version: 2, at: '2026-07-01 09:00:00' },
    { id: 'LOG-CZS-EFFECT', agreementId: 'AGR-2026-CZ-S', agreementCode: 'CZ-GSA-2026-S', action: '生效', detail: '夏秋航季协议按期生效', operatorId: 'U-ADMIN', operatorName: '平台管理员', version: 1, at: '2026-03-29 00:30:00' },
  ]
  logs.push(...advanceLogs)

  return { agreements, itemsByAgreement, snapshots, logs }
}

const built = buildAgreements()

export const SEED_AGREEMENTS: Agreement[] = built.agreements
export const SEED_AGREEMENT_ITEMS: Record<string, ServiceItem[]> = built.itemsByAgreement
export const SEED_SNAPSHOTS: AgreementSnapshot[] = built.snapshots
export const SEED_CHANGE_LOGS: ChangeLog[] = built.logs
export const SEED_OWNERSHIP_CHANGES: OwnershipChange[] = []
export const SEED_ARBITRATIONS: import('./agreement-types').ArbitrationNote[] = []
export const SEED_DISPATCH_TODOS: import('./agreement-types').DispatchTodo[] = []
export const SEED_BILLING_REFS: import('./agreement-types').BillingReference[] = []
