import { localOrderFileName } from './localOrderFileName'
import type { CopyPlanGroup, PhotoGroup } from './types'

/**
 * Keeps the source grouping while producing a consecutive export order for
 * just the files the user selected when ordered filenames are enabled. This
 * makes a partial export read as its own complete sequence instead of
 * retaining gaps from the larger session.
 */
export function selectedExportPlan(
  groups: PhotoGroup[],
  selectedPaths: ReadonlySet<string>,
  prefixFileNames: boolean
): CopyPlanGroup[] {
  return groups.flatMap((group) => {
    const files = group.files.filter((file) => selectedPaths.has(file.path))
    if (files.length === 0) return []

    return [
      {
        id: group.id,
        name: group.name,
        files: files.map((file, index) => ({
          sourcePath: file.path,
          fileName: prefixFileNames
            ? localOrderFileName(file.fileName, index, files.length)
            : file.fileName
        }))
      }
    ]
  })
}
