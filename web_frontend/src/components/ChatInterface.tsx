import React from 'react'
import { User, Bot, AlertCircle, Wrench } from 'lucide-react'
import type { Message } from '../types'

interface ChatInterfaceProps {
  messages: Message[]
  isLoading: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  isLoading,
  messagesEndRef
}) => {
  const getMessageIcon = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return <User className="w-5 h-5" />
      case 'assistant':
        return <Bot className="w-5 h-5" />
      case 'error':
        return <AlertCircle className="w-5 h-5" />
      default:
        return null
    }
  }

  const getMessageBgColor = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return 'bg-blue-50 border-blue-200'
      case 'assistant':
        return 'bg-white border-gray-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'system':
        return 'bg-gray-50 border-gray-200'
      default:
        return 'bg-white border-gray-200'
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>开始对话吧！输入消息与 AI 助手交流。</p>
          </div>
        </div>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={`flex space-x-3 ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              message.role === 'user' ? 'bg-blue-600 text-white' :
              message.role === 'error' ? 'bg-red-600 text-white' :
              'bg-gray-600 text-white'
            }`}>
              {getMessageIcon(message.role)}
            </div>
            <div className={`flex-1 border rounded-lg p-4 ${getMessageBgColor(message.role)}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">
                  {message.role === 'user' ? '您' :
                   message.role === 'assistant' ? 'AI 助手' :
                   message.role === 'error' ? '错误' : '系统'}
                </span>
                <span className="text-xs text-gray-500">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="text-gray-800 whitespace-pre-wrap">
                {message.content}
              </div>
              {message.tool_calls && message.tool_calls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Wrench className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-600">
                      工具调用 ({message.tool_calls.length})
                    </span>
                  </div>
                  {message.tool_calls.map((tool, index) => (
                    <div key={index} className="text-xs bg-gray-100 rounded p-2 mb-2">
                      <div className="font-mono font-semibold text-blue-600">
                        {tool.name}
                      </div>
                      {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                        <div className="text-gray-600 mt-1">
                          参数: {JSON.stringify(tool.parameters, null, 2)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}
      {isLoading && (
        <div className="flex space-x-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-600 text-white flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex-1 border rounded-lg p-4 bg-white border-gray-200">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">AI 正在思考...</span>
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}

export default ChatInterface
