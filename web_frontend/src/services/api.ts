import axios from 'axios'
import type { SessionConfig, PermissionConfig, PermissionRequest } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 120秒超时，允许等待权限确认（权限请求最多等待60秒）
})

export const createSession = async (
  config: SessionConfig,
  permissionConfig: PermissionConfig
): Promise<string> => {
  const requestBody: any = {
    model: config.model,
    temperature: config.temperature,
    timeout: config.timeout,
    permission_config: permissionConfig
  }
  
  // 如果指定了工作目录，添加到请求中
  if (config.workspace_path) {
    requestBody.workspace_path = config.workspace_path
  }
  
  const response = await api.post('/api/sessions', requestBody)
  return response.data.session_id
}

export const sendMessage = async (
  sessionId: string,
  message: string,
  userInfo?: Record<string, any>,
  files?: File[]
) => {
    // 如果有文件，使用 FormData
    if (files && files.length > 0) {
      const formData = new FormData()
      formData.append('session_id', sessionId)
      formData.append('message', message)
      if (userInfo) {
        formData.append('user_info', JSON.stringify(userInfo))
      }
      files.forEach((file) => {
        formData.append('files', file)
      })
      
      // 发送 FormData 时，删除默认的 Content-Type，让浏览器自动设置（包括 boundary）
      // axios 会自动检测 FormData 并设置正确的 Content-Type，但需要删除默认的 application/json
      // 创建一个临时的 axios 实例，不设置默认的 Content-Type
      const formDataApi = axios.create({
        baseURL: API_BASE_URL,
        timeout: 120000,
        // 不设置默认的 Content-Type，让 axios 自动检测 FormData
      })
      
      const response = await formDataApi.post('/api/chat', formData)
      return response.data
  } else {
    // 没有文件，使用 JSON
    const response = await api.post('/api/chat', {
      session_id: sessionId,
      message,
      user_info: userInfo
    })
    return response.data
  }
}

export const uploadFile = async (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await api.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export const queryImage = async (
  sessionId: string,
  query: string,
  imagePaths: string[]
) => {
  const response = await api.post('/api/image-query', {
    session_id: sessionId,
    query,
    image_paths: imagePaths
  })
  return response.data
}

export const getModels = async () => {
  const response = await api.get('/api/models')
  return response.data
}

export const getSession = async (sessionId: string) => {
  const response = await api.get(`/api/sessions/${sessionId}`)
  return response.data
}

export const deleteSession = async (sessionId: string) => {
  const response = await api.delete(`/api/sessions/${sessionId}`)
  return response.data
}

export const getPendingPermissions = async (sessionId: string): Promise<PermissionRequest[]> => {
  const response = await api.get(`/api/sessions/${sessionId}/permissions`)
  return response.data.pending_permissions || []
}

export const respondToPermission = async (
  sessionId: string,
  requestId: string,
  granted: boolean
) => {
  const formData = new FormData()
  formData.append('status', granted ? 'granted' : 'denied')
  
  const response = await api.post(
    `/api/sessions/${sessionId}/permissions/${requestId}`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
  return response.data
}

// SSE流式消息发送
export const sendMessageStream = (
  sessionId: string,
  message: string,
  userInfo?: Record<string, any>,
  onMessage?: (data: any) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void
): EventSource => {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const params = new URLSearchParams({
    session_id: sessionId,
    message: message,
  })
  if (userInfo) {
    params.append('user_info', JSON.stringify(userInfo))
  }
  
  const eventSource = new EventSource(`${API_BASE_URL}/api/chat/stream?${params.toString()}`)
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      console.log('收到 SSE 消息:', data)
      if (data.type === 'permission_request') {
        console.log('收到权限请求 SSE 消息，类型:', data.type)
        console.log('权限请求完整数据:', JSON.stringify(data, null, 2))
      }
      if (onMessage) {
        onMessage(data)
      }
      
      // 如果是完成消息，关闭连接
      if (data.type === 'chat_complete' || data.type === 'error') {
        eventSource.close()
        if (onComplete) {
          onComplete()
        }
      }
    } catch (err) {
      console.error('Failed to parse SSE message:', err)
      if (onError) {
        onError(err as Error)
      }
    }
  }
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error)
    eventSource.close()
    if (onError) {
      onError(new Error('SSE connection error'))
    }
    if (onComplete) {
      onComplete()
    }
  }
  
  return eventSource
}
