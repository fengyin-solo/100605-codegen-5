import { db, mutate } from './agreement-store'
import type {
  Agreement,
  AgreementSnapshot,
  AgreementStatus,
  ArbitrationNote,
  BillingReference,
  ChangeLog,
  DispatchTodo,
  Identity,
  ServiceItem,
  ServiceResult,
} from './agreement-types'
import { AGREEMENT_STATUSES, AGREEMENT_TRANSITIONS } from './agreement-types'
import { SEED_AIRLINES, SEED_TEAMS } from './agreement-seed'

export { SEED_AIRLINES, SEED_TEAMS }

// ---------- 时间 ----------

function now(): Date {
  return new Date()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function todayIso(): string {
  const d = now()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function nowText(): string {
  const d = now()
  return `${todayIso()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 日期区间是否有重叠：[aFrom,aTo] 与 [bFrom,bTo]，端点相接（前一份结束次日后一份开始）不算重叠。
export function periodOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return aFrom <= bTo && bFrom <= aTo
}

// ---------- 读取 ----------

export function listAirlines() {
  return SEED_AIRLINES
}

export function listTeams() {
  return SEED_TEAMS
}

export function airlineName(id: string): string {
  return SEED_AIRLINES.find((item) => item.id === id)?.name ?? id
}

export function teamName(code: string): string {
  return SEED_TEAMS.find((item) => item.code === code)?.name ?? code
}

export function listAgreements(): Agreement[] {
  // 状态按状态机顺序、再按生效起始日排序，换季重叠两份会相邻出现。
  return [...db().agreements].sort((a, b) => {
    const sa = AGREEMENT_STATUSES.indexOf(a.status)
    const sb = AGREEMENT_STATUSES.indexOf(b.status)
    if (sa !== sb) return sa - sb
    return a.effectiveFrom.localeCompare(b.effectiveFrom)
  })
}

export function getAgreement(id: string): Agreement | undefined {
  return db().agreements.find((item) => item.id === id)
}

export function listItems(agreementId: string): ServiceItem[] {
  return db().itemsByAgreement[agreementId] ?? []
}

export function listLogs(agreementId?: string): ChangeLog[] {
  const logs = [...db().logs].sort((a, b) => b.at.localeCompare(a.at))
  return agreementId ? logs.filter((item) => item.agreementId === agreementId) : logs
}

export function listOwnershipChanges(): import('./agreement-types').OwnershipChange[] {
  return [...db().ownershipChanges].sort((a, b) => b.at.localeCompare(a.at))
}

export function listSnapshots(agreementId: string): AgreementSnapshot[] {
  return db()
    .snapshots.filter((item) => item.agreementId === agreementId)
    .sort((a, b) => a.version - b.version)
}

export function listArbitrations(): ArbitrationNote[] {
  return [...db().arbitrations].sort((a, b) => b.at.localeCompare(a.at))
}

// ---------- 权限 ----------
// 协议由「签约航司的对接人」维护：只有 admin 与归属航司对接人能改；
// 班组只读且只看得到与自己班组对应的服务项；跨航司改动一律拒绝。

export type Permission = 'edit' | 'view' | 'none'

export function canView(identity: Identity, agreement: Agreement): boolean {
  if (identity.role === 'admin') return true
  if (identity.role === 'airline_contact') return identity.airlineId === agreement.airlineId
  if (identity.role === 'team') {
    const code = identity.teamCode
    return listItems(agreement.id).some((item) => item.teamCode === code)
  }
  return false
}

export function canEdit(identity: Identity, agreement: Agreement): boolean {
  if (identity.role !== 'airline_contact') return false
  return identity.airlineId === agreement.airlineId
}

// 可见协议列表（班组只看到与自己相关的航司协议）
export function visibleAgreements(identity: Identity): Agreement[] {
  return listAgreements().filter((agreement) => canView(identity, agreement))
}

function visibleItemsFor(identity: Identity, agreementId: string, items: ServiceItem[]): ServiceItem[] {
  if (identity.role === 'team' && identity.teamCode) {
    return items.filter((item) => item.teamCode === identity.teamCode)
  }
  return items
}

export function visibleItems(identity: Identity, agreementId: string): ServiceItem[] {
  return visibleItemsFor(identity, agreementId, listItems(agreementId))
}

function fail<T>(message: string): ServiceResult<T> {
  return { ok: false, message }
}

function ok<T>(message: string, data?: T): ServiceResult<T> {
  return { ok: true, message, data }
}

function addLog(draft: ReturnType<typeof db>, agreement: Agreement, action: string, detail: string, identity: Identity, version: number) {
  draft.logs.push({
    id: `LOG-${nextSeq(draft)}`,
    agreementId: agreement.id,
    agreementCode: agreement.code,
    action,
    detail,
    operatorId: identity.id,
    operatorName: identity.name,
    version,
    at: nowText(),
  })
}

function nextSeq(draft: ReturnType<typeof db>): number {
  draft.seq += 1
  return draft.seq
}

// 生效中协议只允许「追加临时加项」，正式服务项冻结以保留签订口径。
function isMutable(agreement: Agreement): boolean {
  return agreement.status === '草稿' || agreement.status === '待生效'
}

// ---------- 新建协议 ----------

export function createAgreement(
  identity: Identity,
  input: {
    airlineId: string
    title: string
    season: string
    effectiveFrom: string
    effectiveTo: string
    ownerName: string
    ownerPhone: string
    remark: string
  },
): ServiceResult<Agreement> {
  if (identity.role !== 'airline_contact') {
    return fail('只有签约航司的对接人可以新建本航司协议')
  }
  if (identity.airlineId !== input.airlineId) {
    return fail('跨航司操作被拒绝：只能维护本航司的协议')
  }
  if (!input.title.trim() || !input.season.trim() || !input.effectiveFrom || !input.effectiveTo) {
    return fail('协议名称、航季与生效起止日期必须填写完整')
  }
  if (input.effectiveFrom > input.effectiveTo) {
    return fail('生效起始日不能晚于到期日')
  }
  if (!input.ownerName.trim()) {
    return fail('签约对接人不能为空')
  }

  const stamp = nowText()
  let created: Agreement | undefined
  mutate((draft) => {
    const seq = nextSeq(draft)
    const code = `${input.airlineId}-GSA-${input.season.replace(/[^0-9A-Za-z一-龥]/g, '')}`
    const id = `AGR-${seq}`
    const agreement: Agreement = {
      id,
      code,
      airlineId: input.airlineId,
      title: input.title.trim(),
      season: input.season.trim(),
      status: '草稿',
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      owner: { id: identity.id, name: input.ownerName.trim(), phone: input.ownerPhone.trim() },
      version: 1,
      remark: input.remark.trim(),
      createdAt: stamp,
      updatedAt: stamp,
    }
    draft.agreements.push(agreement)
    draft.itemsByAgreement[id] = []
    // 建立即冻结一版草稿口径
    draft.snapshots.push(buildSnapshot(draft, agreement, stamp))
    addLog(draft, agreement, '建立协议', `建立${agreement.season}协议草稿`, identity, 1)
    created = agreement
  })
  return ok('协议草稿已建立，可逐条挂服务包与服务项', created)
}

// ---------- 改协议抬头（仅归属航司、仅可变状态） ----------

export function updateAgreementMeta(
  identity: Identity,
  agreementId: string,
  patch: Partial<Pick<Agreement, 'title' | 'season' | 'effectiveFrom' | 'effectiveTo' | 'remark'>>,
): ServiceResult {
  const agreement = getAgreement(agreementId)
  if (!agreement) return fail('没有找到这份协议')
  if (!canEdit(identity, agreement)) {
    return identity.role === 'airline_contact'
      ? fail('跨航司改动一律拒绝：这份协议不属于你所在的航司')
      : fail('当前身份只有查看权限，不能修改协议')
  }
  if (!isMutable(agreement)) return fail(`协议已「${agreement.status}」，抬头与正式服务项已冻结，只能追加临时加项`)

  const from = patch.effectiveFrom ?? agreement.effectiveFrom
  const to = patch.effectiveTo ?? agreement.effectiveTo
  if (from > to) return fail('生效起始日不能晚于到期日')

  mutate((draft) => {
    const target = mustFindAgreement(draft, agreementId)
    Object.assign(target, patch, { updatedAt: nowText() })
    addLog(draft, target, '修改抬头', '调整协议抬头/生效时段/说明', identity, target.version)
  })
  return ok('协议抬头已更新')
}

// ---------- 服务项增删改 ----------

export function upsertServiceItem(
  identity: Identity,
  agreementId: string,
  item: Omit<ServiceItem, 'id'> & { id?: string },
): ServiceResult {
  const agreement = getAgreement(agreementId)
  if (!agreement) return fail('没有找到这份协议')
  if (!canEdit(identity, agreement)) {
    return identity.role === 'airline_contact'
      ? fail('跨航司改动一律拒绝：这份协议不属于你所在的航司')
      : fail('当前身份只有查看权限，不能维护服务项')
  }
  if (!item.name.trim() || !item.packageName.trim() || !item.teamCode) {
    return fail('服务包、服务项名称与执行班组必须填写')
  }
  if (!item.effectiveFrom || !item.effectiveTo || item.effectiveFrom > item.effectiveTo) {
    return fail('服务项生效日期不合法')
  }
  if (item.effectiveFrom < agreement.effectiveFrom || item.effectiveTo > agreement.effectiveTo) {
    return fail('服务项生效日期必须落在协议有效期内')
  }

  const editing = !!item.id
  const editingId = item.id
  if (editing) {
    if (agreement.status === '生效中') {
      return fail('生效中的协议不能修改已签订的服务项；确需补充请走「临时加项」追加')
    }
    if (!isMutable(agreement)) return fail('已失效协议的服务项不可修改')
  } else if (agreement.status === '生效中' && !item.isAdHoc) {
    return fail('生效中的协议只能追加「临时加项」，不能新增正式服务项')
  } else if (agreement.status === '已失效') {
    return fail('已失效协议不能再挂服务项')
  }

  mutate((draft) => {
    const target = mustFindAgreement(draft, agreementId)
    const list = draft.itemsByAgreement[agreementId] ?? (draft.itemsByAgreement[agreementId] = [])
    if (editing && editingId) {
      const idx = list.findIndex((row) => row.id === editingId)
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...withoutId(item), id: editingId }
      }
      addLog(draft, target, '修改服务项', `调整服务项「${item.name}」`, identity, target.version)
    } else {
      const id = `SI-${nextSeq(draft)}`
      list.push({ ...withoutId(item), id })
      addLog(
        draft,
        target,
        item.isAdHoc ? '临时加项' : '新增服务项',
        `${item.isAdHoc ? '临时加项' : '新增服务项'}「${item.name}」（${item.effectiveFrom} 起）`,
        identity,
        target.version,
      )
      if (target.status === '生效中' && item.isAdHoc) {
        pushTodo(draft, {
          type: '临时加项',
          airlineId: target.airlineId,
          agreementId: target.id,
          agreementCode: target.code,
          title: `${airlineName(target.airlineId)} 临时加项待排班`,
          summary: `「${item.name}」自 ${item.effectiveFrom} 起执行，执行班组：${teamName(item.teamCode)}`,
          refDate: item.effectiveFrom,
        })
      }
    }
    target.updatedAt = nowText()
  })
  return ok(editing ? '服务项已更新' : item.isAdHoc ? '临时加项已挂接并进入调度待办' : '服务项已挂接到协议')
}

export function removeServiceItem(identity: Identity, agreementId: string, itemId: string): ServiceResult {
  const agreement = getAgreement(agreementId)
  if (!agreement) return fail('没有找到这份协议')
  if (!canEdit(identity, agreement)) return fail('无权删除该协议的服务项')
  if (!isMutable(agreement)) return fail(`协议已「${agreement.status}」，已签订口径不可删除；生效中只能追加临时加项`)

  let removedName = ''
  mutate((draft) => {
    const target = mustFindAgreement(draft, agreementId)
    const list = draft.itemsByAgreement[agreementId] ?? []
    const idx = list.findIndex((row) => row.id === itemId)
    if (idx >= 0) {
      removedName = list[idx].name
      list.splice(idx, 1)
    }
    addLog(draft, target, '删除服务项', `移除服务项「${removedName}」`, identity, target.version)
    target.updatedAt = nowText()
  })
  return ok('服务项已从草稿/待生效协议中移除')
}

function withoutId<T extends { id?: string }>(item: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = item
  void _id
  return rest
}

// ---------- 状态机：只许逐段向前，不许跳步、不许回退 ----------

export function nextAction(status: AgreementStatus): string | undefined {
  return AGREEMENT_TRANSITIONS.find((item) => item.from === status)?.action
}

export function advanceStatus(identity: Identity, agreementId: string): ServiceResult {
  const agreement = getAgreement(agreementId)
  if (!agreement) return fail('没有找到这份协议')
  if (identity.role === 'team') return fail('班组只有查看权限，不能推进协议状态')

  const transition = AGREEMENT_TRANSITIONS.find((item) => item.from === agreement.status)
  if (!transition) return fail(`协议已到终态「${agreement.status}」，不能再推进，也不能改回生效中`)

  // 待生效 → 生效中：归属对接人可提交、管理员可放行；跨航司对接人拦截。
  if (identity.role === 'airline_contact' && identity.airlineId !== agreement.airlineId) {
    return fail('跨航司改动一律拒绝：这份协议不属于你所在的航司')
  }

  if (transition.to === '生效中') {
    if ((listItems(agreementId) ?? []).length === 0) {
      return fail('协议还没有挂任何服务包/服务项，不能生效')
    }
    // 同一航司同一时段存在重叠的生效中/待生效协议时，必须先裁决，否则不许生效。
    const blockers = findOverlaps(agreement).filter((other) => other.status === '生效中' || other.status === '待生效')
    if (blockers.length > 0) {
      const unresolved = blockers.filter((other) => !arbitrationSettled(agreement.id, other.id))
      if (unresolved.length > 0) {
        return fail(
          `与 ${unresolved.map((item) => `「${item.code}」`).join('、')} 时段重叠，须先由管理员裁决执行版本并写明说明，再生效`,
        )
      }
      // 已裁决但本协议不是胜出方：不允许生效。
      const lost = unresolvedOrLostAsLoser(agreement, blockers)
      if (lost) return fail(`该重叠已裁决以「${lost.winnerCode}」为准，本协议不作为执行版本，不能生效`)
    }
  }

  let snapshot: AgreementSnapshot | undefined
  mutate((draft) => {
    const target = mustFindAgreement(draft, agreementId)
    target.status = transition.to
    target.version += 1
    target.updatedAt = nowText()
    snapshot = buildSnapshot(draft, target, nowText())
    draft.snapshots.push(snapshot!)
    addLog(draft, target, transition.action, `状态由「${transition.from}」推进到「${transition.to}」`, identity, target.version)

    if (transition.to === '生效中') {
      pushTodo(draft, {
        type: '协议生效',
        airlineId: target.airlineId,
        agreementId: target.id,
        agreementCode: target.code,
        title: `${airlineName(target.airlineId)} ${target.season}协议已生效`,
        summary: `共 ${(draft.itemsByAgreement[target.id] ?? []).length} 条服务项自 ${target.effectiveFrom} 起可调度`,
        refDate: target.effectiveFrom,
      })
    }
    if (transition.to === '已失效') {
      pushTodo(draft, {
        type: '协议失效',
        airlineId: target.airlineId,
        agreementId: target.id,
        agreementCode: target.code,
        title: `${airlineName(target.airlineId)} ${target.season}协议已失效`,
        summary: `协议于 ${target.effectiveTo} 到期，停止相关服务项调度与计费`,
        refDate: target.effectiveTo,
      })
    }
  })
  return ok(`协议已${transition.action}，当前状态「${transition.to}」，口径已冻结为第 ${snapshot?.version} 版快照`)
}

function unresolvedOrLostAsLoser(
  agreement: Agreement,
  overlaps: Agreement[],
): { winnerCode: string } | null {
  for (const arb of db().arbitrations) {
    const pair = [arb.winnerAgreementId, arb.loserAgreementId]
    if (pair.includes(agreement.id)) {
      if (arb.loserAgreementId === agreement.id) {
        const winner = overlaps.find((item) => item.id === arb.winnerAgreementId)
        return { winnerCode: winner?.code ?? arb.winnerAgreementId }
      }
    }
  }
  return null
}

export function buildSnapshot(draft: ReturnType<typeof db>, agreement: Agreement, capturedAt: string): AgreementSnapshot {
  return {
    id: `SNP-${agreement.id}-V${agreement.version}-${draft.seq + 1}`,
    agreementId: agreement.id,
    agreementCode: agreement.code,
    airlineId: agreement.airlineId,
    season: agreement.season,
    version: agreement.version,
    status: agreement.status,
    effectiveFrom: agreement.effectiveFrom,
    effectiveTo: agreement.effectiveTo,
    ownerName: agreement.owner.name,
    items: JSON.parse(JSON.stringify(draft.itemsByAgreement[agreement.id] ?? [])) as ServiceItem[],
    capturedAt,
  }
}

function mustFindAgreement(draft: ReturnType<typeof db>, id: string): Agreement {
  const target = draft.agreements.find((item) => item.id === id)
  if (!target) throw new Error('协议不存在')
  return target
}

// ---------- 重叠检测与裁决 ----------

export function findOverlaps(agreement: Agreement): Agreement[] {
  return db().agreements.filter(
    (other) =>
      other.id !== agreement.id &&
      other.airlineId === agreement.airlineId &&
      periodOverlap(agreement.effectiveFrom, agreement.effectiveTo, other.effectiveFrom, other.effectiveTo) &&
      other.status !== '已失效',
  )
}

export type OverlapGroup = {
  airlineId: string
  airline: string
  periodFrom: string
  periodTo: string
  agreements: Agreement[]
  arbitration?: ArbitrationNote
}

export function listOverlapGroups(): OverlapGroup[] {
  const groups: OverlapGroup[] = []
  const seen = new Set<string>()
  for (const agreement of listAgreements()) {
    if (agreement.status === '已失效') continue
    const overlaps = findOverlaps(agreement)
    for (const other of overlaps) {
      const key = [agreement.airlineId, [agreement.id, other.id].sort().join('|')].sort().join('#')
      const dedupeKey = `${agreement.airlineId}#${[agreement.id, other.id].sort().join('|')}`
      void key
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      const members = [agreement, other].sort((a, b) => a.code.localeCompare(b.code))
      const arbitration = db().arbitrations.find(
        (arb) =>
          arb.airlineId === agreement.airlineId &&
          [agreement.id, other.id].includes(arb.winnerAgreementId) &&
          [agreement.id, other.id].includes(arb.loserAgreementId),
      )
      groups.push({
        airlineId: agreement.airlineId,
        airline: airlineName(agreement.airlineId),
        periodFrom: agreement.effectiveFrom > other.effectiveFrom ? other.effectiveFrom : agreement.effectiveFrom,
        periodTo: agreement.effectiveTo < other.effectiveTo ? other.effectiveTo : agreement.effectiveTo,
        agreements: members,
        arbitration,
      })
    }
  }
  return groups
}

