import type { PlanEditorItem } from '../../utils/request'

const STATUS_OPTIONS = [
  { value: 'pending', label: '未开始' },
  { value: 'in_progress', label: '进行中' },
  { value: 'done', label: '已完成' },
] as const

Component({
  properties: {
    title: { type: String, value: '' },
    items: { type: Array, value: [] as PlanEditorItem[] },
    readOnly: { type: Boolean, value: false },
    saving: { type: Boolean, value: false },
    schedulePrefillCount: { type: Number, value: 0 },
    focusTaskIndex: { type: Number, value: -1 },
  },
  data: { statusOptions: STATUS_OPTIONS },
  methods: {
    onTitleInput(event: WechatMiniprogram.Input) { this.triggerEvent('titleinput', { value: event.detail.value }) },
    onAddItem() { this.triggerEvent('additem') },
    onItemInput(event: WechatMiniprogram.Input) {
      this.triggerEvent('iteminput', { index: Number(event.currentTarget.dataset.index), field: String(event.currentTarget.dataset.field), value: event.detail.value })
    },
    onStatusChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      this.triggerEvent('statuschange', { index: Number(event.currentTarget.dataset.index), value: event.detail.value })
    },
    onDueDateChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      this.triggerEvent('duedatechange', { index: Number(event.currentTarget.dataset.index), value: event.detail.value })
    },
    onClearDueDate(event: WechatMiniprogram.BaseEvent) { this.triggerEvent('clearduedate', { index: Number(event.currentTarget.dataset.index) }) },
    onRemoveItem(event: WechatMiniprogram.BaseEvent) { this.triggerEvent('removeitem', { index: Number(event.currentTarget.dataset.index) }) },
  },
})
