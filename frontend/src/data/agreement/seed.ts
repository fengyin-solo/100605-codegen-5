import type {
  Agreement,
  AgreementSnapshot,
  BillingRef,
  DomainState,
  FrozenLine,
  AgreementLine,
  OwnershipChange,
  Arbitration,
  ScheduleTodo,
} from './types'
import { PACKAGES, SERVICE_ITEMS, TEAMS } from './catalog'

// 演示业务日期：与需求场景一致，按 2026 冬春换季展开。
export const BUSINESS_TODAY = '2026-10-04'

function line(
  id: string,
  serviceItemId: string,
  kind: '正式' | '临时加项',
  effectiveDate: string,
  extra: Partial<AgreementLine> = {},
): AgreementLine {
  const item = SERVICE_ITEMS.find((entry) => entry.id === serviceItemId)!
  return {
    id,
    serviceItemId,
    kind,
    confirmed: kind === '正式',
    effectiveDate,
    price: item.referencePrice,
    unit: item.unit,
    note: '',
    attachedAt: '2026-10-20 09:00',
    ...extra,
  }
}

function freezeLines(lines: AgreementLine[]): FrozenLine[] {
  return lines
    .filter((entry) => entry.confirmed)
    .map((entry) => {
      const item = SERVICE_ITEMS.find((candidate) => candidate.id === entry.serviceItemId)!
      // 目录结构按 id 关联，名称与价格在冻结瞬间复制进快照。
      return {
        lineId: entry.id,
        serviceItemId: entry.serviceItemId,
        packageId: item.packageId,
        packageName: PACKAGES.find((pkg) => pkg.id === item.packageId)?.name ?? item.packageId,
        name: item.name,
        teamId: item.teamId,
        teamName: TEAMS.find((team) => team.id === item.teamId)?.name ?? item.teamId,
        unit: entry.unit,
        price: entry.price,
        kind: entry.kind,
        effectiveDate: entry.effectiveDate,
      }
    })
}