export function arbitrationSettled(agreementIdA: string, agreementIdB: string): boolean {
  return db().arbitrations.some(
    (arb) =>
      [arb.winnerAgreementId, arb.loserAgreementId].includes(agreementIdA) &&
      [arb.winnerAgreementId, arb.loserAgreementId].includes(agreementIdB),
  )
}

export function arbitrate(
  identity: Identity,
  input: { winnerAgreementId: string; loserAgreementId: string; note: string },
): ServiceResult {
  if (identity.role !== 'admin') return fail('重叠协议的执行版本只能由管理员裁决')
  if (!input.note.trim()) return fail('裁决理由必须写进说明，不能为空')
  const winner = getAgreement(input.winnerAgreementId)
  const loser = getAgreement(input.loserAgreementId)
  if (!winner || !loser) return fail('裁决选择的协议不存在')
  if (winner.airlineId !== loser.airlineId) return fail('只能裁决同一家航司的重叠协议')
  if (winner.id === loser.id) return fail('胜出方与非执行方不能是同一份协议')
  if (!periodOverlap(winner.effectiveFrom, winner.effectiveTo, loser.effectiveFrom, loser.effectiveTo)) {
    return fail('两份协议时段不重叠，无需裁决'  )
  }
  if (arbitrationSettled(winner.id, loser.id)) return fail('这对重叠协议已经裁决过')

  mutate((draft) => {
    const stamp = nowText()
    const record: ArbitrationNote = {
      id: `ARB-${nextSeq(draft)}`,
      airlineId: winner.airlineId,
      winnerAgreementId: winner.id,
      loserAgreementId: loser.id,
      periodFrom: winner.effectiveFrom > loser.effectiveFrom ? loser.effectiveFrom : winner.effectiveFrom,
      periodTo: winner.effectiveTo < loser.effectiveTo ? loser.effectiveTo : winner.effectiveTo,
      note: input.note.trim(),
      operatorId: identity.id,
      operatorName: identity.name,
      at: stamp,
    }
    draft.arbitrations.push(record)
    const w = mustFindAgreement(draft, winner.id)
    const l = mustFindAgreement(draft, loser.id)
    addLog(draft, w, '重叠裁决', `裁决以本协议为准，非执行版本「${loser.code}」；理由：${input.note.trim()}`, identity, w.version)
    addLog(draft, l, '重叠裁决', `裁决以「${winner.code}」为准，本协议作为非执行版本；理由：${input.note.trim()}`, identity, l.version)
    pushTodo(draft, {
      type: '重叠裁决',
      airlineId: winner.airlineId,
      agreementId: winner.id,
      agreementCode: winner.code,
      title: `${airlineName(winner.airlineId)} 换季重叠已裁决`,
      summary: `以「${winner.code}」为执行版本，「${loser.code}」不执行；${input.note.trim()}`,
      refDate: winner.effectiveFrom,
    })
  })
  return ok('裁决已记录并写入说明，调度将只按胜出版本提供可用服务项')
}

