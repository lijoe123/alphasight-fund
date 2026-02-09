import React, { useState, useEffect } from 'react';
import { BudgetConfig, FixedExpenses, SavedAnalysisResult, Fund } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Wallet, Home, UtensilsCrossed, Bus, Smartphone, MoreHorizontal, TrendingUp, PiggyBank, Save, AlertTriangle, Target } from 'lucide-react';

interface BudgetPanelProps {
    budgetConfig: BudgetConfig | null;
    onUpdateBudget: (config: BudgetConfig) => void;
    savedAnalysis: SavedAnalysisResult | null;
    funds: Fund[];
}

// 40-20-20-20 法则
const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'];

const DEFAULT_RATIOS = {
    needs: 40,      // 需求（固定支出从这里出）
    flexible: 20,   // 弹性消费
    savings: 20,    // 储蓄
    investment: 20  // 投资
};

const DEFAULT_EXPENSES: FixedExpenses = {
    rent: 0,
    food: 0,
    commute: 0,
    utilities: 0,
    other: 0
};

const BudgetPanel: React.FC<BudgetPanelProps> = ({ budgetConfig, onUpdateBudget }) => {
    const [salary, setSalary] = useState<string>(budgetConfig?.monthlySalary?.toString() || '');
    const [expenses, setExpenses] = useState<FixedExpenses>(budgetConfig?.fixedExpenses || DEFAULT_EXPENSES);
    const [hasChanges, setHasChanges] = useState(false);

    // Sync from props when budgetConfig changes externally
    useEffect(() => {
        if (budgetConfig) {
            setSalary(budgetConfig.monthlySalary.toString());
            setExpenses(budgetConfig.fixedExpenses);
        }
    }, [budgetConfig]);

    const handleExpenseChange = (key: keyof FixedExpenses, value: string) => {
        const numValue = parseFloat(value) || 0;
        setExpenses(prev => ({ ...prev, [key]: numValue }));
        setHasChanges(true);
    };

    const handleSalaryChange = (value: string) => {
        setSalary(value);
        setHasChanges(true);
    };

    const handleSave = () => {
        const config: BudgetConfig = {
            monthlySalary: parseFloat(salary) || 0,
            fixedExpenses: expenses,
            allocationRatios: DEFAULT_RATIOS
        };
        onUpdateBudget(config);
        setHasChanges(false);
    };

    const parsedSalary = parseFloat(salary) || 0;
    const totalFixedExpenses = Object.values(expenses).reduce((sum, val) => sum + val, 0);

    // 40-20-20-20
    const needsBudget = parsedSalary * 0.40;
    const flexibleBudget = parsedSalary * 0.20;
    const savingsBudget = parsedSalary * 0.20;
    const investmentBudget = parsedSalary * 0.20;

    const isOverBudget = totalFixedExpenses > needsBudget;

    const pieData = [
        { name: '需求 (40%)', value: needsBudget, color: '#ef4444' },
        { name: '弹性 (20%)', value: flexibleBudget, color: '#f59e0b' },
        { name: '储蓄 (20%)', value: savingsBudget, color: '#10b981' },
        { name: '投资 (20%)', value: investmentBudget, color: '#3b82f6' },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600/20 to-blue-600/20 border border-emerald-500/30 rounded-xl p-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Wallet className="text-emerald-400" />
                    月度预算配置
                </h2>
                <p className="text-slate-400 text-sm mt-1">40-20-20-20 法则：需求40%、弹性20%、储蓄20%、投资20%</p>
            </div>

            {/* Salary Input */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <label className="block text-slate-400 text-sm mb-2">月收入</label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">¥</span>
                    <input
                        type="number"
                        value={salary}
                        onChange={(e) => handleSalaryChange(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg py-3 pl-8 pr-4 text-white text-lg focus:outline-none focus:border-emerald-500"
                        placeholder="请输入月收入"
                    />
                </div>
            </div>

            {/* Fixed Expenses */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                    <Home size={16} className="text-red-400" />
                    固定支出 (从"需求40%"中扣除)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { key: 'rent' as const, label: '房租', icon: <Home size={14} /> },
                        { key: 'food' as const, label: '餐饮', icon: <UtensilsCrossed size={14} /> },
                        { key: 'commute' as const, label: '交通', icon: <Bus size={14} /> },
                        { key: 'utilities' as const, label: '水电网', icon: <Smartphone size={14} /> },
                        { key: 'other' as const, label: '其他', icon: <MoreHorizontal size={14} /> },
                    ].map(({ key, label, icon }) => (
                        <div key={key} className="relative">
                            <label className="text-slate-500 text-xs mb-1 flex items-center gap-1">{icon}{label}</label>
                            <input
                                type="number"
                                value={expenses[key] || ''}
                                onChange={(e) => handleExpenseChange(key, e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded py-2 px-3 text-white text-sm focus:outline-none focus:border-red-500"
                                placeholder="0"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-3 flex justify-between text-sm">
                    <span className="text-slate-400">固定支出合计:</span>
                    <span className={`font-bold ${isOverBudget ? 'text-red-400' : 'text-emerald-400'}`}>
                        ¥{totalFixedExpenses.toLocaleString()}
                    </span>
                </div>
                {isOverBudget && (
                    <div className="mt-2 p-2 bg-red-500/20 border border-red-500/40 rounded-lg flex items-center gap-2 text-red-400 text-xs">
                        <AlertTriangle size={14} />
                        固定支出超出"需求"预算 ¥{(totalFixedExpenses - needsBudget).toLocaleString()}
                    </div>
                )}
            </div>

            {/* Budget Allocation Display */}
            {parsedSalary > 0 && (
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                    <h3 className="text-white font-bold mb-4">预算分配</h3>
                    <div className="flex gap-6">
                        <div className="w-48 h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={45}
                                        outerRadius={70}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={index} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-3">
                            <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                    <span className="text-red-200">需求</span>
                                    <span className="text-xs text-red-400/70">40%</span>
                                </div>
                                <span className="font-bold font-mono text-red-400">¥{needsBudget.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                                    <span className="text-amber-200">弹性</span>
                                    <span className="text-xs text-amber-400/70">20%</span>
                                </div>
                                <span className="font-bold font-mono text-amber-400">¥{flexibleBudget.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                                <div className="flex items-center gap-2">
                                    <PiggyBank className="text-emerald-400" size={16} />
                                    <span className="text-emerald-200">储蓄</span>
                                    <span className="text-xs text-emerald-400/70">20%</span>
                                </div>
                                <span className="font-bold font-mono text-emerald-400">¥{savingsBudget.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="text-blue-400" size={16} />
                                    <span className="text-blue-200">投资</span>
                                    <span className="text-xs text-blue-400/70">20%</span>
                                </div>
                                <span className="font-bold font-mono text-blue-400">¥{investmentBudget.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Strategy Tip */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                <Target className="text-amber-400 shrink-0 mt-0.5" size={20} />
                <div>
                    <div className="text-amber-300 font-medium">金字塔策略</div>
                    <div className="text-slate-400 text-sm">
                        投资预算 <span className="text-blue-400 font-bold">¥{investmentBudget.toLocaleString()}</span> 可用于金字塔策略。
                        前往 <span className="text-amber-400">"策略"</span> 页面记录买卖操作并追踪仓位进度。
                    </div>
                </div>
            </div>

            {/* Save Button */}
            {hasChanges && (
                <button
                    onClick={handleSave}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    <Save size={18} />
                    保存配置
                </button>
            )}
        </div>
    );
};

export default BudgetPanel;
