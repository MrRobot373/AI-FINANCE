import React, { useEffect, useState } from 'react';
import { getTransactions, deleteTransaction, getCategories } from '../services/api';
import { formatDate } from '../utils/dateUtils';
import { Trash2, Edit2, Search, Filter } from 'lucide-react';
import TransactionModal from '../components/TransactionModal';

const Transactions = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState([]);
    const [filter, setFilter] = useState('All'); // All, Income, Expense
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);

    // Edit State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [transactionToEdit, setTransactionToEdit] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            console.log("Fetching transactions data...");
            const [txData, catData] = await Promise.all([getTransactions(), getCategories()]);
            console.log("Data fetched:", { txData, catData });

            setTransactions(Array.isArray(txData) ? txData : []);
            setCategories(Array.isArray(catData) ? catData : []);
        } catch (error) {
            console.error("Failed to fetch transactions page data", error);
            setError("Failed to load transactions. Please try again.");
            setTransactions([]);
            setCategories([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this transaction?')) {
            try {
                console.log("Deleting transaction:", id);
                await deleteTransaction(id);
                console.log("Transaction deleted successfully");
                fetchData();
            } catch (err) {
                console.error("Failed to delete transaction:", err);
                alert("Failed to delete transaction: " + (err.response?.data?.detail || err.message));
            }
        }
    };

    const handleEdit = (tx) => {
        console.log("Editing transaction:", tx);
        setTransactionToEdit(tx);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setTransactionToEdit(null);
    };

    const filteredTransactions = transactions.filter(tx => {
        if (!tx) return false;
        const matchesSearch = (tx.description || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filter === 'All'
            ? true
            : filter === 'Income'
                ? tx.amount > 0
                : tx.amount < 0;
        return matchesSearch && matchesFilter;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
                <p>{error}</p>
                <button onClick={fetchData} className="mt-4 px-4 py-2 bg-white/10 rounded hover:bg-white/20 text-white">Retry</button>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 h-full">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-2xl font-bold">Transactions</h2>

                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    {/* Search */}
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search transactions..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-card-bg border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
                        />
                    </div>

                    {/* Filter */}
                    <div className="flex bg-card-bg p-1 rounded-xl border border-white/10">
                        {['All', 'Income', 'Expense'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === f ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-card-bg border border-white/5 rounded-2xl overflow-auto flex-1 scrollbar-hide">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="sticky top-0 z-10">
                            <tr className="text-left text-xs text-gray-500 border-b border-white/5 bg-card-bg">
                                <th className="px-6 py-4 font-medium">Date</th>
                                <th className="px-6 py-4 font-medium">Description</th>
                                <th className="px-6 py-4 font-medium">Category</th>
                                <th className="px-6 py-4 font-medium text-right">Amount</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-white/5">
                            {filteredTransactions.map((tx) => {
                                const isIncome = tx.amount > 0;
                                const category = categories?.find(c => c && c.id === tx.category_id)?.name || 'Uncategorized';

                                return (
                                    <tr key={tx.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 text-gray-400">
                                            {formatDate(tx.date)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-white">{tx.description}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 rounded-md bg-white/5 text-xs text-gray-300 border border-white/5">
                                                {category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`font-bold ${isIncome ? 'text-green-500' : 'text-red-500'}`}>
                                                {isIncome ? '+' : '-'}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleEdit(tx)}
                                                    className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-500 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(tx.id)}
                                                    className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredTransactions.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                        No transactions found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Only render modal if open */}
            {isModalOpen && (
                <TransactionModal
                    isOpen={isModalOpen}
                    onClose={handleModalClose}
                    onTransactionAdded={fetchData}
                    transactionToEdit={transactionToEdit}
                />
            )}
        </div>
    );
};

export default Transactions;