// 某航司在指定日期被裁决压制（作为非执行方）的协议 id 集合
function suppressedAgreementIds(airlineId: string): Set<string> {
  const set = new Set<string>()
  for (const arb of db().arbitrations) {
    if (arb.airlineId === airlineId) set.add(arb.loserAgreementId)
  }
  return set
}

// ---------- 归属变更：仅管理员，必须留下归属变更记录 ----------

export function transferOwnership(
  identity: Identity,
  agreementId: string,
  nextOwner: { id: string; name: string; phone: string },
  reason: string,
): ServiceResult {
  if (identity.role !== 'admin') return fail('变更协议归属需要管理员身份')
  const agreement = getAgreement(agreementId)
  if (!agreement) return fail('没有找到这份协议')
  if (agreement.status === '已失效') return fail('已失效协议不再变更归属')
  if (!nextOwner.name.trim()) return fail('新对接人不能为空')
  if (!reason.trim()) return fail('归属变更必须填写变更原因，留痕可追溯')

  mutate((draft) => {
    const target = mustFindAgreement(draft, agreementId)
    const fromOwner = `${target.owner.name}（${target.owner.phone || '无电话'}）`
    target.owner = { id: nextOwner.id, name: nextOwner.name.trim(), phone: nextOwner.phone.trim() }
    target.updatedAt = nowText()
    draft.ownershipChanges.push({
      id: `OWN-${nextSeq(draft)}`,
      agreementId: target.id,
      agreementCode: target.code,
      airlineId: target.airlineId,
      fromOwner,
      toOwner: `${nextOwner.name.trim()}（${nextOwner.phone.trim() || '无电话'}）`,
      reason: reason.trim(),
      operatorId: identity.id,
      operatorName: identity.name,
      at: nowText(),
    })
    addLog(draft, target, '归属变更', `对接人由 ${fromOwner} 变更为 ${nextOwner.name.trim()}；原因：${reason.trim()}`, identity, target.version)
  })
  return ok('协议归属已变更，变更记录已留痕')
}

