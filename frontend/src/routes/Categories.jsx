import React, { useEffect, useState } from 'react';
import { getCategories, deleteCategory } from '../services/api';
import { Trash2, Edit2, Plus, Search, UtensilsCrossed } from 'lucide-react';
import CategoryModal from '../components/CategoryModal';

const Categories = () => {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState(null);
    const defaultCategories = ["Salary","Goals", "Freelance", "Investment", "Transport", "Social Life", "Shopping", "Food", "Entertainment", "Household", "Gifts", "Recurring"];
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [categoryToEdit, setCategoryToEdit] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getCategories();
            setCategories(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch categories", error);
            setError("Failed to load categories. Please try again.");
            setCategories([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this category? Any transactions in this category will become Uncategorized.')) {
            try {
                await deleteCategory(id);
                fetchData();
            } catch (err) {
                console.error("Failed to delete category:", err);
                alert("Failed to delete category: " + (err.response?.data?.detail || err.message));
            }
        }
    };

    const handleEdit = (category) => {
        setCategoryToEdit(category);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setCategoryToEdit(null);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setCategoryToEdit(null);
    };

    const filteredCategories = categories.filter(cat =>
        (cat.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => (a.is_income === b.is_income) ? a.name.localeCompare(b.name) : (a.is_income ? -1 : 1));

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
                <h2 className="text-2xl font-bold text-amber-50">Manage Categories</h2>

                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search categories..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-card-bg border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 text-white"
                        />
                    </div>

                    <button
                        onClick={handleAdd}
                        className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-dark-bg font-bold px-6 py-2.5 rounded-xl transition-colors"
                    >
                        <Plus size={18} />
                        <span>Add Category</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCategories.map((category) => (
                    !defaultCategories.includes(category.name) && (
                        <div
                            key={category.id}
                            className="group bg-card-bg border border-white/5 rounded-2xl p-5 hover:border-white/20 transition-all flex flex-col justify-between"
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col gap-1">
                                    <span className="font-semibold text-lg text-white group-hover:text-primary transition-colors">
                                        {category.name}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${category.is_income ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                        {category.is_income ? 'Income' : 'Expense'}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleEdit(category)}
                                        className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-500 transition-colors"
                                        title="Edit"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(category.id)}
                                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                ))}
                {filteredCategories.length === 0 && (
                    <div className="col-span-full py-12 text-center text-gray-500 bg-card-bg border border-white/5 rounded-2xl border-dashed">
                        No categories found.
                    </div>
                )}
            </div>

            {isModalOpen && (
                <CategoryModal
                    isOpen={isModalOpen}
                    onClose={handleModalClose}
                    onCategorySaved={fetchData}
                    categoryToEdit={categoryToEdit}
                />
            )}
        </div>
    );
};

export default Categories;
