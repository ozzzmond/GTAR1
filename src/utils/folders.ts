import type { SetlistFolder } from '../types/gtar'

/**
 * Validates whether setting a folder's parent to targetParentId would introduce a cycle.
 * Cycle rule:
 * - A folder cannot have itself as parent (folderId === targetParentId)
 * - targetParentId cannot be a descendant of folderId.
 * Returns true if valid (no cycle), false if cycle would occur.
 */
export function validateFolderParentChange(
  folders: SetlistFolder[],
  folderId: string,
  targetParentId: string | null
): boolean {
  if (targetParentId === null || targetParentId === undefined || targetParentId === '') {
    return true
  }

  // Cannot be own parent
  if (folderId === targetParentId) {
    return false
  }

  // Check if targetParentId is a descendant of folderId
  const folderMap = new Map<string, SetlistFolder>()
  for (const f of folders) {
    folderMap.set(f.id, f)
  }

  let currId: string | null = targetParentId
  const visited = new Set<string>()

  while (currId) {
    if (currId === folderId) {
      // Cycle detected: target parent is a descendant of the folder
      return false
    }
    if (visited.has(currId)) {
      // Existing cycle in tree
      return false
    }
    visited.add(currId)
    const parent = folderMap.get(currId)
    currId = parent?.parentId || null
  }

  return true
}

export interface FolderTreeNode {
  folder: SetlistFolder
  children: FolderTreeNode[]
}

/**
 * Builds a clean hierarchy tree of folders.
 */
export function buildFolderTree(folders: SetlistFolder[]): FolderTreeNode[] {
  const nodeMap = new Map<string, FolderTreeNode>()
  for (const f of folders) {
    nodeMap.set(f.id, { folder: f, children: [] })
  }

  const rootNodes: FolderTreeNode[] = []

  for (const f of folders) {
    const node = nodeMap.get(f.id)!
    if (f.parentId && nodeMap.has(f.parentId)) {
      const parentNode = nodeMap.get(f.parentId)!
      parentNode.children.push(node)
    } else {
      rootNodes.push(node)
    }
  }

  return rootNodes
}

/**
 * Collects all descendant IDs of a folder (including children, grandchildren, etc.).
 */
export function getFolderDescendantIds(folders: SetlistFolder[], folderId: string): Set<string> {
  const childrenMap = new Map<string, string[]>()
  for (const f of folders) {
    if (f.parentId) {
      const list = childrenMap.get(f.parentId) || []
      list.push(f.id)
      childrenMap.set(f.parentId, list)
    }
  }

  const descendants = new Set<string>()
  const queue = [...(childrenMap.get(folderId) || [])]

  while (queue.length > 0) {
    const id = queue.shift()!
    descendants.add(id)
    const childList = childrenMap.get(id)
    if (childList) {
      queue.push(...childList)
    }
  }

  return descendants
}