// ---------- 资源调度：可用服务项（调度与计费共用的唯一口径） ----------

export type AvailableItem = ServiceItem & {
  agreementId: string
  agreementCode: string
  airlineId: string
  airlineName: string
  season: string
}

// 生效中协议 + 当日落在服务项有效期 + 未被重叠裁决压制。
// 班组身份自动只返回本班组项；调度页读到什么，计费引用就只能引用什么。
export function availableItems(identity: Identity, date: string = todayIso()): AvailableItem[] {
  const suppressed = new Map<string, Set<string>>()
  for (const airlineId of new Set(db().agreements.map((item) => item.airlineId))) {
    suppressed.set(airlineId, suppressedAgreementIds(airlineId))
  }

  const result: AvailableItem[] = []
  for (const agreement of db().agreements) {
    if (agreement.status !== '生效中') continue
    if (identity.role === 'airline_contact' && identity.airlineId !== agreement.airlineId) continue
    if (identity.role === 'team' && identity.teamCode) {
      const belongs = (db().itemsByAgreement[agreement.id] ?? []).some(
        (item) => item.teamCode === identity.teamCode,
      )
      if (!belongs) continue
    }
    if (suppressed.get(agreement.airlineId)?.has(agreement.id)) continue
    if (date < agreement.effectiveFrom || date > agreement.effectiveTo) continue

    for (const item of db().itemsByAgreement[agreement.id] ?? []) {
      if (identity.role === 'team' && item.teamCode !== identity.teamCode) continue
      if (date < item.effectiveFrom || date > item.effectiveTo) continue
      result.push({
        ...item,
        agreementId: agreement.id,
        agreementCode: agreement.code,
        airlineId: agreement.airlineId,
        airlineName: airlineName(agreement.airlineId),
        season: agreement.season,
      })
    }
  }
  return result.sort((a, b) => a.airlineId.localeCompare(b.airlineId) || a.teamCode.localeCompare(b.teamCode) || a.name.localeCompare(b.name))
}

