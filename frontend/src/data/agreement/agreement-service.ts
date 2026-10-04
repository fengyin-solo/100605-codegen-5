import {
  getActor,
  getAirline,
  getPackage,
  getServiceItem,
  getTeam,
} from './catalog'
import { BUSINESS_TODAY } from './seed'
import { domainState, nextId, persist, resetDomain } from './store'
import type {
  ActionLogEntry,
  Actor,
  Agreement,
  AgreementLine,
  AgreementSnapshot,
  AgreementStatus,
  Arbitration,
  BillingRef,
  DomainState,
  FrozenLine,
  ScheduleTodo,
} from './types'

export type ServiceResult<T = undefined> = { ok: boolean; message: string; data?: T }

// 状态机：只能顺着草稿 → 待生效 → 生效中 → 已失效逐段推进，不得跳步、不得回退。
const NEXT_STATUS: Record<AgreementStatus, AgreementStatus | null> = {
  草稿: '待生效',
  待生效: '生效中',
  生效中: '已失效',
  已失效: null,
}

function nowText(): string {
  const stamp = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${BUSINESS_TODAY} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`
}

function state(): DomainState {
  return domainState()
}

function save(): void {
  persist()
}

function findAgreement(id: string): Agreement | undefined {
  return state().agreements.find((item) => item.id === id)
}

function requireActor(actorId: string): Actor {
  const actor = getActor(actorId)
  if (!actor) {
    throw new Error(`未知操作身份：${actorId}`)
  }
  return actor
}

function addLog(agreementId: string, actor: Actor, action: string, detail: string): void {
  const entry: ActionLogEntry = {
    id: nextId('LOG'),
    agreementId,
    at: nowText(),
    actorId: actor.id,
    actorName: actor.name,
    action,
    detail,
  }
  state().logs.unshift(entry)
}

function addTodo(todo: Omit<ScheduleTodo, 'id' | 'at' | 'read'>): void {
  state().todos.unshift({
    ...todo,
    id: nextId('TD'),
    at: nowText(),
    read: false,
  })
}

// ---------- 可见性与权限 ----------

export function canViewAgreements(actor: Actor): boolean {
  // 所有在册身份都能看到协议清单，区别只在能看到哪些字段、能不能改。
  return Boolean(actor)
}

export function canViewAgreement(actor: Actor, agreement: Agreement): boolean {
  if (actor.role === 'manager' || actor.role === 'scheduler' || actor.role === 'team') {
    return true
  }
  return actor.airlineId === agreement.airlineId
}

/** 协议内容只有签约航司的当前归属对接人能改；跨航司改动一律拒绝。 */
export function canMaintain(actor: Actor, agreement: Agreement): boolean {
  return actor.role === 'airline'
    && actor.airlineId === agreement.airlineId
    && actor.id === agreement.ownerId
}

export function canTransfer(actor: Actor, agreement: Agreement): boolean {
  if (actor.role === 'manager') {
    return true
  }
  return canMaintain(actor, agreement)
}

export function canArbitrate(actor: Actor): boolean {
  return actor.role === 'manager'
}

export function visibleLines(actor: Actor, agreement: Agreement): AgreementLine[] {
  // 班组只能看到自己对应的服务项；其余身份看全量。
  if (actor.role !== 'team') {
    return agreement.lines
  }
  return agreement.lines.filter((row) => {
    const item = getServiceItem(row.serviceItemId)
    return item?.teamId === actor.teamId
  })
}

// ---------- 查询 ----------

export type AgreementFilter = {
  airlineId?: string
  status?: AgreementStatus | ''
  keyword?: string
}

export function listAgreements(actorId: string, filter: AgreementFilter = {}): Agreement[] {
  const actor = requireActor(actorId)
  const rows = state().agreements.filter((agreement) => canViewAgreement(actor, agreement))
  return rows.filter((agreement) => {
    if (filter.airlineId && agreement.airlineId !== filter.airlineId) {
      return false
    }
    if (filter.status && agreement.status !== filter.status) {
      return false
    }
    if (filter.keyword) {
      const keyword = filter.keyword.trim()
      const hit = `${agreement.code} ${agreement.subject}`.includes(keyword)
      if (!hit) {
        return false
      }
    }
    return true
  })
}

export function listOwnershipChanges(agreementId?: string) {
  const rows = state().ownershipChanges
  return agreementId ? rows.filter((row) => row.agreementId === agreementId) : rows
}

export function listArbitrations(agreementId?: string): Arbitration[] {
  const rows = state().arbitrations
  return agreementId
    ? rows.filter((row) => row.winnerAgreementId === agreementId || row.loserAgreementId === agreementId)
    : rows
}

export function listLogs(agreementId: string): ActionLogEntry[] {
  return state().logs.filter((row) => row.agreementId === agreementId)
}

export function listSnapshots(agreementId: string): AgreementSnapshot[] {
  return state().snapshots
    .filter((row) => row.agreementId === agreementId)
    .sort((a, b) => b.version - a.version)
}

export function listBillingRefs(agreementId?: string): BillingRef[] {
  const rows = state().billingRefs
  return agreementId ? rows.filter((row) => row.agreementId === agreementId) : rows
}

export function listTodos(actorId: string): ScheduleTodo[] {
  const actor = requireActor(actorId)
  if (actor.role === 'team') {
    return []
  }
  return state().todos
}

export function ackTodo(actorId: string, todoId: string): ServiceResult {
  const actor = requireActor(actorId)
  if (actor.role !== 'scheduler' && actor.role !== 'manager') {
    return { ok: false, message: '只有资源调度/管理员可以处理待办' }
  }
  const todo = state().todos.find((item) => item.id === todoId)
  if (!todo) {
    return { ok: false, message: '待办不存在' }
  }
  todo.read = true
  save()
  return { ok: true, message: `待办「${todo.title}」已标记处理` }
}

// ---------- 协议主体维护 ----------

export type AgreementDraftInput = {
  code: string
  subject: string
  airlineId: string
  effectiveDate: string
  expiryDate: string
  note: string
}

export function createAgreement(actorId: string, input: AgreementDraftInput): ServiceResult<Agreement> {
  const actor = requireActor(actorId)
  if (actor.role !== 'airline') {
    return { ok: false, message: '协议只能由签约航司的对接人登记，班组与调度仅有查看权限' }
  }
  const code = input.code.trim()
  const subject = input.subject.trim()
  if (!code || !subject) {
    return { ok: false, message: '协议编号与协议主体名称不能为空' }
  }
  if (!input.effectiveDate || !input.expiryDate || input.effectiveDate >= input.expiryDate) {
    return { ok: false, message: '生效日期需早于失效日期' }
  }
  if (state().agreements.some((item) => item.code === code)) {
    return { ok: false, message: `协议编号 ${code} 已存在` }
  }
  const agreement: Agreement = {
    id: nextId('A'),
    code,
    airlineId: actor.airlineId!,
    subject,
    ownerId: actor.id,
    signDate: '',
    effectiveDate: input.effectiveDate,
    expiryDate: input.expiryDate,
    status: '草稿',
    note: input.note.trim(),
    lines: [],
    createdAt: nowText(),
    updatedAt: nowText(),
  }
  state().agreements.unshift(agreement)
  addLog(agreement.id, actor, '新建协议', `${code} 建立草稿，归属对接人：${actor.name}`)
  save()
  return { ok: true, message: `协议 ${code} 已建立草稿`, data: agreement }
}

export function updateHeader(
  actorId: string,
  agreementId: string,
  patch: Partial<Pick<Agreement, 'subject' | 'effectiveDate' | 'expiryDate' | 'note' | 'code'>>,
): ServiceResult {
  const actor = requireActor(actorId)
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  if (actor.role === 'airline' && actor.airlineId !== agreement.airlineId) {
    return { ok: false, message: '跨航司改动一律拒绝：这不是你所属航司的协议' }
  }
  if (!canMaintain(actor, agreement)) {
    return { ok: false, message: '只有当前归属对接人可以修改协议主体；如需接管请先走归属变更' }
  }
  if (agreement.status !== '草稿') {
    return { ok: false, message: '协议一旦提交，主体内容即冻结；换季后的调整请签新协议或挂临时加项' }
  }
  const next = { ...agreement, ...patch }
  if (next.effectiveDate >= next.expiryDate) {
    return { ok: false, message: '生效日期需早于失效日期' }
  }
  if (patch.code && state().agreements.some((item) => item.id !== agreement.id && item.code === patch.code)) {
    return { ok: false, message: `协议编号 ${patch.code} 已存在` }
  }
  Object.assign(agreement, patch, { updatedAt: nowText() })
  addLog(agreement.id, actor, '修改协议主体', `草稿主体信息更新`)
  save()
  return { ok: true, message: '协议主体已更新' }
}

// ---------- 服务项挂接 ----------

export type AttachLineInput = {
  serviceItemId: string
  kind: AgreementLine['kind']
  effectiveDate: string
  price?: number
  note?: string
}

export function attachLine(actorId: string, agreementId: string, input: AttachLineInput): ServiceResult {
  const actor = requireActor(actorId)
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  if (actor.role === 'airline' && actor.airlineId !== agreement.airlineId) {
    return { ok: false, message: '跨航司改动一律拒绝：这不是你所属航司的协议' }
  }
  if (!canMaintain(actor, agreement)) {
    return { ok: false, message: '只有当前归属对接人可以挂服务项' }
  }
  if (agreement.status === '已失效') {
    return { ok: false, message: '已失效协议不能再挂服务项' }
  }
  const item = getServiceItem(input.serviceItemId)
  if (!item) {
    return { ok: false, message: '服务项目录中不存在该项' }
  }
  if (agreement.lines.some((row) => row.serviceItemId === input.serviceItemId)) {
    return { ok: false, message: `「${item.name}」已挂在本协议中，不允许重复挂接` }
  }
  if (!input.effectiveDate || input.effectiveDate < agreement.effectiveDate || input.effectiveDate > agreement.expiryDate) {
    return { ok: false, message: '服务项生效日期必须落在协议有效期内' }
  }
  // 非草稿阶段，正式口径已冻结，只能以「临时加项」追加。
  if (agreement.status !== '草稿' && input.kind === '正式') {
    return { ok: false, message: '协议提交后正式服务口径已冻结，新增内容只能以临时加项挂接' }
  }
  const price = input.price ?? item.referencePrice
  if (Number.isNaN(price) || price < 0) {
    return { ok: false, message: '协议价不合法' }
  }
  const row: AgreementLine = {
    id: nextId('L'),
    serviceItemId: item.id,
    kind: input.kind,
    confirmed: false,
    effectiveDate: input.effectiveDate,
    price,
    unit: item.unit,
    note: input.note?.trim() ?? '',
    attachedAt: nowText(),
  }
  agreement.lines.push(row)
  agreement.updatedAt = nowText()
  addLog(
    agreement.id,
    actor,
    '挂载服务项',
    `${input.kind}「${item.name}」，生效日 ${input.effectiveDate}，待对接人确认`,
  )
  if (agreement.status === '生效中') {
    addTodo({
      kind: '临时加项确认',
      title: `待确认临时加项：${getAirline(agreement.airlineId)?.shortName}《${item.name}》`,
      detail: `${agreement.code} 新增临时加项，须由归属对接人确认后才进入可用服务项与计费口径。`,
      airlineId: agreement.airlineId,
      agreementId: agreement.id,
    })
  }
  save()
  return { ok: true, message: `已挂接${input.kind}「${item.name}」，等待对接人确认` }
}

export function removeLine(actorId: string, agreementId: string, lineId: string): ServiceResult {
  const actor = requireActor(actorId)
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  if (actor.role === 'airline' && actor.airlineId !== agreement.airlineId) {
    return { ok: false, message: '跨航司改动一律拒绝：这不是你所属航司的协议' }
  }
  if (!canMaintain(actor, agreement)) {
    return { ok: false, message: '只有当前归属对接人可以移除服务项' }
  }
  const line = agreement.lines.find((row) => row.id === lineId)
  if (!line) {
    return { ok: false, message: '服务项不存在' }
  }
  if (line.confirmed) {
    return { ok: false, message: '该服务项已按签订口径确认并冻结进历史快照，不能删除，历史口径必须保留' }
  }
  agreement.lines = agreement.lines.filter((row) => row.id !== lineId)
  agreement.updatedAt = nowText()
  const item = getServiceItem(line.serviceItemId)
  addLog(agreement.id, actor, '移除服务项', `移除未确认的${line.kind}「${item?.name ?? line.serviceItemId}」`)
  save()
  return { ok: true, message: '未确认服务项已移除' }
}

export function confirmTempLine(actorId: string, agreementId: string, lineId: string, note: string): ServiceResult {
  const actor = requireActor(actorId)
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  if (actor.role === 'airline' && actor.airlineId !== agreement.airlineId) {
    return { ok: false, message: '跨航司改动一律拒绝：这不是你所属航司的协议' }
  }
  if (!canMaintain(actor, agreement)) {
    return { ok: false, message: '临时加项必须由签约航司的归属对接人确认才算数' }
  }
  const line = agreement.lines.find((row) => row.id === lineId)
  if (!line) {
    return { ok: false, message: '服务项不存在' }
  }
  if (line.kind !== '临时加项') {
    return { ok: false, message: '只有临时加项需要单独确认，正式项随签订自动确认' }
  }
  if (line.confirmed) {
    return { ok: false, message: '该临时加项已经确认，无需重复确认' }
  }
  line.confirmed = true
  line.note = note.trim() || `经对接人${actor.name}确认`
  agreement.updatedAt = nowText()
  const item = getServiceItem(line.serviceItemId)!
  addLog(agreement.id, actor, '确认临时加项', `「${item.name}」确认生效，生效日 ${line.effectiveDate}`)
  // 已生效协议中的临时加项确认后，形成新的冻结版本；历史版本原样保留。
  if (agreement.status === '生效中') {
    freezeSnapshot(agreement, actor, `临时加项「${item.name}」经对接人确认`)
    addTodo({
      kind: '临时加项确认',
      title: `临时加项已确认：${getAirline(agreement.airlineId)?.shortName}《${item.name}》`,
      detail: `${agreement.code} 的临时加项已确认，自 ${line.effectiveDate} 起进入调度可用服务项。`,
      airlineId: agreement.airlineId,
      agreementId: agreement.id,
    })
  }
  save()
  return { ok: true, message: `临时加项「${item.name}」已确认` }
}

// ---------- 状态机 ----------

export function submitDraft(actorId: string, agreementId: string): ServiceResult {
  const actor = requireActor(actorId)
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  if (actor.role === 'airline' && actor.airlineId !== agreement.airlineId) {
    return { ok: false, message: '跨航司改动一律拒绝：这不是你所属航司的协议' }
  }
  if (!canMaintain(actor, agreement)) {
    return { ok: false, message: '只有当前归属对接人可以提交协议' }
  }
  return advance(agreement, actor, '待生效', () => {
    if (agreement.lines.length === 0) {
      return '协议还没有挂任何服务项，不能提交'
    }
    const pendingTemp = agreement.lines.filter((row) => row.kind === '临时加项' && !row.confirmed)
    if (pendingTemp.length > 0) {
      return `还有 ${pendingTemp.length} 条临时加项未确认：临时加项须对接人确认后才能随协议提交`
    }
    if (!agreement.effectiveDate || !agreement.expiryDate) {
      return '协议生效/失效日期不完整'
    }
    // 正式项签订即确认；补签签订日期。
    agreement.lines.forEach((row) => {
      if (row.kind === '正式') {
        row.confirmed = true
      }
    })
    if (!agreement.signDate) {
      agreement.signDate = BUSINESS_TODAY
    }
    return ''
  })
}

export function activateAgreement(actorId: string, agreementId: string): ServiceResult {
  const actor = requireActor(actorId)
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  if (actor.role === 'airline' && actor.airlineId !== agreement.airlineId) {
    return { ok: false, message: '跨航司改动一律拒绝：这不是你所属航司的协议' }
  }
  if (!canMaintain(actor, agreement)) {
    return { ok: false, message: '只有当前归属对接人可以把协议推进生效' }
  }
  return advance(agreement, actor, '生效中', () => {
    const pendingTemp = agreement.lines.filter((row) => row.kind === '临时加项' && !row.confirmed)
    if (pendingTemp.length > 0) {
      return `还有 ${pendingTemp.length} 条临时加项未确认，不能生效`
    }
    // 生效前必须裁决同一航司同时段的重叠协议，没裁决不能放行。
    const overlap = state().agreements.find(
      (other) =>
        other.id !== agreement.id
        && other.airlineId === agreement.airlineId
        && other.status === '生效中'
        && windowsOverlap(agreement, other),
    )
    if (overlap) {
      const verdict = arbitrationBetween(agreement.id, overlap.id)
      if (!verdict) {
        return `与生效中的 ${overlap.code} 时段重叠，需先由管理员裁决执行口径后才能生效`
      }
      if (verdict.winnerAgreementId !== agreement.id) {
        return `裁决结果为 ${overlap.code} 优先执行，本协议在重叠时段不得生效，请先调整协议安排`
      }
    }
    freezeSnapshot(agreement, actor, '协议生效，按签订口径冻结')
    addTodo({
      kind: '协议生效',
      title: `协议生效：${agreement.code}`,
      detail: `${getAirline(agreement.airlineId)?.shortName}协议自 ${agreement.effectiveDate} 起生效，共 ${agreement.lines.length} 项服务已纳入调度。`,
      airlineId: agreement.airlineId,
      agreementId: agreement.id,
    })
    return ''
  })
}

export function expireAgreement(actorId: string, agreementId: string, reason: string): ServiceResult {
  const actor = requireActor(actorId)
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  if (actor.role === 'airline' && actor.airlineId !== agreement.airlineId) {
    return { ok: false, message: '跨航司改动一律拒绝：这不是你所属航司的协议' }
  }
  const allowed = actor.role === 'manager' || canMaintain(actor, agreement)
  if (!allowed) {
    return { ok: false, message: '只有归属对接人或管理员可以终止协议' }
  }
  return advance(agreement, actor, '已失效', () => {
    if (!reason.trim()) {
      return '终止/失效必须填写原因'
    }
    addTodo({
      kind: '协议失效',
      title: `协议失效：${agreement.code}`,
      detail: `失效原因：${reason.trim()}。失效后不可改回生效中，历史服务项按原快照保留。`,
      airlineId: agreement.airlineId,
      agreementId: agreement.id,
    })
    return ''
  })
}

function advance(
  agreement: Agreement,
  actor: Actor,
  target: AgreementStatus,
  validate: () => string,
): ServiceResult {
  const expected = NEXT_STATUS[agreement.status]
  if (agreement.status === target) {
    return { ok: false, message: `协议已经是「${target}」` }
  }
  if (expected !== target) {
    if (expected === null) {
      return { ok: false, message: '已失效是终态，协议不能改回生效中或任何前序状态' }
    }
    return { ok: false, message: `状态不能跳步：当前「${agreement.status}」只能先推进到「${expected}」` }
  }
  const error = validate()
  if (error) {
    return { ok: false, message: error }
  }
  const from = agreement.status
  agreement.status = target
  agreement.updatedAt = nowText()
  addLog(agreement.id, actor, '状态推进', `${from} → ${target}`)
  save()
  return { ok: true, message: `协议 ${agreement.code} 已由「${from}」推进到「${target}」` }
}

// ---------- 重叠检测与裁决 ----------

export function windowsOverlap(a: Pick<Agreement, 'effectiveDate' | 'expiryDate'>, b: typeof a): boolean {
  return a.effectiveDate < b.expiryDate && b.effectiveDate < a.expiryDate
}

export function overlapWindow(
  a: Pick<Agreement, 'effectiveDate' | 'expiryDate'>,
  b: typeof a,
): { start: string; end: string } {
  return {
    start: a.effectiveDate > b.effectiveDate ? a.effectiveDate : b.effectiveDate,
    end: a.expiryDate < b.expiryDate ? a.expiryDate : b.expiryDate,
  }
}

function arbitrationBetween(aId: string, bId: string): Arbitration | undefined {
  return state().arbitrations.find(
    (row) =>
      (row.winnerAgreementId === aId && row.loserAgreementId === bId)
      || (row.winnerAgreementId === bId && row.loserAgreementId === aId),
  )
}

export type ConflictPair = {
  airlineId: string
  airlineName: string
  a: Agreement
  b: Agreement
  start: string
  end: string
  arbitration?: Arbitration
}

/** 同一航司时段重叠的协议对；草稿/已失效不参与冲突，草稿可继续改、已失效是终态。 */
export function listConflicts(includeResolved = false): ConflictPair[] {
  const candidates = state().agreements.filter(
    (item) => item.status === '待生效' || item.status === '生效中',
  )
  const pairs: ConflictPair[] = []
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i]
      const b = candidates[j]
      if (a.airlineId !== b.airlineId || !windowsOverlap(a, b)) {
        continue
      }
      const verdict = arbitrationBetween(a.id, b.id)
      if (verdict && !includeResolved) {
        continue
      }
      const window = overlapWindow(a, b)
      pairs.push({
        airlineId: a.airlineId,
        airlineName: getAirline(a.airlineId)?.name ?? a.airlineId,
        a,
        b,
        start: window.start,
        end: window.end,
        arbitration: verdict,
      })
    }
  }
  return pairs
}

export function arbitrate(
  actorId: string,
  aId: string,
  bId: string,
  winnerId: string,
  note: string,
): ServiceResult {
  const actor = requireActor(actorId)
  if (!canArbitrate(actor)) {
    return { ok: false, message: '重叠协议的执行口径只能由管理员裁决' }
  }
  const a = findAgreement(aId)
  const b = findAgreement(bId)
  if (!a || !b) {
    return { ok: false, message: '协议不存在' }
  }
  if (a.airlineId !== b.airlineId) {
    return { ok: false, message: '只有同一家航司的协议才需要裁决重叠' }
  }
  if (![a.status, b.status].every((status) => status === '待生效' || status === '生效中')) {
    return { ok: false, message: '只有待生效/生效中的协议需要裁决，草稿可直接改，已失效是终态' }
  }
  if (!windowsOverlap(a, b)) {
    return { ok: false, message: '两份协议的有效期不重叠，无需裁决' }
  }
  if (winnerId !== aId && winnerId !== bId) {
    return { ok: false, message: '必须指定其中一份协议为执行协议' }
  }
  if (!note.trim()) {
    return { ok: false, message: '裁决必须写明执行口径说明' }
  }
  if (arbitrationBetween(aId, bId)) {
    return { ok: false, message: '该协议对已经裁决过' }
  }
  const winner = winnerId === aId ? a : b
  const loser = winnerId === aId ? b : a
  const window = overlapWindow(a, b)
  const record: Arbitration = {
    id: nextId('AR'),
    airlineId: a.airlineId,
    winnerAgreementId: winner.id,
    loserAgreementId: loser.id,
    overlapStart: window.start,
    overlapEnd: window.end,
    note: note.trim(),
    at: nowText(),
    arbitratorId: actor.id,
    arbitratorName: actor.name,
  }
  state().arbitrations.unshift(record)
  addLog(a.id, actor, '重叠裁决', `与 ${b.code} 重叠（${window.start} ~ ${window.end}），执行方：${winner.code}。${note.trim()}`)
  addLog(b.id, actor, '重叠裁决', `与 ${a.code} 重叠（${window.start} ~ ${window.end}），执行方：${winner.code}。${note.trim()}`)
  addTodo({
    kind: '重叠裁决',
    title: `重叠已裁决：${winner.code} 优先执行`,
    detail: `${getAirline(a.airlineId)?.shortName} ${a.code} 与 ${b.code} 重叠时段（${window.start} ~ ${window.end}）按 ${winner.code} 执行。说明：${note.trim()}`,
    airlineId: a.airlineId,
    agreementId: winner.id,
  })
  save()
  return { ok: true, message: `裁决完成：重叠时段按 ${winner.code} 执行，已写入资源调度待办` }
}

// ---------- 归属变更 ----------

export function transferOwnership(
  actorId: string,
  agreementId: string,
  toOwnerId: string,
  reason: string,
): ServiceResult {
  const actor = requireActor(actorId)
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  if (actor.role === 'airline' && actor.airlineId !== agreement.airlineId) {
    return { ok: false, message: '跨航司改动一律拒绝：这不是你所属航司的协议' }
  }
  if (!canTransfer(actor, agreement)) {
    return { ok: false, message: '只有当前归属对接人或管理员可以发起归属变更' }
  }
  const target = getActor(toOwnerId)
  if (!target || target.role !== 'airline') {
    return { ok: false, message: '归属只能转给航司对接人' }
  }
  if (target.airlineId !== agreement.airlineId) {
    return { ok: false, message: '归属变更不得跨航司：目标对接人不属于签约航司' }
  }
  if (target.id === agreement.ownerId) {
    return { ok: false, message: '协议本来就归属该对接人' }
  }
  if (!reason.trim()) {
    return { ok: false, message: '归属变更必须留下原因说明' }
  }
  const fromOwner = getActor(agreement.ownerId)!
  const record = {
    id: nextId('OC'),
    agreementId: agreement.id,
    agreementCode: agreement.code,
    airlineId: agreement.airlineId,
    fromOwnerId: fromOwner.id,
    fromOwnerName: fromOwner.name,
    toOwnerId: target.id,
    toOwnerName: target.name,
    reason: reason.trim(),
    at: nowText(),
    operatorId: actor.id,
    operatorName: actor.name,
  }
  state().ownershipChanges.unshift(record)
  agreement.ownerId = target.id
  agreement.updatedAt = nowText()
  addLog(
    agreement.id,
    actor,
    '归属变更',
    `${fromOwner.name} → ${target.name}（原因：${reason.trim()}）`,
  )
  addTodo({
    kind: '归属变更',
    title: `协议归属变更：${agreement.code}`,
    detail: `归属对接人由 ${fromOwner.name} 变更为 ${target.name}。原因：${reason.trim()}`,
    airlineId: agreement.airlineId,
    agreementId: agreement.id,
  })
  save()
  return { ok: true, message: `协议归属已由 ${fromOwner.name} 变更为 ${target.name}` }
}

// ---------- 快照 ----------

function freezeLines(agreement: Agreement): FrozenLine[] {
  return agreement.lines
    .filter((row) => row.confirmed)
    .map((row) => {
      const item = getServiceItem(row.serviceItemId)!
      const pkg = getPackage(item.packageId)
      const team = getTeam(item.teamId)
      return {
        lineId: row.id,
        serviceItemId: row.serviceItemId,
        packageId: item.packageId,
        packageName: pkg?.name ?? item.packageId,
        name: item.name,
        teamId: item.teamId,
        teamName: team?.name ?? item.teamId,
        unit: row.unit,
        price: row.price,
        kind: row.kind,
        effectiveDate: row.effectiveDate,
      }
    })
}

function freezeSnapshot(agreement: Agreement, actor: Actor, reason: string): AgreementSnapshot {
  const versions = state().snapshots.filter((row) => row.agreementId === agreement.id)
  const snapshot: AgreementSnapshot = {
    id: nextId('S'),
    agreementId: agreement.id,
    version: versions.length + 1,
    reason,
    frozenAt: nowText(),
    frozenBy: actor.name,
    windowStart: agreement.effectiveDate,
    windowEnd: agreement.expiryDate,
    lines: freezeLines(agreement),
  }
  state().snapshots.unshift(snapshot)
  return snapshot
}

// ---------- 调度可用服务项（唯一口径） ----------

export type CanonicalItem = {
  airlineId: string
  airlineName: string
  agreementId: string
  agreementCode: string
  serviceItemId: string
  name: string
  packageName: string
  teamId: string
  teamName: string
  unit: string
  price: number
  kind: AgreementLine['kind']
  effectiveDate: string
  /** 被另一份裁决优先协议覆盖时，指向执行协议编号。 */
  suppressedBy?: string
  arbitrationNote?: string
}

export type CanonicalQuery = {
  onDate?: string
  airlineId?: string
  teamId?: string
}

/**
 * 调度读到的可用服务项只有这一个口径：
 * 取「生效中」协议在查询日最新冻结版本中已到生效日的服务项；
 * 重叠时段按管理员裁决结果执行，败方与胜方重复的服务项被压制并标明依据。
 */
export function canonicalItems(actorId: string, query: CanonicalQuery = {}): CanonicalItem[] {
  const actor = requireActor(actorId)
  const onDate = query.onDate ?? BUSINESS_TODAY
  let airlineId = query.airlineId
  let teamId = query.teamId
  // 班组只能查自己对应的服务项，跨班组数据不给。
  if (actor.role === 'team') {
    teamId = actor.teamId
    airlineId = undefined
  }
  if (actor.role === 'airline') {
    airlineId = actor.airlineId
  }

  const active = state().agreements.filter(
    (agreement) =>
      agreement.status === '生效中'
      && agreement.effectiveDate <= onDate
      && onDate < agreement.expiryDate
      && (!airlineId || agreement.airlineId === airlineId),
  )

  const rows: CanonicalItem[] = []
  for (const agreement of active) {
    const snapshot = state().snapshots
      .filter((row) => row.agreementId === agreement.id)
      .sort((a, b) => b.version - a.version)[0]
    if (!snapshot) {
      continue
    }
    for (const frozen of snapshot.lines) {
      if (frozen.effectiveDate > onDate) {
        continue
      }
      if (teamId && frozen.teamId !== teamId) {
        continue
      }
      rows.push({
        airlineId: agreement.airlineId,
        airlineName: getAirline(agreement.airlineId)?.name ?? agreement.airlineId,
        agreementId: agreement.id,
        agreementCode: agreement.code,
        serviceItemId: frozen.serviceItemId,
        name: frozen.name,
        packageName: frozen.packageName,
        teamId: frozen.teamId,
        teamName: frozen.teamName,
        unit: frozen.unit,
        price: frozen.price,
        kind: frozen.kind,
        effectiveDate: frozen.effectiveDate,
      })
    }
  }

  // 裁决压制：同一航司、同一服务项若胜方协议在当日也提供，则败方版本不执行。
  for (const row of rows) {
    const verdict = state().arbitrations.find(
      (item) =>
        item.airlineId === row.airlineId
        && item.loserAgreementId === row.agreementId
        && item.overlapStart <= onDate
        && onDate < item.overlapEnd,
    )
    if (!verdict) {
      continue
    }
    const winnerServes = rows.some(
      (other) =>
        other.agreementId === verdict.winnerAgreementId
        && other.serviceItemId === row.serviceItemId,
    )
    if (winnerServes) {
      const winner = findAgreement(verdict.winnerAgreementId)
      row.suppressedBy = winner?.code
      row.arbitrationNote = verdict.note
    }
  }
  return rows
}

// ---------- 计费引用 ----------

export function createBillingRef(
  actorId: string,
  agreementId: string,
  lineId: string,
): ServiceResult<BillingRef> {
  const actor = requireActor(actorId)
  if (actor.role !== 'scheduler' && actor.role !== 'manager') {
    return { ok: false, message: '计费引用由资源调度/管理员登记' }
  }
  const agreement = findAgreement(agreementId)
  if (!agreement) {
    return { ok: false, message: '协议不存在' }
  }
  // 没生效的不许被计费引用；已失效的新计费也不能引用。
  if (agreement.status !== '生效中') {
    return { ok: false, message: `只有「生效中」协议允许计费引用，当前状态「${agreement.status}」` }
  }
  const line = agreement.lines.find((row) => row.id === lineId)
  if (!line) {
    return { ok: false, message: '服务项不存在于该协议' }
  }
  if (!line.confirmed) {
    return { ok: false, message: '该服务项（临时加项）未经对接人确认，不能计费' }
  }
  const canonical = canonicalItems(actorId, { airlineId: agreement.airlineId, onDate: BUSINESS_TODAY })
    .find((row) => row.agreementId === agreement.id
      && row.serviceItemId === line.serviceItemId
      && !row.suppressedBy)
  if (!canonical) {
    return { ok: false, message: '该服务项目前不在调度可用口径内（未到生效日或重叠时段已被裁决优先的协议覆盖），不能计费' }
  }
  const item = getServiceItem(line.serviceItemId)!
  const pkg = getPackage(item.packageId)
  const ref: BillingRef = {
    id: nextId('BR'),
    agreementId: agreement.id,
    agreementCode: agreement.code,
    airlineId: agreement.airlineId,
    lineId: line.id,
    serviceItemName: item.name,
    packageName: pkg?.name ?? item.packageId,
    unit: line.unit,
    // 引用的是冻结口径下的协议价，后续目录调价不影响本次计费。
    price: line.price,
    billingDate: BUSINESS_TODAY,
    at: nowText(),
    operatorId: actor.id,
    operatorName: actor.name,
  }
  state().billingRefs.unshift(ref)
  addLog(agreement.id, actor, '计费引用', `引用「${item.name}」，单价 ${line.price} 元/${line.unit}，计费日 ${BUSINESS_TODAY}`)
  save()
  return { ok: true, message: `已按 ${agreement.code} 的冻结口径登记「${item.name}」计费引用`, data: ref }
}

export { BUSINESS_TODAY }

export function resetAll(): void {
  resetDomain()
}
