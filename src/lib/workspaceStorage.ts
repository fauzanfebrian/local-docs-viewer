import { get, set } from 'idb-keyval'

const STORAGE_KEY = 'personal-docs:workspace-state:v1'

export type StoredWorkspace = {
  id: string
  /** `FileSystemDirectoryHandle.name` at pick time */
  name: string
  rootHandle: FileSystemDirectoryHandle
}

export type PersistedWorkspaceState = {
  activeWorkspaceId: string | null
  workspaces: StoredWorkspace[]
}

export async function loadWorkspaceState(): Promise<PersistedWorkspaceState | null> {
  const raw = await get<PersistedWorkspaceState>(STORAGE_KEY)
  if (!raw || !Array.isArray(raw.workspaces)) return null
  return raw
}

export async function saveWorkspaceState(state: PersistedWorkspaceState): Promise<void> {
  await set(STORAGE_KEY, state)
}