const agreements: Agreement[] = [
  {
    id: 'A-101',
    code: 'CA-GSA-2026W',
    airlineId: 'CA',
    subject: '中国国际航空 2026 年冬春航季地面服务协议',
    ownerId: 'U-CA-LI',
    signDate: '2026-10-20',
    effectiveDate: '2026-10-25',
    expiryDate: '2027-03-27',
    status: '生效中',
    note: '换季服务包，含一项已确认临时加项（要客引导），另有一项临时加项目前未经对接人确认。',
    createdAt: '2026-10-18 10:00',
    updatedAt: '2026-11-01 09:30',
    lines: [
      line('L-101-01', 'SV-APRON-GUIDE', '正式', '2026-10-25'),
      line('L-101-02', 'SV-GPU', '正式', '2026-10-25'),
      line('L-101-03', 'SV-BAG-LOAD', '正式', '2026-10-25'),
      line('L-101-04', 'SV-BAG-UNLOAD', '正式', '2026-10-25'),
      line('L-101-05', 'SV-CABIN-CLEAN', '正式', '2026-10-25'),
      line('L-101-06', 'SV-CATER-LOAD', '正式', '2026-10-25'),
      line('L-101-07', 'SV-LINE-CHECK', '正式', '2026-10-25'),
      line('L-101-08', 'SV-VIP-SERVICE', '临时加项', '2026-11-01', {
        confirmed: true,
        note: '换季加班季临时增加，对接人李建国已于 2026-10-28 确认',
        attachedAt: '2026-10-28 14:00',
      }),
      line('L-101-09', 'SV-VIP-CAR', '临时加项', '2026-12-01', {
        confirmed: false,
        note: '班组口头提出，尚未经国航对接人确认，不计入可用服务项',
        attachedAt: '2026-10-30 16:20',
      }),
    ],
  },
  {
    id: 'A-102',
    code: 'MU-GSA-2026W',
    airlineId: 'MU',
    subject: '中国东方航空 2026 年冬春航季地面服务协议',
    ownerId: 'U-MU-ZHANG',
    signDate: '2026-10-19',
    effectiveDate: '2026-10-25',
    expiryDate: '2027-03-27',
    status: '生效中',
    note: '换季主协议；2026-11-15 起与东航补充协议时段重叠，裁决结果为补充协议优先（见裁决记录）。',
    createdAt: '2026-10-17 10:00',
    updatedAt: '2026-10-24 15:00',
    lines: [
      line('L-102-01', 'SV-APRON-GUIDE', '正式', '2026-10-25'),
      line('L-102-02', 'SV-GPU', '正式', '2026-10-25'),
      line('L-102-03', 'SV-BAG-LOAD', '正式', '2026-10-25'),
      line('L-102-04', 'SV-BAG-UNLOAD', '正式', '2026-10-25'),
      line('L-102-05', 'SV-CABIN-CLEAN', '正式', '2026-10-25'),
      line('L-102-06', 'SV-CABIN-DEEP', '正式', '2026-10-25'),
      line('L-102-07', 'SV-CATER-LOAD', '正式', '2026-10-25'),
      line('L-102-08', 'SV-LINE-CHECK', '正式', '2026-10-25'),
      line('L-102-09', 'SV-VIP-SERVICE', '正式', '2026-10-25'),
      line('L-102-10', 'SV-VIP-CAR', '正式', '2026-10-25'),
    ],
  },
  {
    id: 'A-103',
    code: 'MU-GSA-2026W-S1',
    airlineId: 'MU',
    subject: '中国东方航空 2026 年冬春航季地面服务补充协议（一）',
    ownerId: 'U-MU-ZHANG',
    signDate: '2026-11-10',
    effectiveDate: '2026-11-15',
    expiryDate: '2027-03-27',
    status: '待生效',
    note: '补充协议含冬春增频后的深度保洁与要客专车口径；与主协议重叠，需管理员裁决后才能生效。',
    createdAt: '2026-11-08 10:00',
    updatedAt: '2026-11-11 09:00',
    lines: [
      line('L-103-01', 'SV-APRON-GUIDE', '正式', '2026-11-15', { attachedAt: '2026-11-08 10:00' }),
      line('L-103-02', 'SV-GPU', '正式', '2026-11-15', { attachedAt: '2026-11-08 10:00' }),
      line('L-103-03', 'SV-BAG-LOAD', '正式', '2026-11-15', { attachedAt: '2026-11-08 10:00' }),
      line('L-103-04', 'SV-BAG-UNLOAD', '正式', '2026-11-15', { attachedAt: '2026-11-08 10:00' }),
      line('L-103-05', 'SV-CABIN-CLEAN', '正式', '2026-11-15', { attachedAt: '2026-11-08 10:00' }),
      line('L-103-06', 'SV-CABIN-DEEP', '临时加项', '2026-11-15', {
        confirmed: true,
        price: 920,
        note: '增频航班航后深度保洁协议价，对接人已确认',
        attachedAt: '2026-11-09 10:00',
      }),
      line('L-103-07', 'SV-CATER-LOAD', '正式', '2026-11-15', { attachedAt: '2026-11-08 10:00' }),
      line('L-103-08', 'SV-LINE-CHECK', '正式', '2026-11-15', { attachedAt: '2026-11-08 10:00' }),
      line('L-103-09', 'SV-VIP-SERVICE', '正式', '2026-11-15', { attachedAt: '2026-11-08 10:00' }),
      line('L-103-10', 'SV-VIP-CAR', '临时加项', '2026-11-15', {
        confirmed: true,
        note: '冬春要客增开摆渡专车，对接人已确认',
        attachedAt: '2026-11-09 10:00',
      }),
    ],
  },
  {
    id: 'A-104',
    code: 'CZ-GSA-2026W',
    airlineId: 'CZ',
    subject: '中国南方航空 2026 年冬春航季地面服务协议',
    ownerId: 'U-CZ-CHEN',
    signDate: '2026-10-21',
    effectiveDate: '2026-10-25',
    expiryDate: '2027-03-27',
    status: '生效中',
    note: '换季主协议；要客引导为未确认临时加项，须对接人陈敏确认后方可执行与计费。',
    createdAt: '2026-10-19 10:00',
    updatedAt: '2026-10-24 16:00',
    lines: [
      line('L-104-01', 'SV-APRON-GUIDE', '正式', '2026-10-25'),
      line('L-104-02', 'SV-GPU', '正式', '2026-10-25'),
      line('L-104-03', 'SV-BAG-LOAD', '正式', '2026-10-25'),
      line('L-104-04', 'SV-BAG-UNLOAD', '正式', '2026-10-25'),
      line('L-104-05', 'SV-CABIN-CLEAN', '正式', '2026-10-25'),
      line('L-104-06', 'SV-CATER-LOAD', '正式', '2026-10-25'),
      line('L-104-07', 'SV-LINE-CHECK', '正式', '2026-10-25'),
      line('L-104-08', 'SV-VIP-SERVICE', '临时加项', '2026-11-01', {
        confirmed: false,
        note: '要客班临时提出，南航对接人尚未确认',
        attachedAt: '2026-10-30 11:00',
      }),
    ],
  },
  {
    id: 'A-105',
    code: 'CA-GSA-2026W-D1',
    airlineId: 'CA',
    subject: '国航华北站要客保障补充协议（草稿）',
    ownerId: 'U-CA-LI',
    signDate: '',
    effectiveDate: '2026-12-01',
    expiryDate: '2027-02-28',
    status: '草稿',
    note: '草稿：仅国航对接人可改；提交后进入待生效。',
    createdAt: '2026-10-28 09:00',
    updatedAt: '2026-10-28 09:00',
    lines: [
      line('L-105-01', 'SV-VIP-SERVICE', '正式', '2026-12-01', { attachedAt: '2026-10-28 09:00' }),
      line('L-105-02', 'SV-VIP-CAR', '正式', '2026-12-01', { attachedAt: '2026-10-28 09:00' }),
    ],
  },
  {
    id: 'A-107',
    code: 'CA-GSA-2026W-D2',
    airlineId: 'CA',
    subject: '国航冬春机务增频补充协议（空草稿）',
    ownerId: 'U-CA-LI',
    signDate: '',
    effectiveDate: '2026-12-10',
    expiryDate: '2027-03-20',
    status: '草稿',
    note: '刚登记的空草稿，尚未挂任何服务项，不能提交。',
    createdAt: BUSINESS_TODAY + ' 09:00',
    updatedAt: BUSINESS_TODAY + ' 09:00',
    lines: [],
  },
  {
    id: 'A-106',
    code: 'CA-GSA-2026S',
    airlineId: 'CA',
    subject: '中国国际航空 2026 年夏秋航季地面服务协议',
    ownerId: 'U-CA-LI',
    signDate: '2026-03-25',
    effectiveDate: '2026-03-29',
    expiryDate: '2026-10-24',
    status: '已失效',
    note: '上一航季协议，已于 2026-10-24 失效；历史口径按签订时快照保留，不能改回生效中。',
    createdAt: '2026-03-20 10:00',
    updatedAt: '2026-10-24 23:59',
    lines: [
      line('L-106-01', 'SV-APRON-GUIDE', '正式', '2026-03-29', { price: 280, attachedAt: '2026-03-20 10:00' }),
      line('L-106-02', 'SV-GPU', '正式', '2026-03-29', { price: 150, attachedAt: '2026-03-20 10:00' }),
      line('L-106-03', 'SV-BAG-LOAD', '正式', '2026-03-29', { price: 2.8, attachedAt: '2026-03-20 10:00' }),
      line('L-106-04', 'SV-BAG-UNLOAD', '正式', '2026-03-29', { price: 2.8, attachedAt: '2026-03-20 10:00' }),
      line('L-106-05', 'SV-CABIN-CLEAN', '正式', '2026-03-29', { price: 420, attachedAt: '2026-03-20 10:00' }),
      line('L-106-06', 'SV-CATER-LOAD', '正式', '2026-03-29', { price: 230, attachedAt: '2026-03-20 10:00' }),
      line('L-106-07', 'SV-LINE-CHECK', '正式', '2026-03-29', { price: 480, attachedAt: '2026-03-20 10:00' }),
    ],
  },
]