// ---------- 待办 ----------

type TodoInput = Omit<DispatchTodo, 'id' | 'done' | 'createdAt'>

function pushTodo(draft: ReturnType<typeof db>, input: TodoInput) {
  // 同一协议同一类型的待办去重：状态反复/多次加项不会让调度读到两条互相打架的任务。
  const dedupe = `${input.type}#${input.agreementId}`
  const existingIdx = draft.todos.findIndex(
    (item) => `${item.type}#${item.agreementId}` === dedupe && item.title === input.title,
  )
  const todo: DispatchTodo = {
    ...input,
    id: `TODO-${nextSeq(draft)}`,
    done: false,
    createdAt: nowText(),
  }
  if (existingIdx >= 0) {
    draft.todos[existingIdx] = { ...todo, id: draft.todos[existingIdx].id, done: draft.todos[existingIdx].done }
  } else {
    draft.todos.push(todo)
  }
}

export function listTodos(identity: Identity): DispatchTodo[] {
  return [...db().todos]
    .filter((todo) => {
      if (identity.role === 'admin') return true
      if (identity.role === 'airline_contact') return todo.airlineId === identity.airlineId
      // 班组只看与自己班组相关的待办（按协议下是否存在本班组项判断）
      if (identity.role === 'team' && identity.teamCode) {
        return (db().itemsByAgreement[todo.agreementId] ?? []).some((item) => item.teamCode === identity.teamCode)
      }
      return false
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt.localeCompare(a.createdAt))
}

export function markTodoDone(identity: Identity, todoId: string, done: boolean): ServiceResult {
  if (identity.role === 'team') return fail('班组只能查看待办，标记完成由调度管理员操作')
  const target = db().todos.find((item) => item.id === todoId)
  if (!target) return fail('待办不存在')
  if (identity.role === 'airline_contact' && identity.airlineId !== target.airlineId) {
    return fail('跨航司操作被拒绝')
  }
  mutate((draft) => {
    const todo = draft.todos.find((item) => item.id === todoId)
    if (todo) todo.done = done
  })
  return ok(done ? '待办已标记完成' : '待办已恢复为未完成')
}

// ---------- 计费引用：只能引用生效中、当日可用的服务项 ----------

export function listBillingRefs(identity: Identity): BillingReference[] {
  return [...db().billingRefs]
    .filter((ref) => {
      if (identity.role === 'admin') return true
      if (identity.role === 'airline_contact') return ref.airlineId === identity.airlineId
      if (identity.role === 'team') return ref.teamCode === identity.teamCode
      return false
    })
    .sort((a, b) => b.at.localeCompare(a.at))
}

export function canReferenceForBilling(
  identity: Identity,
  agreementId: string,
  itemId: string,
  date: string = todayIso(),
): boolean {
  return availableItems(identity, date).some((item) => item.agreementId === agreementId && item.id === itemId)
}

export function createBillingReference(
  identity: Identity,
  agreementId: string,
  itemId: string,
  periodLabel: string,
): ServiceResult<BillingReference> {
  if (!periodLabel.trim()) return fail('计费周期必须填写')
  const agreement = getAgreement(agreementId)
  if (!agreement) return fail('协议不存在')
  // 没生效的不许被计费引用：草稿/待生效直接拦掉。
  if (agreement.status !== '生效中') {
    return fail(`只有「生效中」的协议可以被计费引用，当前为「${agreement.status}」`)
  }
  if (identity.role === 'airline_contact' && identity.airlineId !== agreement.airlineId) {
    return fail('跨航司操作被拒绝')
  }
  const item = listItems(agreementId).find((row) => row.id === itemId)
  if (!item) return fail('服务项不存在')
  if (identity.role === 'team' && item.teamCode !== identity.teamCode) {
    return fail('班组只能引用自己对应班组的服务项')
  }
  // 终态一致性：必须出现在「当日可用服务项」里，裁决压制/超期/已失效都拿不到。
  if (!canReferenceForBilling(identity, agreementId, itemId)) {
    return fail('该服务项当前不在可用口径内（可能已超期、协议失效或重叠裁决未采用本版本），不能计费引用')
  }

  let ref: BillingReference | undefined
  mutate((draft) => {
    const seq = nextSeq(draft)
    ref = {
      id: `BIL-${seq}`,
      refNo: `BILL-${String(seq).padStart(6, '0')}`,
      agreementId: agreement.id,
      agreementCode: agreement.code,
      agreementVersion: agreement.version,
      airlineId: agreement.airlineId,
      teamCode: item.teamCode,
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      price: item.price,
      periodLabel: periodLabel.trim(),
      isAdHoc: item.isAdHoc,
      operatorId: identity.id,
      operatorName: identity.name,
      at: nowText(),
    }
    draft.billingRefs.push(ref!)
    addLog(draft, agreement, '计费引用', `服务项「${item.name}」被计费引用（${periodLabel.trim()}），按第 ${agreement.version} 版口径快照`, identity, agreement.version)
  })
  return ok('已按当前口径生成计费引用，单价与项目口径已随单冻结', ref)
}
