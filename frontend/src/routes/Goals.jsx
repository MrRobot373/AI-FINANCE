import React, { useEffect, useState } from 'react';
import { Plus, Target, Trash2, Loader2, TrendingUp, X } from 'lucide-react';
import { getGoals, createGoal, deleteGoal, updateGoal, createTransaction, getCategories } from '../services/api';
import { formatDate } from '../utils/dateUtils';

const Goals = () => {
    const [goals, setGoals] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Form State
    const [name, setName] = useState('');
    const [targetAmount, setTargetAmount] = useState('');
    const [currentAmount, setCurrentAmount] = useState('');
    const [deadline, setDeadline] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Contribute State
    const [contributeModalOpen, setContributeModalOpen] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [contributeAmount, setContributeAmount] = useState('');
    const [contributeCategoryId, setContributeCategoryId] = useState('c1e5e519-7107-4a6c-aa86-1bc5f1a516e4');
    const [amountExceed, setAmountExceed] = useState(false)
    const today = new Date().toISOString().split("T")[0]
    useEffect(() => {
        fetchData();

    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [goalsData, categoriesData] = await Promise.all([getGoals(), getCategories()]);
            setGoals(goalsData);
            setCategories(categoriesData);
        } catch (error) {
            console.error("Failed to fetch data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this goal?')) {
            await deleteGoal(id);
            fetchData();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (parseFloat(targetAmount) < parseFloat(currentAmount)) {
                setAmountExceed(true);
                return;
            }
            setAmountExceed(false);
            await createGoal({
                name,
                target_amount: parseFloat(targetAmount),
                current_amount: parseFloat(currentAmount) || 0,
                deadline: deadline ? new Date(deadline).toISOString() : null
            });
            await createTransaction({
                amount: -Math.abs(parseFloat(currentAmount)), // Negative for expense
                description: `Contribution to ${name}`,
                date: new Date().toISOString(),
                category_id: contributeCategoryId
            });

            setIsModalOpen(false);
            fetchData();
            // Reset
            setName('');
            setTargetAmount('');
            setCurrentAmount('');
            setDeadline('');

        } catch (error) {
            console.error("Failed to create goal", error);
        } finally {
            setSubmitting(false);
            setAmountExceed(false);
        }
    };

    const handleContributeClick = (goal) => {
        setSelectedGoal(goal);
        setContributeAmount('');
        setContributeModalOpen(true);
    };

    const handleContributeSubmit = async (e) => {
        e.preventDefault();
        setAmountExceed(false);
        if (!selectedGoal || !contributeAmount || !contributeCategoryId) {
            alert("Please fill in all fields including category.");
            return;
        }

        setSubmitting(true);
        try {
            const newAmount = selectedGoal.current_amount + parseFloat(contributeAmount);

            if (parseFloat(contributeAmount) > selectedGoal.target_amount - selectedGoal.current_amount) {
                setAmountExceed(true);
                return;
            }

            // 1. Update Goal
            await updateGoal(selectedGoal.id, { current_amount: newAmount });

            // 2. Create Expense Transaction
            await createTransaction({
                amount: -Math.abs(parseFloat(contributeAmount)), // Negative for expense
                description: `Contribution to ${selectedGoal.name}`,
                date: new Date().toISOString(),
                category_id: contributeCategoryId
            });
            setAmountExceed(false);
            setContributeModalOpen(false);
            fetchData();
        } catch (error) {
            console.error("Failed to contribute", error);
            alert("Failed to process contribution. Please try again.");
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
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Financial Goals</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-dark-bg font-bold py-2 px-4 rounded-xl transition-colors shadow-lg shadow-primary/20"
                >
                    <Plus size={20} />
                    <span>Add Goal</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {goals.map((goal) => {
                    const progress = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
                    return (
                        <div key={goal.id} className="bg-card-bg border border-white/5 rounded-2xl p-6 relative group flex flex-col justify-between h-full">
                            <button
                                onClick={() => handleDelete(goal.id)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all z-10"
                            >
                                <Trash2 size={18} />
                            </button>

                            <div>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                        <Target size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-primary text-lg">{goal.name}</h3>
                                        <p className="text-sm text-gray-400">Target: ₹{goal.target_amount.toLocaleString('en-IN')}</p>
                                    </div>
                                </div>

                                <div className="mb-2 flex justify-between text-sm">
                                    <span className="text-gray-400">Progress</span>
                                    <span className="font-bold text-primary">{Math.round(progress)}%</span>
                                </div>
                                <div className="h-3 bg-dark-bg rounded-full overflow-hidden mb-4">
                                    <div
                                        className="h-full bg-primary rounded-full transition-all duration-500"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>

                                <div className="flex justify-between text-sm text-gray-400 mb-6">
                                    <span>Current: ₹{goal.current_amount.toLocaleString('en-IN')}</span>
                                    {goal.deadline && (
                                        <span>Due: {formatDate(goal.deadline)}</span>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => handleContributeClick(goal)}
                                className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 text-primary font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <TrendingUp size={16} />
                                Contribute
                            </button>
                        </div>
                    );
                })}

                {goals.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500">
                        <Target size={48} className="mb-4 opacity-50" />
                        <p>No goals set yet. Start saving today!</p>
                    </div>
                )}
            </div>

            {/* Create Goal Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-card-bg border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
                        <h3 className="text-xl font-bold mb-4 text-emerald-500">New Goal</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input
                                type="text"
                                placeholder="Goal Name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                required
                            />
                            <input
                                type="number"
                                placeholder="Target Amount"
                                value={targetAmount}
                                onChange={e => setTargetAmount(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                required
                            />
                            <input
                                type="number"
                                placeholder="Current Amount (Optional)"
                                value={currentAmount}
                                onChange={e => setCurrentAmount(e.target.value)}
                                className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                            />
                            <input
                                type="date"
                                value={deadline}
                                min={today}
                                onChange={e => setDeadline(e.target.value)}
                                className="w-full date-icon-white bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-white"
                            />
                            <div>
                                {amountExceed && <p className="text-red-500 text-sm text-center">Current Amount should not be more than Target Amount</p>}
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsModalOpen(false)
                                        setAmountExceed(false)
                                    }}
                                    className="flex-1 text-white py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-3 rounded-xl bg-primary text-dark-bg font-bold hover:bg-primary-dark transition-colors flex items-center justify-center"
                                >
                                    {submitting ? <Loader2 className="animate-spin" /> : 'Create Goal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Contribute Modal */}
            {contributeModalOpen && selectedGoal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-card-bg border border-white/10 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
                        <button
                            onClick={() => {
                                setContributeModalOpen(false)
                                setAmountExceed(false)
                            }}
                            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                        <h3 className="text-xl font-bold text-green-500 mb-2">Contribute to {selectedGoal.name}</h3>
                        <p className="text-gray-400 text-sm mb-6">Add funds to reach your target of ₹{selectedGoal.target_amount.toLocaleString('en-IN')}</p>

                        <form onSubmit={handleContributeSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Amount to Add</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₹</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={contributeAmount}
                                        onChange={(e) => {
                                            setContributeAmount(e.target.value)
                                            setAmountExceed(false)
                                        }}
                                        className="w-full bg-dark-bg border border-white/10 rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                                        placeholder="0.00"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            {amountExceed && (
                                <p className="text-red-500 text-center text-sm mt-2">{`Remaining amount is ${selectedGoal.target_amount - selectedGoal.current_amount}`}</p>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 rounded-xl bg-primary text-dark-bg font-bold hover:bg-primary-dark transition-colors flex items-center justify-center mt-4"
                            >
                                {submitting ? <Loader2 className="animate-spin" /> : 'Add Funds'}
                            </button>


                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Goals;
