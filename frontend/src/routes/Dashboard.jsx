import React, { useEffect, useState } from 'react';
import {
  CategoryPieChart,
  IncomeChart,
  ExpenseChart,
  BalanceChart,
  SummaryCards
} from '../components/DashboardWidgets';
import TransactionModal from '../components/TransactionModal';
import { getTransactions, getCategories } from '../services/api';
import { Plus } from 'lucide-react';

const Dashboard = () => {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState('Month'); // Day, Week, Month

  const fetchData = async () => {
    try {
      const [txData, catData] = await Promise.all([
        getTransactions(),
        getCategories()
      ]);
      setTransactions(txData);
      setCategories(catData);
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Transactions based on Time
  const filteredTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    const now = new Date();

    if (timeFilter === 'Day') {
      return txDate.toDateString() === now.toDateString();
    } else if (timeFilter === 'Week') {
      const startOfWeek = new Date(now);
      const day = now.getDay(); // 0 (Sunday) to 6 (Saturday)
      // Go back to the preceding Sunday
      startOfWeek.setDate(now.getDate() - day);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      // Go forward to the following Saturday
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      return txDate >= startOfWeek && txDate <= endOfWeek;
    } else { // Month
      return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Header Actions */}
      <div className="flex flex-row justify-between items-center gap-4 shrink-0">
        {/* Time Filter */}
        <div className="flex bg-card-bg p-1 rounded-xl border border-white/10">
          {['Day', 'Week', 'Month'].map(f => (
            <button
              key={f}
              onClick={() => setTimeFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${timeFilter === f ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {f}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-dark-bg font-bold py-1.5 px-3 rounded-xl transition-colors shadow-lg shadow-primary/20 text-sm"
        >
          <Plus size={18} />
          <span>Add</span>
        </button>
      </div>

      {/* Summary Cards - Compact */}
      <div className="shrink-0">
        <SummaryCards transactions={transactions} />
      </div>

      {/* Main Grid - Auto sizing to fit remaining space */}
      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        {/* Left Column: Balance & Pie */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 h-full min-h-0">
          {/* Balance Chart - Takes more height */}
          <div className="flex-3 h-auto">
            <BalanceChart transactions={transactions} />
          </div>
          {/* Income/Expense Bars - Side by Side */}
          <div className="flex-2 grid grid-cols-2 gap-4 min-h-0">
            <IncomeChart transactions={filteredTransactions} />
            <ExpenseChart transactions={filteredTransactions} />
          </div>
        </div>

        {/* Right Column: Category Pie */}
        <div className="col-span-12 lg:col-span-4 min-h-0">
          <CategoryPieChart transactions={filteredTransactions} categories={categories} />
        </div>
      </div>

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTransactionAdded={fetchData}
      />
    </div>
  );
};

export default Dashboard;
