import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { createCategory, updateCategory } from '../services/api';

const CategoryModal = ({ isOpen, onClose, onCategorySaved, categoryToEdit = null }) => {
    const [name, setName] = useState('');
    const [isIncome, setIsIncome] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errexisting, seterrexisting] = useState(false)


    useEffect(() => {
        if (isOpen) {
            if (categoryToEdit) {
                setName(categoryToEdit.name);
                setIsIncome(categoryToEdit.is_income);
            } else {
                setName('');
                setIsIncome(false);
            }
        }
    }, [isOpen, categoryToEdit]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name) return;

        setLoading(true);
        try {
            if (categoryToEdit) {
                await updateCategory(categoryToEdit.id, { name, is_income: isIncome });
            } else {
                await createCategory({ name, is_income: isIncome });
            }
            onCategorySaved();
            onClose();
        } catch (error) {
            seterrexisting(true)
        } finally {
            setLoading(false);
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

                <h2 className="text-xl text-white font-bold mb-6">{categoryToEdit ? 'Edit Category' : 'Add New Category'}</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-xs text-gray-400 mb-2">Category Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-dark-bg border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-primary/50"
                            placeholder="e.g. Groceries, Salary..."
                            required
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-dark-bg/50 border border-white/5 rounded-xl">
                        <div>
                            <div className="text-sm font-medium text-green-500">Income Category</div>
                            <div className="text-xs text-gray-400">Toggle on if this category is for income</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsIncome(!isIncome)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isIncome ? 'bg-green-500' : 'bg-white/10'}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-dark-bg transition-transform ${isIncome ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                        </button>
                    </div>
                    {errexisting && <p className="text-red-500 text-sm text-center">Category already exists</p>}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary-dark text-dark-bg font-bold py-3 rounded-xl transition-colors mt-4 flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 className="animate-spin" size={18} />}
                        {categoryToEdit ? 'Update Category' : 'Create Category'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CategoryModal;