function snapshotFor(agreement: Agreement, frozenAt: string, frozenBy: string, reason: string): AgreementSnapshot {
  return {
    id: `S-${agreement.id}`,
    agreementId: agreement.id,
    version: 1,
    reason,
    frozenAt,
    frozenBy,
    windowStart: agreement.effectiveDate,
    windowEnd: agreement.expiryDate,
    lines: freezeLines(agreement.lines),
  }
}

function snapshotByCode(code: string, frozenAt: string, frozenBy: string, reason: string): AgreementSnapshot {
  const agreement = agreements.find((item) => item.code === code)!
  return snapshotFor(agreement, frozenAt, frozenBy, reason)
}

const snapshots: AgreementSnapshot[] = [
  snapshotByCode('CA-GSA-2026W', '2026-10-24 17:00', '李建国', '协议生效前按签订口径冻结'),
  snapshotByCode('MU-GSA-2026W', '2026-10-24 17:10', '张伟', '协议生效前按签订口径冻结'),
  snapshotByCode('CZ-GSA-2026W', '2026-10-24 17:20', '陈敏', '协议生效前按签订口径冻结'),
  snapshotByCode('CA-GSA-2026S', '2026-03-28 17:00', '王芳', '夏秋航季协议签订口径冻结'),
]

const ownershipChanges: OwnershipChange[] = [
  {
    id: 'OC-1',
    agreementId: 'A-106',
    agreementCode: 'CA-GSA-2026S',
    airlineId: 'CA',
    fromOwnerId: 'U-CA-WANG',
    fromOwnerName: '王芳',
    toOwnerId: 'U-CA-LI',
    toOwnerName: '李建国',
    reason: '夏秋航季对接人轮岗，协议归属转由李建国接管。',
    at: '2026-04-10 09:30',
    operatorId: 'U-ADMIN',
    operatorName: '值班管理员',
  },
]

