import { db } from './db'
import { uid } from './util'
import type { PresetRow } from '../types'

export async function savePreset(kind: PresetRow['kind'], name: string, data: unknown, id?: string): Promise<PresetRow> {
  const row: PresetRow = { id: id ?? uid(), kind, name: name.trim().slice(0, 60) || 'Untitled preset', data, updatedAt: Date.now() }
  await db.presets.put(row)
  return row
}
export const renamePreset = (id: string, name: string) => db.presets.update(id, { name: name.trim().slice(0, 60) || 'Untitled preset', updatedAt: Date.now() })
export const deletePreset = (id: string) => db.presets.delete(id)
export const listPresets = (kind: PresetRow['kind']) => db.presets.where('kind').equals(kind).sortBy('name')
