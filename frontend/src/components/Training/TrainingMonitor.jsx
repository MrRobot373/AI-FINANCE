import React, { useEffect, useState } from 'react';
import { File, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { getApiBaseUrl } from '../../utils/apiBase';

const TrainingMonitor = () => {
    const [embeddings, setEmbeddings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const apiUrl = getApiBaseUrl();
    const token = localStorage.getItem('token');

    const fetchFiles = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${apiUrl}/ai/knowledge/files`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch files');

            const data = await response.json();
            setEmbeddings(data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();

        // Polling to catch newly uploaded files
        const interval = setInterval(fetchFiles, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleDelete = async (id) => {
        if (!window.confirm(`Are you sure you want to delete ${id} from the knowledge base?`)) return;

        try {
            const response = await fetch(`${apiUrl}/ai/knowledge/files/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to delete file');

            // Optimistically update
            setEmbeddings(embeddings.filter((emb) => emb.id !== id));
        } catch (err) {
            alert(`Error deleting file: ${err.message}`);
        }
    };

    if (loading && embeddings.length === 0) {
        return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 text-emerald-400 animate-spin" /></div>;
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300/80 mt-1">{error}</p>
            </div>
        );
    }

    if (embeddings.length === 0) {
        return <div className="text-center p-8 text-gray-400 border border-white/10 rounded-2xl bg-white/[0.02]">No files in the knowledge base yet.</div>;
    }

    return (
        <div className="flex flex-col gap-5">
            {embeddings.map((emb) => {
                return (
                    <div key={emb.id} className='bg-white/[0.02] border border-white/10 rounded-2xl py-6 px-6 flex justify-between items-center transition-all hover:border-white/20'>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <File className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">{emb.name}</h3>
                                <p className="text-sm text-gray-400 capitalize">Status: {emb.status}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleDelete(emb.id)}
                            className='w-10 h-10 flex items-center justify-center rounded-xl hover:bg-red-500/10 transition-colors group'
                            title='Delete from knowledge base'
                        >
                            <Trash2 className="w-5 h-5 text-gray-400 group-hover:text-red-400 transition-colors" />
                        </button>
                    </div>
                )
            })
            }
        </div>
    );
};

export default TrainingMonitor;