const arbitrations: Arbitration[] = []

const todos: ScheduleTodo[] = [
  {
    id: 'TD-1',
    kind: '临时加项确认',
    title: '待确认临时加项：南航《要客全程引导》',
    detail: '要客保障班在 CZ-GSA-2026W 中登记临时加项，南航对接人陈敏尚未确认，确认前不得执行、不得计费。',
    airlineId: 'CZ',
    agreementId: 'A-104',
    at: '2026-10-30 11:00',
    read: false,
  },
  {
    id: 'TD-2',
    kind: '重叠裁决',
    title: '待裁决：东航主协议与补充协议（一）时段重叠',
    detail: 'MU-GSA-2026W 与 MU-GSA-2026W-S1 在 2026-11-15 至 2027-03-27 重叠，需管理员裁决执行口径。',
    airlineId: 'MU',
    agreementId: 'A-103',
    at: '2026-11-11 09:00',
    read: false,
  },
  {
    id: 'TD-3',
    kind: '协议失效',
    title: '已通知：国航夏秋航季协议 2026-10-24 到期失效',
    detail: 'CA-GSA-2026S 到期后按冬春协议 CA-GSA-2026W 执行，历史服务项保留在原快照中。',
    airlineId: 'CA',
    agreementId: 'A-106',
    at: '2026-10-24 23:59',
    read: true,
  },
]

const billingRefs: BillingRef[] = [
  {
    id: 'BR-1',
    agreementId: 'A-106',
    agreementCode: 'CA-GSA-2026S',
    airlineId: 'CA',
    lineId: 'L-106-01',
    serviceItemName: '飞机进出港引导',
    packageName: '基础机坪保障包',
    unit: '架次',
    price: 280,
    billingDate: '2026-08-15',
    at: '2026-08-15 23:00',
    operatorId: 'U-DISPATCH',
    operatorName: '周调度',
  },
]

export function buildSeedState(): DomainState {
  return {
    seq: 1000,
    agreements: JSON.parse(JSON.stringify(agreements)),
    snapshots: JSON.parse(JSON.stringify(snapshots)),
    ownershipChanges: JSON.parse(JSON.stringify(ownershipChanges)),
    arbitrations: JSON.parse(JSON.stringify(arbitrations)),
    todos: JSON.parse(JSON.stringify(todos)),
    billingRefs: JSON.parse(JSON.stringify(billingRefs)),
    logs: [],
  }
}
