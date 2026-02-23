import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';
import { getCategories, createCategory, createTransaction, updateTransaction } from '../services/api';
import { formatDateForInput } from '../utils/dateUtils';

const TransactionModal = ({ isOpen, onClose, onTransactionAdded, transactionToEdit = null }) => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);

    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [defaultCategory, setDefaultCategory] = useState('');
    const [date, setDate] = useState(formatDateForInput(new Date()));
    const [newCategoryName, setNewCategoryName] = useState('');
    const [type, setType] = useState('expense');
    const [filteredCategories, setFilteredCategories] = useState([]);
    const today = new Date().toISOString().split('T')[0];
    

    useEffect(() => {
        if (type === "expense") {
            setFilteredCategories([...categories.filter(cat => !cat.is_income)])
        } else {
            setFilteredCategories([...categories.filter(cat => cat.is_income)])
        }

    }, [type, categories]);

    useEffect(() => {
        if (isOpen) {
            fetchCategories();
            if (transactionToEdit) {
                // Pre-fill for edit
                setAmount(Math.abs(transactionToEdit.amount).toString());
                setDescription(transactionToEdit.description);
                setCategoryId(transactionToEdit.category_id);
                setDate(formatDateForInput(transactionToEdit.date));
                setType(transactionToEdit.amount > 0 ? 'income' : 'expense');
            } else {
                // Reset for new
                setAmount('');
                setDescription('');
                setDefaultCategory('');
                setCategoryId(defaultCategory.id);
                setDate(formatDateForInput(new Date()));
                setType('expense');
            }
        }
    }, [isOpen, transactionToEdit]);

    const fetchCategories = async () => {
        setLoading(true);
        const data = await getCategories();
        setDefaultCategory(data[0]);
        setCategories(data);
        setLoading(false);
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName) return;
        setLoading(true);
        try {
            const newCat = await createCategory({ name: newCategoryName, is_income: type === 'income' });
            setCategories([...categories, newCat]);
            setCategoryId(newCat.id);
            setIsCreatingCategory(false);
            setNewCategoryName('');
        } catch (error) {
            console.error("Failed to create category", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!amount || !description || !categoryId) return;

        setSubmitting(true);
        try {
            const finalAmount = type === 'expense' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount));

            if (transactionToEdit) {
                await updateTransaction(transactionToEdit.id, {
                    amount: finalAmount,
                    description,
                    category_id: categoryId,
                    date: new Date(date).toISOString(),
                });
            } else {
                await createTransaction({
                    amount: finalAmount,
                    description,
                    category_id: categoryId,
                    date: new Date(date).toISOString(),
                });
            }

            onTransactionAdded();
            onClose();
        } catch (error) {
            console.error("Failed to save transaction", error);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-card-bg border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-bold text-[#00A87E] mb-6">{transactionToEdit ? 'Edit Transaction' : 'Add New Transaction'}</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Type Toggle */}
                    <div className="flex bg-dark-bg p-1 rounded-xl mb-4">
                        <button
                            type="button"
                            onClick={() => setType('expense')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${type === 'expense' ? 'bg-red-500/20 text-red-500' : 'text-gray-400 hover:text-white'}`}
                        >
                            Expense
                        </button>
                        <button
                            type="button"
                            onClick={() => setType('income')}
                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${type === 'income' ? 'bg-green-500/20 text-green-500' : 'text-gray-400 hover:text-white'}`}
                        >
                            Income
                        </button>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Amount</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                            <input
                                type="number"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Description</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                            placeholder="e.g. Grocery Shopping"
                            required
                        />
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Date</label>
                        <input
                            type="date"
                            value={date}
                            max={today}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full date-icon-white bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-white"
                            required
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Category</label>
                        {!isCreatingCategory ? (
                            <div className="flex gap-2">
                                <select
                                    value={categoryId}
                                    onChange={(e) => setCategoryId(e.target.value)}
                                    className="flex-1 bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/50 appearance-none"
                                    required
                                >
                                    {filteredCategories.length === 0 ? (
                                        <option value="">Create {type} Category</option>
                                    ) : (
                                        filteredCategories.map(cat => {
                                            if (cat.name === "Recurring" || cat.name === "Goals") {
                                                return null;
                                            }
                                            return <option key={cat.id} value={cat.id}>{cat.name}</option>;
                                        })
                                    )}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingCategory(true)}
                                    className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 flex items-center justify-center transition-colors"
                                    title="Create New Category"
                                >
                                    <Plus size={18} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    className="flex-1 bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                    placeholder="New Category Name"
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateCategory}
                                    className="bg-primary hover:bg-primary-dark text-dark-bg font-bold rounded-xl px-4 text-sm transition-colors"
                                    disabled={loading}
                                >
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : 'Add'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingCategory(false)}
                                    className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 flex items-center justify-center transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full bg-primary hover:bg-primary-dark text-dark-bg font-bold py-3 rounded-xl transition-colors mt-4 flex items-center justify-center gap-2"
                    >
                        {submitting && <Loader2 className="animate-spin" size={18} />}
                        {transactionToEdit ? 'Update Transaction' : 'Create Transaction'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default TransactionModal;
