import React, { useRef, useState } from 'react'
import { X, Upload, FileText, CheckCircle } from 'lucide-react'

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>
  onClose: () => void
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadSuccess(false)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      setIsUploading(true)
      await onUpload(selectedFile)
      setUploadSuccess(true)
      setTimeout(() => {
        setSelectedFile(null)
        setUploadSuccess(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }, 2000)
    } catch (error) {
      console.error('上传失败:', error)
    } finally {
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
  }

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">上传文件</h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-500 hover:text-gray-700"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-2">点击选择文件或拖拽文件到此处</p>
          <p className="text-sm text-gray-400">支持所有文件类型</p>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {selectedFile && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-800">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
              </div>
              {uploadSuccess && (
                <CheckCircle className="w-6 h-6 text-green-500" />
              )}
            </div>
          </div>
        )}

        {uploadSuccess && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700">文件上传成功！</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleUpload}
          disabled={!selectedFile || isUploading || uploadSuccess}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {isUploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>上传中...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>上传文件</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default FileUpload
