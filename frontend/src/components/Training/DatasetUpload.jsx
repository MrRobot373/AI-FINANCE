import React, { useCallback } from 'react';
import { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { getApiBaseUrl } from '../../utils/apiBase';

const DatasetUpload = ({ onUploadComplete, uploadedFile, setUploadedFile }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState("")

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await handleFile(files[0]);
        }
    }, []);

    const handleFileInput = useCallback(async (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            await handleFile(files[0]);
        }
    }, []);

    const handleFile = async (file) => {
        // Validate file type
        const validExtensions = ['.pdf', '.txt'];
        const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

        if (!validExtensions.includes(fileExtension)) {
            setError('Invalid file format. Please upload .pdf or .txt files.');
            return;
        }

        setError(null);
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const token = localStorage.getItem('token');
            const apiUrl = getApiBaseUrl();

            // In a real app we'd use an api service, but using fetch here works too
            const response = await fetch(`${apiUrl}/ai/knowledge/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to upload file');
            }

            const data = await response.json();

            const result = {
                filename: file.name,
                filepath: `/knowledge/${file.name}`,
                validation: {
                    format: fileExtension.substring(1),
                    sample_count: data.skipped ? "Already Exists" : "New Document"
                }
            };

            setUploadedFile({
                name: file.name,
                size: file.size,
                path: result.filepath,
                validation: result.validation
            });

            if (onUploadComplete) {
                onUploadComplete(result);
            }
        } catch (err) {
            setError(err.message || 'Failed to upload file');
        } finally {
            setUploading(false);
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    return (
        <div className="space-y-4">
            {/* Upload Zone */}
            {!uploadedFile && (
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ${isDragging
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-white/20 bg-white/[0.02] hover:border-emerald-500/50 hover:bg-white/[0.05]'
                        }`}
                >
                    <input
                        type="file"
                        accept=".pdf,.txt"
                        onChange={handleFileInput}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        disabled={uploading}
                    />

                    <div className="flex flex-col items-center gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${isDragging ? 'bg-emerald-500/20' : 'bg-white/5'
                            }`}>
                            <Upload className={`w-8 h-8 ${isDragging ? 'text-emerald-400' : 'text-gray-400'}`} />
                        </div>

                        <div>
                            <p className="text-lg font-medium text-white mb-1">
                                {uploading ? 'Processing embeddings... This may take a few minutes' : 'Drop your dataset here'}
                            </p>
                            <p className="text-sm text-gray-400">
                                or click to browse • Supports .pdf and .txt
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Uploaded File Info */}
            {uploadedFile && (
                <div className="bg-white/[0.02] flex items-start gap-4 border border-white/10 rounded-2xl p-6">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-6 h-6 text-emerald-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                            <div>
                                <h4 className="text-white font-medium truncate">{uploadedFile.name}</h4>
                                <p className="text-sm text-gray-400">{formatFileSize(uploadedFile.size)}</p>
                            </div>
                            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        </div>

                        {uploadedFile.validation && (
                            <div className="mt-4 p-3 bg-white/[0.02] rounded-lg border border-white/5">
                                <p className="text-xs text-gray-400 mb-1">Dataset Info</p>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <span className="text-gray-500">Format:</span>{' '}
                                        <span className="text-white">{uploadedFile.validation.format?.toUpperCase()}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Samples:</span>{' '}
                                        <span className="text-white">{uploadedFile.validation.sample_count}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => setUploadedFile(null)}
                            className="mt-3 text-sm text-gray-400 hover:text-white transition-colors bg-white/10 px-2 py-1 rounded-xl cursor-pointer"
                        >
                            Upload different file
                        </button>
                    </div>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-red-400">Upload Failed</p>
                        <p className="text-sm text-red-300/80 mt-1">{error}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatasetUpload;
