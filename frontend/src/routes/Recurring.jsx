import React, { useEffect, useState } from 'react';
import { Plus, Repeat, Trash2, Loader2, Calendar, Edit } from 'lucide-react';
import { formatDate, formatDateForInput } from '../utils/dateUtils';
import { getRecurringExpenses, createRecurringExpense, deleteRecurringExpense, updateRecurringExpense, createTransaction, getCategories } from '../services/api';

const Recurring = () => {
    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editModel, setEditModel] = useState(false);
    const [currentEditId, setCurrentEditId] = useState(null);
    // Form State
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [frequency, setFrequency] = useState('Monthly');
    const [nextDueDate, setNextDueDate] = useState(formatDateForInput(new Date()));
    const [submitting, setSubmitting] = useState(false);
    const today = new Date().toISOString().split('T')[0];
    useEffect(() => {
        const init = async () => {
            const cats = await getCategories();
            setCategories(cats);
            await fetchExpenses();
        };
        init();
    }, []);

    const fetchExpenses = async () => {
        setLoading(true);
        const data = await getRecurringExpenses();
        setExpenses(data);
        setLoading(false);
    };

    function sameDateNextMonth(date) {
        const d = new Date(date);
        const day = d.getDate();

        d.setDate(1);                     // prevent overflow
        d.setMonth(d.getMonth() + 1);

        const lastDay = new Date(
            d.getFullYear(),
            d.getMonth() + 1,
            0
        ).getDate();

        d.setDate(Math.min(day, lastDay));

        // Return ISO string in local time to avoid timezone shift
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
        return localISOTime;
    }

    function sameDateNextQuarter(date) {
        const d = new Date(date);
        const day = d.getDate();

        d.setDate(1);                     // prevent overflow
        d.setMonth(d.getMonth() + 3);

        const lastDay = new Date(
            d.getFullYear(),
            d.getMonth() + 1,
            0
        ).getDate();

        d.setDate(Math.min(day, lastDay));

        // Return ISO string in local time to avoid timezone shift
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
        return localISOTime;
    }

    function sameDateNextWeek(date) {
        const d = new Date(date);
        d.setDate(d.getDate() + 7);

        // Return ISO string in local time to avoid timezone shift
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
        return localISOTime;
    }
    function sameDateNextYear(date) {
        const d = new Date(date);
        const day = d.getDate();

        d.setDate(1);                     // prevent overflow
        d.setMonth(d.getMonth() + 12);

        const lastDay = new Date(
            d.getFullYear(),
            d.getMonth() + 1,
            0
        ).getDate();

        d.setDate(Math.min(day, lastDay));

        // Return ISO string in local time to avoid timezone shift
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISOTime = new Date(d.getTime() - tzOffset).toISOString();
        return localISOTime;
    }

    const handleWarningAction = async (id) => {
        const expense = expenses.find(e => e.id === id);
        if (expense) {
            // Find a suitable category or use a fallback
            const category = categories.find(c =>
                c.name.toLowerCase().includes('recurring')
            )
            if (category) {
                await createTransaction({
                    amount: -Math.abs(parseFloat(expense.amount)),
                    description: `Paid Recurring: ${expense.name}`,
                    date: new Date().toISOString(),
                    category_id: category.id,
                    notes: `Automatic deduction for recurring expense: ${expense.name}`
                });
            }
        }

        if (expense.frequency === 'Monthly') {
            const nextMonthDateStr = sameDateNextMonth(new Date());
            await updateRecurringExpense(id, { next_due_date: nextMonthDateStr });
        }
        if (expense.frequency === 'Weekly') {
            const nextWeekDateStr = sameDateNextWeek(new Date());
            await updateRecurringExpense(id, { next_due_date: nextWeekDateStr });
        }
        if (expense.frequency === 'Yearly') {
            const nextYearDateStr = sameDateNextYear(new Date());
            await updateRecurringExpense(id, { next_due_date: nextYearDateStr });
        }
        if (expense.frequency === 'Quarterly') {
            const nextQuarterDateStr = sameDateNextQuarter(new Date());
            await updateRecurringExpense(id, { next_due_date: nextQuarterDateStr });
        }
        await fetchExpenses();
    };
    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this recurring expense?')) {
            await deleteRecurringExpense(id);
            fetchExpenses();
        }
    };

    const handleEdit = (id) => {
        const expense = expenses.find(e => e.id === id);
        if (expense) {
            setName(expense.name);
            setAmount(expense.amount);
            setFrequency(expense.frequency);
            setNextDueDate(formatDateForInput(expense.next_due_date));
            setCurrentEditId(id);
            setEditModel(true);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editModel && currentEditId) {
                // Update existing
                await updateRecurringExpense(currentEditId, {
                    name,
                    amount: parseFloat(amount),
                    frequency,
                    next_due_date: new Date(nextDueDate).toISOString()
                });
                setEditModel(false);
                setCurrentEditId(null);
            } else {
                // Create new
                await createRecurringExpense({
                    name,
                    amount: parseFloat(amount),
                    frequency,
                    next_due_date: new Date(nextDueDate).toISOString()
                });
                setIsModalOpen(false);
            }

            // Reset form
            setName('');
            setAmount('');
            setFrequency('Monthly');
            setNextDueDate('');

            await fetchExpenses();
        } catch (error) {
            console.error("Failed to save recurring expense", error);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 overflow-y-auto scrollbar-hide">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Recurring Expenses</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-dark-bg font-bold py-2 px-4 rounded-xl transition-colors shadow-lg shadow-primary/20"
                >
                    <Plus size={20} />
                    <span>Add Recurring</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {expenses.map((expense) => {
                    const today = new Date().toISOString().split('T')[0];
                    const isDueToday = expense.next_due_date && expense.next_due_date.split('T')[0] === today;

                    return (
                        <div key={expense.id} className="bg-card-bg border border-white/5 rounded-2xl p-6 relative group flex flex-col justify-between overflow-hidden">
                            <button
                                onClick={() => handleEdit(expense.id)}
                                className="absolute top-4 right-12 text-gray-500 hover:text-primary-dark opacity-0 group-hover:opacity-100 transition-all z-10"
                            >
                                <Edit size={18} />
                            </button>
                            <button
                                onClick={() => handleDelete(expense.id)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all z-10"
                            >
                                <Trash2 size={18} />
                            </button>

                            <div>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-accent-purple/10 flex items-center justify-center text-accent-purple">
                                        <Repeat size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-[#00A87E] text-lg">{expense.name}</h3>
                                        <p className="text-sm text-gray-400">{expense.frequency}</p>
                                    </div>
                                </div>
                                <div className="text-2xl text-red-400 font-bold mb-4">
                                    ₹{expense.amount.toLocaleString('en-IN')}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-400 bg-white/5 p-3 rounded-xl">
                                <Calendar size={16} />
                                <span>Next Due: {formatDate(expense.next_due_date)}</span>
                            </div>
                            {
                                isDueToday && (
                                    <div className="absolute inset-0 bg-red-500/80 backdrop-blur-3xl flex flex-col items-center justify-center p-4 text-center z-20">
                                        <p className="text-white text-xl font-bold mb-4">Warning: {expense.name} is due today!</p>
                                        <p className="text-white text-lg mb-4">Amount: ₹{expense.amount.toLocaleString('en-IN')}</p>
                                        <button
                                            onClick={() => handleWarningAction(expense.id)}
                                            className="bg-white text-red-500 font-bold px-6 py-2 rounded-xl hover:bg-gray-100 transition-all shadow-lg"
                                        >
                                            Paid
                                        </button>
                                    </div>
                                )
                            }
                        </div>
                    );
                })}

                {expenses.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500">
                        <Repeat size={48} className="mb-4 opacity-50" />
                        <p>No recurring expenses yet.</p>
                    </div>
                )}
            </div>

            {/* Simple Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-card-bg border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 text-emerald-500">New Recurring Expense</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input
                                type="text"
                                placeholder="Expense Name (e.g. Netflix)"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                required
                            />
                            <input
                                type="number"
                                placeholder="Amount"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                required
                            />
                            <select
                                value={frequency}
                                onChange={e => setFrequency(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/50"
                            >
                                <option value="Weekly">Weekly</option>
                                <option value="Monthly">Monthly</option>
                                <option value="Yearly">Yearly</option>
                                <option value="Quarterly">Quarterly</option>
                            </select>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Next Due Date</label>
                                <input
                                    type="date"
                                    value={nextDueDate}
                                    min={today}
                                    onChange={e => setNextDueDate(e.target.value)}
                                    className="w-full date-icon-white bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/50"
                                    required
                                />
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 rounded-xl text-red-500 hover:text-red-600 border border-white/10 hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-3 rounded-xl bg-primary text-dark-bg font-bold hover:bg-primary-dark transition-colors flex items-center justify-center"
                                >
                                    {submitting ? <Loader2 className="animate-spin" /> : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editModel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-card-bg border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 text-emerald-500">Edit Recurring Expense</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input
                                type="text"
                                placeholder="Expense Name (e.g. Netflix)"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                required
                            />
                            <input
                                type="number"
                                placeholder="Amount"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                required
                            />
                            <select
                                value={frequency}
                                onChange={e => setFrequency(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/50"
                            >
                                <option value="Weekly">Weekly</option>
                                <option value="Monthly">Monthly</option>
                                <option value="Yearly">Yearly</option>
                                <option value="Quarterly">Quarterly</option>
                            </select>
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Next Due Date</label>
                                <input
                                    type="date"
                                    value={nextDueDate}
                                    min={today}
                                    onChange={e => setNextDueDate(e.target.value)}
                                    className="w-full date-icon-white bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/50"
                                    required
                                />
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setEditModel(false)}
                                    className="flex-1 py-3 rounded-xl text-red-500 hover:text-red-600 border border-white/10 hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-3 rounded-xl bg-primary text-dark-bg font-bold hover:bg-primary-dark transition-colors flex items-center justify-center"
                                >
                                    {submitting ? <Loader2 className="animate-spin" /> : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Recurring;
