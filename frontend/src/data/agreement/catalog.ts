import type { Actor, Airline, GroundTeam, ServiceItem, ServicePackage } from './types'

// 航司协议主体目录。
export const AIRLINES: Airline[] = [
  { id: 'CA', name: '中国国际航空', shortName: '国航' },
  { id: 'MU', name: '中国东方航空', shortName: '东航' },
  { id: 'CZ', name: '中国南方航空', shortName: '南航' },
]

// 地面各班组：只能查看自己对应的服务项。
export const TEAMS: GroundTeam[] = [
  { id: 'T-APRON', name: '机坪勤务班', area: '机坪作业区' },
  { id: 'T-BAG', name: '行李装卸班', area: '行李分拣厅' },
  { id: 'T-CABIN', name: '客舱清洁班', area: '客舱保障区' },
  { id: 'T-CATER', name: '配餐作业班', area: '配餐交接区' },
  { id: 'T-LINE', name: '机务勤务班', area: '机务作业区' },
  { id: 'T-VIP', name: '要客保障班', area: '贵宾服务区' },
]

// 服务包目录：协议逐条挂服务包内的服务项，并登记生效日期。
export const PACKAGES: ServicePackage[] = [
  { id: 'P-BASE', name: '基础机坪保障包', desc: '换季标配的机坪与地面电源类服务' },
  { id: 'P-BAGGAGE', name: '行李服务包', desc: '行李装卸、分拣与复核' },
  { id: 'P-CABIN', name: '客舱清洁包', desc: '客舱清洁、航后深度保洁与用品配发' },
  { id: 'P-CATERING', name: '机上配餐包', desc: '餐食配送、装机与交接' },
  { id: 'P-LINE', name: '机务勤务包', desc: '航前航后机务勤务与放行协助' },
  { id: 'P-VIP', name: '要客保障包', desc: '要客引导、贵宾通道与专车' },
]

export const SERVICE_ITEMS: ServiceItem[] = [
  { id: 'SV-APRON-GUIDE', packageId: 'P-BASE', name: '飞机进出港引导', unit: '架次', referencePrice: 320, teamId: 'T-APRON' },
  { id: 'SV-GPU', packageId: 'P-BASE', name: '地面电源供电', unit: '小时', referencePrice: 180, teamId: 'T-APRON' },
  { id: 'SV-BAG-LOAD', packageId: 'P-BAGGAGE', name: '行李装机', unit: '件', referencePrice: 3.5, teamId: 'T-BAG' },
  { id: 'SV-BAG-UNLOAD', packageId: 'P-BAGGAGE', name: '行李卸机', unit: '件', referencePrice: 3.5, teamId: 'T-BAG' },
  { id: 'SV-CABIN-CLEAN', packageId: 'P-CABIN', name: '客舱过站清洁', unit: '架次', referencePrice: 460, teamId: 'T-CABIN' },
  { id: 'SV-CABIN-DEEP', packageId: 'P-CABIN', name: '航后深度保洁', unit: '架次', referencePrice: 980, teamId: 'T-CABIN' },
  { id: 'SV-CATER-LOAD', packageId: 'P-CATERING', name: '餐食装机', unit: '车次', referencePrice: 260, teamId: 'T-CATER' },
  { id: 'SV-LINE-CHECK', packageId: 'P-LINE', name: '航前机务检查', unit: '架次', referencePrice: 520, teamId: 'T-LINE' },
  { id: 'SV-VIP-SERVICE', packageId: 'P-VIP', name: '要客全程引导', unit: '人次', referencePrice: 280, teamId: 'T-VIP' },
  { id: 'SV-VIP-CAR', packageId: 'P-VIP', name: '要客摆渡专车', unit: '车次', referencePrice: 350, teamId: 'T-VIP' },
]

// 当前可切换的操作身份：协议可改不可改，全由这个身份裁决。
export const ACTORS: Actor[] = [
  { id: 'U-ADMIN', name: '值班管理员', title: '地面保障部 · 协议管理员', role: 'manager' },
  { id: 'U-DISPATCH', name: '周调度', title: '资源调度室 · 值班调度', role: 'scheduler' },
  { id: 'U-CA-LI', name: '李建国', title: '国航地面服务对接人', role: 'airline', airlineId: 'CA' },
  { id: 'U-CA-WANG', name: '王芳', title: '国航地面服务对接人（备用）', role: 'airline', airlineId: 'CA' },
  { id: 'U-MU-ZHANG', name: '张伟', title: '东航地面服务对接人', role: 'airline', airlineId: 'MU' },
  { id: 'U-CZ-CHEN', name: '陈敏', title: '南航地面服务对接人', role: 'airline', airlineId: 'CZ' },
  { id: 'U-T-APRON', name: '马强', title: '机坪勤务班 · 带班', role: 'team', teamId: 'T-APRON' },
  { id: 'U-T-BAG', name: '刘芳', title: '行李装卸班 · 带班', role: 'team', teamId: 'T-BAG' },
  { id: 'U-T-CABIN', name: '赵磊', title: '客舱清洁班 · 带班', role: 'team', teamId: 'T-CABIN' },
  { id: 'U-T-CATER', name: '孙静', title: '配餐作业班 · 带班', role: 'team', teamId: 'T-CATER' },
  { id: 'U-T-LINE', name: '钱进', title: '机务勤务班 · 带班', role: 'team', teamId: 'T-LINE' },
  { id: 'U-T-VIP', name: '周悦', title: '要客保障班 · 带班', role: 'team', teamId: 'T-VIP' },
]

export const DEFAULT_ACTOR_ID = 'U-ADMIN'

const actorsById = new Map(ACTORS.map((item) => [item.id, item]))
const airlinesById = new Map(AIRLINES.map((item) => [item.id, item]))
const teamsById = new Map(TEAMS.map((item) => [item.id, item]))
const packagesById = new Map(PACKAGES.map((item) => [item.id, item]))
const itemsById = new Map(SERVICE_ITEMS.map((item) => [item.id, item]))

export function getActor(id: string): Actor | undefined {
  return actorsById.get(id)
}

export function getAirline(id: string): Airline | undefined {
  return airlinesById.get(id)
}

export function getTeam(id: string): GroundTeam | undefined {
  return teamsById.get(id)
}

export function getPackage(id: string): ServicePackage | undefined {
  return packagesById.get(id)
}

export function getServiceItem(id: string): ServiceItem | undefined {
  return itemsById.get(id)
}
