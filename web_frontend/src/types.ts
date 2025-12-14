export interface Message {
  id: number
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  timestamp: Date
  tool_calls?: Array<{
    name: string
    parameters: Record<string, any>
    result?: string
  }>
}

export interface SessionConfig {
  model: string
  temperature: number
  timeout: number
  workspace_path?: string  // 可选的工作目录路径
}

export interface PermissionConfig {
  yolo_mode: boolean
  command_allowlist: string[]
  command_denylist: string[]
  delete_file_protection: boolean
}

export interface PermissionRequest {
  request_id: string
  operation: string
  details: Record<string, any>
}
