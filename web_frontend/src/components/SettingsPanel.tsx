import React, { useState, useRef } from 'react'
import { X, Save, FolderOpen } from 'lucide-react'
import type { SessionConfig, PermissionConfig } from '../types'

interface SettingsPanelProps {
  sessionConfig: SessionConfig
  permissionConfig: PermissionConfig
  availableModels: Record<string, string[]>
  onSessionConfigChange: (config: SessionConfig) => void
  onPermissionConfigChange: (config: PermissionConfig) => void
  onClose: () => void
  hasActiveSession?: boolean  // 是否有活跃会话
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  sessionConfig,
  permissionConfig,
  availableModels,
  onSessionConfigChange,
  onPermissionConfigChange,
  onClose,
  hasActiveSession = false
}) => {
  const [localSessionConfig, setLocalSessionConfig] = useState(sessionConfig)
  const [localPermissionConfig, setLocalPermissionConfig] = useState(permissionConfig)
  const [allowlistInput, setAllowlistInput] = useState('')
  const [denylistInput, setDenylistInput] = useState('')
  const folderInputRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    // 检查权限配置是否更改
    const permissionChanged = 
      localPermissionConfig.yolo_mode !== permissionConfig.yolo_mode || 
      JSON.stringify(localPermissionConfig.command_allowlist) !== JSON.stringify(permissionConfig.command_allowlist) ||
      JSON.stringify(localPermissionConfig.command_denylist) !== JSON.stringify(permissionConfig.command_denylist) ||
      localPermissionConfig.delete_file_protection !== permissionConfig.delete_file_protection
    
    // 检查会话配置是否更改
    const sessionChanged = 
      localSessionConfig.model !== sessionConfig.model ||
      localSessionConfig.temperature !== sessionConfig.temperature ||
      localSessionConfig.timeout !== sessionConfig.timeout ||
      localSessionConfig.workspace_path !== sessionConfig.workspace_path
    
    // 如果配置已更改且存在活跃会话，提示用户需要重新创建会话
    if (hasActiveSession && (permissionChanged || sessionChanged)) {
      const configType = permissionChanged && sessionChanged ? '会话和权限配置' : 
                         permissionChanged ? '权限配置' : '会话配置'
      if (!confirm(`${configType}已更改。需要重新创建会话才能应用新的配置。\n\n是否现在关闭设置面板？\n（请手动点击"初始化会话"按钮重新创建会话）`)) {
        return  // 用户取消，不保存配置
      }
    }
    
    onSessionConfigChange(localSessionConfig)
    onPermissionConfigChange(localPermissionConfig)
    onClose()
  }

  const addToAllowlist = () => {
    if (allowlistInput.trim()) {
      setLocalPermissionConfig({
        ...localPermissionConfig,
        command_allowlist: [...localPermissionConfig.command_allowlist, allowlistInput.trim()]
      })
      setAllowlistInput('')
    }
  }

  const removeFromAllowlist = (index: number) => {
    setLocalPermissionConfig({
      ...localPermissionConfig,
      command_allowlist: localPermissionConfig.command_allowlist.filter((_, i) => i !== index)
    })
  }

  const addToDenylist = () => {
    if (denylistInput.trim()) {
      setLocalPermissionConfig({
        ...localPermissionConfig,
        command_denylist: [...localPermissionConfig.command_denylist, denylistInput.trim()]
      })
      setDenylistInput('')
    }
  }

  const removeFromDenylist = (index: number) => {
    setLocalPermissionConfig({
      ...localPermissionConfig,
      command_denylist: localPermissionConfig.command_denylist.filter((_, i) => i !== index)
    })
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      // 由于浏览器安全限制，无法直接获取文件夹的完整路径
      // 提示用户手动输入路径
      alert('由于浏览器安全限制，无法直接获取文件夹路径。\n\n请手动在输入框中输入完整的工作目录路径。\n\n例如：D:\\Projects\\MyProject 或 /home/user/projects')
    }
    // 重置input，允许再次选择
    if (folderInputRef.current) {
      folderInputRef.current.value = ''
    }
  }

  const handleBrowseFolder = () => {
    // 触发文件选择器（虽然只能选择文件，但可以帮助用户确认路径）
    folderInputRef.current?.click()
  }

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">设置</h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 模型配置 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">模型配置</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">模型</label>
              <select
                value={localSessionConfig.model}
                onChange={(e) => setLocalSessionConfig({ ...localSessionConfig, model: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={Object.keys(availableModels).length === 0}
              >
                {Object.keys(availableModels).length === 0 ? (
                  <option value="">加载模型中...</option>
                ) : (
                  <>
                    {Object.entries(availableModels).map(([provider, models]) => (
                      <optgroup key={provider} label={provider.toUpperCase()}>
                        {models.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </>
                )}
              </select>
              {Object.keys(availableModels).length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ 模型列表为空，请检查后端服务是否正常运行（http://localhost:8000/api/models）
                </p>
              )}
              {Object.keys(availableModels).length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  共 {Object.values(availableModels).flat().length} 个可用模型
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                温度: {localSessionConfig.temperature}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={localSessionConfig.temperature}
                onChange={(e) => setLocalSessionConfig({ ...localSessionConfig, temperature: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">超时时间（秒）</label>
              <input
                type="number"
                min="1"
                value={localSessionConfig.timeout}
                onChange={(e) => setLocalSessionConfig({ ...localSessionConfig, timeout: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">工作目录路径（可选）</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={localSessionConfig.workspace_path || ''}
                  onChange={(e) => setLocalSessionConfig({ ...localSessionConfig, workspace_path: e.target.value || undefined })}
                  placeholder="留空则自动创建，例如: D:\Projects\MyProject"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  {...({ webkitdirectory: '', directory: '' } as any)}
                  multiple
                  onChange={handleFolderSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-1"
                  title="选择文件夹（由于浏览器限制，请手动输入完整路径）"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                指定工作目录路径，Agent将在此目录下创建和修改文件。留空则使用自动生成的目录。
                <br />
                <span className="text-amber-600">注意：由于浏览器安全限制，请手动输入完整路径（如：D:\Projects\MyProject）</span>
              </p>
            </div>
          </div>
        </div>

        {/* 权限配置 */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">权限配置</h3>
          <div className="space-y-3">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={localPermissionConfig.yolo_mode}
                onChange={(e) => setLocalPermissionConfig({ ...localPermissionConfig, yolo_mode: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-600">YOLO 模式（自动批准操作）</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={localPermissionConfig.delete_file_protection}
                onChange={(e) => setLocalPermissionConfig({ ...localPermissionConfig, delete_file_protection: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-600">文件删除保护</span>
            </label>

            <div>
              <label className="block text-sm text-gray-600 mb-1">命令白名单</label>
              <div className="flex space-x-2 mb-2">
                <input
                  type="text"
                  value={allowlistInput}
                  onChange={(e) => setAllowlistInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addToAllowlist()}
                  placeholder="输入命令后按回车"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  onClick={addToAllowlist}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  添加
                </button>
              </div>
              <div className="space-y-1">
                {localPermissionConfig.command_allowlist.map((cmd, index) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded text-sm">
                    <span className="font-mono text-gray-700">{cmd}</span>
                    <button
                      onClick={() => removeFromAllowlist(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">命令黑名单</label>
              <div className="flex space-x-2 mb-2">
                <input
                  type="text"
                  value={denylistInput}
                  onChange={(e) => setDenylistInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addToDenylist()}
                  placeholder="输入命令后按回车"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  onClick={addToDenylist}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  添加
                </button>
              </div>
              <div className="space-y-1">
                {localPermissionConfig.command_denylist.map((cmd, index) => (
                  <div key={index} className="flex items-center justify-between bg-red-50 px-2 py-1 rounded text-sm">
                    <span className="font-mono text-gray-700">{cmd}</span>
                    <button
                      onClick={() => removeFromDenylist(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2"
        >
          <Save className="w-4 h-4" />
          <span>保存设置</span>
        </button>
      </div>
    </div>
  )
}

export default SettingsPanel
