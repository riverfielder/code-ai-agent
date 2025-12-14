import React, { useState, useRef, useEffect } from 'react'
import { Send, Upload, Settings, FileText, X, CheckCircle, AlertCircle, Paperclip } from 'lucide-react'
import ChatInterface from './components/ChatInterface'
import SettingsPanel from './components/SettingsPanel'
import { createSession, sendMessage, sendMessageStream, getModels, getPendingPermissions, respondToPermission } from './services/api'
import type { Message, SessionConfig, PermissionConfig, PermissionRequest } from './types'

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sessionConfig, setSessionConfig] = useState<SessionConfig>({
    model: 'claude-3-5-sonnet-latest',
    temperature: 0.0,
    timeout: 180,
    workspace_path: undefined
  })
  const [permissionConfig, setPermissionConfig] = useState<PermissionConfig>({
    yolo_mode: false,
    command_allowlist: [],
    command_denylist: [],
    delete_file_protection: true
  })
  const [availableModels, setAvailableModels] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 加载支持的模型列表
  useEffect(() => {
    loadModels()
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadModels = async () => {
    try {
      const response = await getModels()
      console.log('模型列表响应:', response)
      // 确保 models 字段存在
      if (response && response.models) {
        setAvailableModels(response.models)
        // 如果当前选择的模型不在列表中，设置第一个可用模型
        if (Object.keys(response.models).length > 0) {
          const firstProvider = Object.keys(response.models)[0]
          const firstModel = response.models[firstProvider][0]
          if (!Object.values(response.models).flat().includes(sessionConfig.model)) {
            setSessionConfig({ ...sessionConfig, model: firstModel })
          }
        }
      } else {
        console.warn('模型列表格式不正确:', response)
        setAvailableModels({})
      }
    } catch (err) {
      console.error('加载模型列表失败:', err)
      setError('无法加载模型列表，请检查后端服务是否正常运行')
      setAvailableModels({})
    }
  }

  const initializeSession = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const newSessionId = await createSession(sessionConfig, permissionConfig)
      setSessionId(newSessionId)
      const workspaceInfo = sessionConfig.workspace_path 
        ? `\n工作目录: ${sessionConfig.workspace_path}`
        : '\n工作目录: 自动生成'
      setMessages([{
        id: Date.now(),
        role: 'system',
        content: `会话已创建，使用模型: ${sessionConfig.model}${workspaceInfo}`,
        timestamp: new Date()
      }])
    } catch (err: any) {
      setError(err.message || '创建会话失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = async () => {
    // 如果没有输入且没有附件，不发送
    if ((!input.trim() && attachedFiles.length === 0) || !sessionId) {
      if (!sessionId) {
        await initializeSession()
        return
      }
      return
    }

    // 构建用户消息内容
    let messageContent = input.trim()
    if (attachedFiles.length > 0) {
      const fileNames = attachedFiles.map(f => f.name).join(', ')
      if (messageContent) {
        messageContent += `\n\n附件: ${fileNames}`
      } else {
        messageContent = `请分析以下文件: ${fileNames}`
      }
    }

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: messageContent,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const currentFiles = [...attachedFiles]
    setInput('')
    setAttachedFiles([])
    setIsLoading(true)
    setError(null)

    // 如果有文件，使用传统API（SSE端点暂不支持文件上传）
    if (currentFiles.length > 0) {
      try {
        const response = await sendMessage(sessionId, messageContent, undefined, currentFiles)
        
        if (response.pending_permissions && response.pending_permissions.length > 0) {
          setPendingPermissions(response.pending_permissions)
          const assistantMessage: Message = {
            id: Date.now() + 1,
            role: 'assistant',
            content: response.message || '等待权限确认中，请查看上方的权限请求并点击允许/拒绝...',
            tool_calls: response.tool_calls || [],
            timestamp: new Date()
          }
          setMessages(prev => [...prev, assistantMessage])
          return
        }
        
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: response.message,
          tool_calls: response.tool_calls || [],
          timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])
        checkPendingPermissions()
      } catch (err: any) {
        setError(err.message || '发送消息失败')
        const errorMessage: Message = {
          id: Date.now() + 1,
          role: 'error',
          content: `错误: ${err.message || '发送消息失败'}`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, errorMessage])
      } finally {
        setIsLoading(false)
      }
      return
    }

    // 使用SSE流式推送（无文件时）
    let assistantMessageId = Date.now() + 1
    let assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    }
    setMessages(prev => [...prev, assistantMessage])

    const eventSource = sendMessageStream(
      sessionId,
      messageContent,
      undefined,
      (data) => {
        if (data.type === 'message_start') {
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: data.data.message }
              : msg
          ))
        } else if (data.type === 'message') {
          // 更新消息内容（可能是增量更新或完整更新）
          setMessages(prev => prev.map(msg => {
            if (msg.id === assistantMessageId) {
              const newContent = data.data.message || ''
              // 如果是增量更新，追加内容；如果是完整更新，替换内容
              // 这里假设是完整更新（因为后端发送的是完整消息）
              return { 
                ...msg, 
                content: newContent,
                tool_calls: data.data.tool_calls || msg.tool_calls || []
              }
            }
            return msg
          }))
        } else if (data.type === 'permission_request') {
          console.log('收到权限请求 SSE 消息:', data)
          console.log('权限请求数据:', data.data)
          setPendingPermissions(prev => {
            // 检查是否已存在
            const exists = prev.some(p => p.request_id === data.data.request_id)
            console.log('当前权限请求列表:', prev)
            console.log('权限请求是否已存在:', exists)
            if (!exists) {
              const newPerms = [...prev, data.data]
              console.log('添加权限请求后的列表:', newPerms)
              return newPerms
            }
            console.log('权限请求已存在，不重复添加')
            return prev
          })
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: msg.content + '\n\n🔒 检测到权限请求，请查看上方并点击允许/拒绝...' }
              : msg
          ))
        } else if (data.type === 'permission_response') {
          // 权限已响应，可以更新UI
          setPendingPermissions(prev => prev.filter(p => p.request_id !== data.data.request_id))
        } else if (data.type === 'permission_resolved') {
          // 权限已解决
          setPendingPermissions(prev => prev.filter(p => p.request_id !== data.data.request_id))
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: msg.content + `\n\n✅ 权限已${data.data.status === 'granted' ? '允许' : '拒绝'}，继续执行...` }
              : msg
          ))
        } else if (data.type === 'permission_timeout') {
          // 权限请求超时
          setPendingPermissions(prev => prev.filter(p => p.request_id !== data.data.request_id))
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: msg.content + `\n\n⏰ 权限请求已超时（30秒），操作已被拒绝` }
              : msg
          ))
          setError('权限请求已超时，操作已被自动拒绝')
        } else if (data.type === 'error') {
          setError(data.data.message)
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId 
              ? { ...msg, content: `错误: ${data.data.message}` }
              : msg
          ))
        }
      },
      (error) => {
        setError(error.message)
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: `错误: ${error.message}` }
            : msg
        ))
        setIsLoading(false)
      },
      () => {
        setIsLoading(false)
      }
    )
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files])
    }
    // 重置 input，允许选择相同文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const checkPendingPermissions = async () => {
    if (!sessionId) return
    
    try {
      const perms = await getPendingPermissions(sessionId)
      if (perms.length > 0) {
        setPendingPermissions(perms)
      }
    } catch (err) {
      console.error('检查权限请求失败:', err)
    }
  }

  const handlePermissionResponse = async (requestId: string, granted: boolean) => {
    if (!sessionId) return
    
    try {
      await respondToPermission(sessionId, requestId, granted)
      
      // 移除已处理的权限请求
      const remaining = pendingPermissions.filter(p => p.request_id !== requestId)
      setPendingPermissions(remaining)
      
      console.log(`Permission ${granted ? 'granted' : 'denied'} for request ${requestId}`)
      
      // 权限响应后，后端 agent.chat 会继续执行
      // 由于 HTTP 请求还在等待（agent.chat 会等待权限），
      // 当权限被响应后，agent.chat 会继续，HTTP 请求最终会返回完整响应
      // 但是，由于 HTTP 请求可能已经返回了部分响应（包含权限请求），
      // 我们需要等待完整响应
      
      // 如果所有权限都已处理，等待后端继续执行并返回完整响应
      if (remaining.length === 0) {
        // 等待一小段时间，让后端继续处理
        // 然后检查是否有新的权限请求或完整响应
        setTimeout(async () => {
          try {
            // 检查是否还有新的权限请求
            const newPerms = await getPendingPermissions(sessionId)
            if (newPerms.length > 0) {
              setPendingPermissions(newPerms)
            } else {
              // 没有新的权限请求，说明后端可能已经完成
              // 但由于 HTTP 请求可能已经返回，我们需要检查最后的消息
              // 或者，我们可以显示一个提示，告诉用户等待响应
              console.log("All permissions processed, agent should continue...")
            }
          } catch (err) {
            console.error("Error checking pending permissions:", err)
          }
        }, 500)
      }
    } catch (err: any) {
      // 处理不同类型的错误
      if (err.response?.status === 400) {
        const errorDetail = err.response?.data?.detail || err.message
        if (errorDetail.includes('超时') || errorDetail.includes('已处理')) {
          // 权限请求已超时或已处理，从列表中移除
          setPendingPermissions(prev => prev.filter(p => p.request_id !== requestId))
          setError(`权限请求已过期：${errorDetail}`)
        } else {
          setError(`处理权限请求失败：${errorDetail}`)
        }
      } else {
        setError(err.message || '处理权限请求失败')
      }
    }
  }
  
  // 定期检查待处理的权限请求（当有权限请求时）
  useEffect(() => {
    if (!sessionId) return
    
    // 如果有权限请求，定期检查是否有新的权限请求
    if (pendingPermissions.length > 0) {
      const interval = setInterval(() => {
        checkPendingPermissions()
      }, 1000) // 有权限请求时，每1秒检查一次
      
      return () => clearInterval(interval)
    }
  }, [sessionId, pendingPermissions.length])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <FileText className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">Code Agent</h1>
        </div>
        <div className="flex items-center space-x-2">
          {!sessionId && (
            <button
              onClick={initializeSession}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>初始化会话</span>
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            title="设置"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mx-4 mt-4 flex items-center space-x-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 权限请求提示 */}
      {(() => {
        console.log('渲染权限弹窗，当前 pendingPermissions 数量:', pendingPermissions.length)
        console.log('pendingPermissions 内容:', pendingPermissions)
        return null
      })()}
      {pendingPermissions.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mx-4 mt-4 space-y-3">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <span className="text-yellow-700 font-semibold">权限请求 - 请确认以下操作</span>
          </div>
          {pendingPermissions.map((perm) => (
            <div key={perm.request_id} className="bg-white border border-yellow-200 rounded-lg p-3 shadow-sm">
              <div className="mb-2">
                <span className="font-semibold text-gray-800">
                  {perm.operation === 'create_file' && '📄 创建文件'}
                  {perm.operation === 'edit_file' && '✏️ 编辑文件'}
                  {perm.operation === 'delete_file' && '🗑️ 删除文件'}
                  {perm.operation === 'run_terminal_command' && '⚡ 执行终端命令'}
                  {!['create_file', 'edit_file', 'delete_file', 'run_terminal_command'].includes(perm.operation) && `操作: ${perm.operation}`}
                </span>
              </div>
              <div className="text-sm text-gray-600 mb-3">
                {perm.operation === 'create_file' && (
                  <div>
                    <p className="font-medium mb-1">文件路径: <code className="bg-gray-100 px-1 rounded">{perm.details.file_path}</code></p>
                    {perm.details.content_preview && (
                      <div>
                        <p className="font-medium mb-1">内容预览:</p>
                        <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded text-xs border max-h-40 overflow-y-auto">
                          {perm.details.content_preview}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
                {perm.operation === 'edit_file' && (
                  <div>
                    <p className="font-medium mb-1">文件路径: <code className="bg-gray-100 px-1 rounded">{perm.details.target_file}</code></p>
                    {perm.details.instructions && (
                      <p className="mb-1">说明: {perm.details.instructions}</p>
                    )}
                    {perm.details.edit_preview && (
                      <div>
                        <p className="font-medium mb-1">编辑预览:</p>
                        <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded text-xs border max-h-40 overflow-y-auto">
                          {perm.details.edit_preview}
                        </pre>
                      </div>
                    )}
                    {perm.details.replace_preview && (
                      <div>
                        <p className="font-medium mb-1">替换内容预览:</p>
                        <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded text-xs border max-h-40 overflow-y-auto">
                          {perm.details.replace_preview}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
                {perm.operation === 'delete_file' && (
                  <div>
                    <p className="font-medium">文件路径: <code className="bg-gray-100 px-1 rounded">{perm.details.target_file}</code></p>
                    <p className="text-red-600 mt-2">⚠️ 警告：此操作将永久删除文件，无法恢复！</p>
                  </div>
                )}
                {perm.operation === 'run_terminal_command' && (
                  <div>
                    <p className="font-medium mb-1">命令: <code className="bg-gray-100 px-1 rounded">{perm.details.command}</code></p>
                    {perm.details.explanation && (
                      <p className="text-gray-600">说明: {perm.details.explanation}</p>
                    )}
                  </div>
                )}
                {!['create_file', 'edit_file', 'delete_file', 'run_terminal_command'].includes(perm.operation) && (
                  <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded text-xs border">
                    {JSON.stringify(perm.details, null, 2)}
                  </pre>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePermissionResponse(perm.request_id, true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                >
                  ✓ 允许
                </button>
                <button
                  onClick={() => handlePermissionResponse(perm.request_id, false)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium transition-colors"
                >
                  ✗ 拒绝
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 设置面板 */}
        {showSettings && (
          <SettingsPanel
            sessionConfig={sessionConfig}
            permissionConfig={permissionConfig}
            availableModels={availableModels}
            onSessionConfigChange={setSessionConfig}
            onPermissionConfigChange={setPermissionConfig}
            onClose={() => setShowSettings(false)}
            hasActiveSession={!!sessionId}
          />
        )}

        {/* 聊天界面 */}
        <div className="flex-1 flex flex-col">
          <ChatInterface
            messages={messages}
            isLoading={isLoading}
            messagesEndRef={messagesEndRef}
          />
          
          {/* 输入区域 */}
          <div className="border-t border-gray-200 bg-white p-4">
            {/* 附件列表 */}
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 text-sm"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-gray-700 max-w-xs truncate">{file.name}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700"
                      disabled={isLoading}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex space-x-2">
              {/* 文件上传按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!sessionId || isLoading}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                title="添加附件"
              >
                <Paperclip className="w-5 h-5 text-gray-600" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                disabled={!sessionId || isLoading}
              />
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={sessionId ? "输入消息...（可添加附件）" : "请先初始化会话"}
                disabled={!sessionId || isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 resize-none"
                rows={3}
              />
              <button
                onClick={handleSend}
                disabled={!sessionId || isLoading || (!input.trim() && attachedFiles.length === 0)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Send className="w-5 h-5" />
                <span>发送</span>
              </button>
            </div>
            {!sessionId && (
              <p className="text-sm text-gray-500 mt-2">
                提示: 请先点击"初始化会话"按钮创建会话
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
