import React, { useState, useEffect } from 'react';
import { Fund, MultiModelAnalysisResult, MultiModelRecommendationResult, BudgetConfig, SavedAnalysisResult, FundTradingState } from '../types';
import { analyzePortfolioMultiModel, recommendFundsMultiModel } from '../services/gemini';
import { fetchFundInfo, fetchStockInfo, fetchMarketIndex, EastMoneyFundInfo } from '../services/eastmoney';
import AnalysisPanel from './AnalysisPanel';
import RecommendationPanel from './RecommendationPanel';
import SettingsModal from './SettingsModal';
import FundDetailModal from './FundDetailModal';
import BudgetPanel from './BudgetPanel';
import TradingPanel from './TradingPanel';
import { LayoutDashboard, LineChart, PieChart as PieIcon, Settings, AlertCircle, RefreshCw, TrendingUp, TrendingDown, Wallet, Target } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DashboardProps {
    funds: Fund[];
    budgetConfig: BudgetConfig | null;
    savedAnalysis: SavedAnalysisResult | null;
    tradingStates: Record<string, FundTradingState>;
    onUpdateBudget: (config: BudgetConfig) => void;
    onSaveAnalysis: (result: SavedAnalysisResult) => void;
    onUpdateTradingState: (fundCode: string, state: FundTradingState) => void;
    onUpdateFund: (fund: Fund) => void;
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];

const Dashboard: React.FC<DashboardProps> = ({ funds, budgetConfig, savedAnalysis, tradingStates, onUpdateBudget, onSaveAnalysis, onUpdateTradingState, onUpdateFund }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'discovery' | 'budget' | 'strategy'>('overview');

    // State updated to hold MultiModel results
    const [analysisResult, setAnalysisResult] = useState<MultiModelAnalysisResult | null>(null);
    const [recommendations, setRecommendations] = useState<MultiModelRecommendationResult | null>(null);

    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Real-time Data State
    const [realtimeData, setRealtimeData] = useState<Record<string, EastMoneyFundInfo>>({});
    const [historicalNav, setHistoricalNav] = useState<Record<string, { yesterdayNav: number; dayBeforeNav: number; yesterdayDate: string }>>({});
    const [isResolvingInfo, setIsResolvingInfo] = useState(false);
    const [selectedFund, setSelectedFund] = useState<Fund | null>(null); // For Modal
    const [marketData, setMarketData] = useState<Record<string, { name: string; price: string; change: string }>>({});

    // Fetch market indices
    useEffect(() => {
        const fetchMarket = async () => {
            const [hs300, ssec] = await Promise.all([
                fetchMarketIndex('sh000300'),
                fetchMarketIndex('sh000001'),
            ]);
            const data: Record<string, { name: string; price: string; change: string }> = {};
            if (hs300) data['hs300'] = hs300;
            if (ssec) data['ssec'] = ssec;
            setMarketData(data);
        };
        fetchMarket();
    }, []);

    // Initial Data Fetch
    useEffect(() => {
        if (funds.length > 0) {
            refreshRealtimeData();
        }
    }, [funds]); // Re-fetch when adding funds

    const refreshRealtimeData = async () => {
        setIsResolvingInfo(true);
        const newData: Record<string, EastMoneyFundInfo> = {};
        const newHistorical: Record<string, { yesterdayNav: number; dayBeforeNav: number; yesterdayDate: string }> = {};

        try {
            // Batch fetch (concurrently) - realtime + historical
            await Promise.all(funds.map(async f => {
                try {
                    let info: EastMoneyFundInfo | null = null;
                    const isStock = f.type === 'STOCK';

                    // Code pattern detection: unambiguous stock prefixes
                    // 6XX = Shanghai stock (ALWAYS stock)
                    // 4XX/8XX = Beijing stock (ALWAYS stock)
                    // 0XX/3XX = ambiguous (could be SZ stock or fund)
                    const definitelyStock = f.code.length === 6 &&
                        (f.code.startsWith('6') || f.code.startsWith('4') || f.code.startsWith('8'));

                    if (isStock || definitelyStock) {
                        // Known stock or definite stock code pattern - use stock API
                        info = await fetchStockInfo(f.code);
                    } else {
                        // Fund or unknown type - try fund API
                        info = await fetchFundInfo(f.code);

                        // If fund API didn't return valid data and type is not explicitly set,
                        // try stock API as fallback (handles legacy data without type field)
                        if ((!info || !info.name) && !f.type) {
                            info = await fetchStockInfo(f.code);
                        }

                        // Fetch historical NAV for funds (not stocks)
                        if (info && f.type !== 'STOCK') {
                            try {
                                const { fetchRecentNav } = await import('../services/eastmoney');
                                const recentNav = await fetchRecentNav(f.code);
                                if (recentNav) newHistorical[f.code] = recentNav;
                            } catch (histErr) {
                                console.warn(`Historical NAV fetch failed for ${f.code}`, histErr);
                            }
                        }
                    }

                    if (info) newData[f.code] = info;
                } catch (e) {
                    console.error(`Failed to fetch info for ${f.code}`, e);
                }
            }));

            setRealtimeData(newData);
            setHistoricalNav(newHistorical);
        } finally {
            setIsResolvingInfo(false);
        }
    };

    // Metrics Calculation
    const totalCost = funds.reduce((acc, curr) => acc + (curr.cost * curr.shares), 0);

    // Calculate Total Market Value & Daily Profit
    let totalMarketValue = 0;
    let totalTodayEstProfit = 0; // Today's estimated profit
    let totalYesterdayActualProfit = 0; // Yesterday's actual confirmed profit

    funds.forEach(f => {
        const info = realtimeData[f.code];
        const histNav = historicalNav[f.code];
        const currentPrice = info ? parseFloat(info.gsz) : f.cost;
        const dailyRate = info ? parseFloat(info.gszzl) : 0;

        const marketValue = currentPrice * f.shares;
        totalMarketValue += marketValue;

        // Today's estimated profit (based on realtime valuation)
        const previousMarketValue = marketValue / (1 + dailyRate / 100);
        const todayProfit = marketValue - previousMarketValue;
        totalTodayEstProfit += todayProfit;

        // Yesterday's actual profit (based on historical NAV)
        if (histNav) {
            const yesterdayProfit = (histNav.yesterdayNav - histNav.dayBeforeNav) * f.shares;
            totalYesterdayActualProfit += yesterdayProfit;
        }
    });

    const totalHoldingProfit = totalMarketValue - totalCost;
    const totalYield = totalCost > 0 ? (totalHoldingProfit / totalCost) * 100 : 0;

    const pieData = funds.map(f => ({
        name: f.name || f.code,
        value: f.cost * f.shares // Use Cost Basis for Allocation Chart to stay stable? Or Market Value? Market Value allows seeing over-concentration. Let's use Market Value if available.
        // Actually, pie chart usually shows visual allocation. Market Value is better.
    }));

    // Re-map pie data to use market value if available
    const pieDataMarket = funds.map(f => {
        const info = realtimeData[f.code];
        const val = info ? parseFloat(info.gsz) * f.shares : f.cost * f.shares;
        return { name: f.name || f.code, value: val };
    });
    const pieTotal = pieDataMarket.reduce((acc, curr) => acc + curr.value, 0) || 1; // Prevent division by zero


    const handleRunAnalysis = async () => {
        if (funds.length === 0) {
            setError("请先添加基金到您的投资组合。");
            return;
        }
        setError(null);
        setIsAnalyzing(true);
        try {
            // Use multi-model analysis
            const result = await analyzePortfolioMultiModel(funds);
            setAnalysisResult(result);
            setActiveTab('analysis');
        } catch (e: any) {
            console.error(e);
            setError(e.message || "分析失败。请检查您的 API 配置 (右上角设置) 或稍后重试。");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleDiscovery = async () => {
        setError(null);
        setIsDiscovering(true);
        try {
            const result = await recommendFundsMultiModel(["人工智能", "半导体芯片", "红利低波", "新能源"]);
            setRecommendations(result);
        } catch (e: any) {
            console.error(e);
            setError(e.message || "获取推荐失败。请检查 API 配置。");
        } finally {
            setIsDiscovering(false);
        }
    };

    return (
        <div className="flex-1 ml-0 md:ml-80 min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onSave={() => {
                    setError(null);
                }}
            />

            {selectedFund && (
                <FundDetailModal
                    fund={selectedFund}
                    onClose={() => setSelectedFund(null)}
                />
            )}

            {/* Top Header */}
            <header className="sticky top-0 z-10 backdrop-blur-md border-b bg-white/80 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700 transition-colors duration-300">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-white flex items-center gap-3">
                        我的仪表盘
                    </h2>
                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden lg:block"></div>
                        {/* Metrics Group */}
                        <div className="flex gap-6 text-right hidden lg:flex">
                            <div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">总持仓成本</div>
                                <div className="text-sm font-mono text-slate-900 dark:text-white">
                                    {totalCost.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">今日预估收益</div>
                                <div className={`text-sm font-bold font-mono ${totalTodayEstProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                    {totalTodayEstProfit > 0 ? '+' : ''}{totalTodayEstProfit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">昨日收益</div>
                                <div className={`text-sm font-bold font-mono ${totalYesterdayActualProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                    {totalYesterdayActualProfit > 0 ? '+' : ''}{totalYesterdayActualProfit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">总持有收益</div>
                                <div className={`text-lg font-bold font-mono ${totalHoldingProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                    {totalHoldingProfit > 0 ? '+' : ''}{totalHoldingProfit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}
                                </div>
                            </div>
                        </div>

                        <div className="h-8 w-px bg-slate-700 hidden lg:block"></div>

                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="h-8 w-8 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                            title="多模型 AI 设置"
                        >
                            <Settings size={16} />
                        </button>
                    </div>
                </div>

                {/* Mobile Metrics Bar */}
                <div className="lg:hidden px-4 py-2 bg-white border-t border-slate-200 dark:bg-slate-800 dark:border-slate-700 flex justify-between text-xs overflow-x-auto whitespace-nowrap gap-4 transition-colors duration-300">
                    <div>
                        <span className="text-slate-500 mr-1">总成本</span>
                        <span className="text-slate-900 dark:text-slate-200">{Math.round(totalCost)}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-1">今日预估</span>
                        <span className={`${totalTodayEstProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>{totalTodayEstProfit.toFixed(0)}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-1">昨日</span>
                        <span className={`${totalYesterdayActualProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>{totalYesterdayActualProfit.toFixed(0)}</span>
                    </div>
                    <div>
                        <span className="text-slate-500 mr-1">总盈亏</span>
                        <span className={`${totalHoldingProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>{totalHoldingProfit.toFixed(0)}</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {error && (
                    <div className="mb-6 bg-red-900/20 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-200">
                        <AlertCircle size={20} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="flex justify-between items-center mb-8">
                    <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-full max-w-xl transition-colors duration-300">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'overview' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-600 dark:text-white dark:ring-0' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                }`}
                        >
                            <LayoutDashboard size={16} /> 概览
                        </button>
                        <button
                            onClick={() => setActiveTab('analysis')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'analysis' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-600 dark:text-white dark:ring-0' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                }`}
                        >
                            <LineChart size={16} /> AI分析
                        </button>
                        <button
                            onClick={() => setActiveTab('discovery')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'discovery' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-600 dark:text-white dark:ring-0' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                }`}
                        >
                            <PieIcon size={16} /> 发现
                        </button>
                        <button
                            onClick={() => setActiveTab('budget')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'budget' ? 'bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-600 dark:text-white dark:ring-0' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                }`}
                        >
                            <Wallet size={16} /> 理财
                        </button>
                        <button
                            onClick={() => setActiveTab('strategy')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all whitespace-nowrap ${activeTab === 'strategy' ? 'bg-white text-amber-600 shadow-sm ring-1 ring-slate-200 dark:bg-amber-600 dark:text-white dark:ring-0' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                                }`}
                        >
                            <Target size={16} /> 策略
                        </button>
                    </div>

                    <button
                        onClick={refreshRealtimeData}
                        disabled={isResolvingInfo}
                        title="刷新实时数据"
                        className="p-2 bg-slate-800 rounded-lg text-emerald-400 hover:bg-slate-700 transition-colors"
                    >
                        <RefreshCw size={18} className={isResolvingInfo ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Content Area */}
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Fund List Table (New) */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-300">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">持仓详情</h3>
                                {funds.length === 0 ? (
                                    <div className="text-slate-500 text-sm text-center py-8">请先添加基金</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/50 font-medium transition-colors duration-300">
                                                <tr>
                                                    <th className="px-4 py-3 rounded-l-lg">基金名称</th>
                                                    <th className="px-4 py-3 text-right">今日预估</th>
                                                    <th className="px-4 py-3 text-right">昨日收益</th>
                                                    <th className="px-4 py-3 text-right">持有收益率</th>
                                                    <th className="px-4 py-3 text-right rounded-r-lg">持有收益(元)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50 transition-colors duration-300">
                                                {funds.map(fund => {
                                                    const info = realtimeData[fund.code];
                                                    const histNav = historicalNav[fund.code];
                                                    const currentPrice = info ? parseFloat(info.gsz) : fund.cost;
                                                    const dailyRate = info ? parseFloat(info.gszzl) : 0;
                                                    const profit = (currentPrice - fund.cost) * fund.shares;
                                                    const yieldRate = fund.cost > 0 ? (profit / (fund.cost * fund.shares)) * 100 : 0;

                                                    const marketValue = currentPrice * fund.shares;
                                                    const previousMarketValue = marketValue / (1 + dailyRate / 100);
                                                    const todayProfit = marketValue - previousMarketValue;

                                                    // Yesterday's actual profit
                                                    const yesterdayProfit = histNav
                                                        ? (histNav.yesterdayNav - histNav.dayBeforeNav) * fund.shares
                                                        : 0;

                                                    return (
                                                        <React.Fragment key={fund.id}>
                                                            <tr
                                                                onClick={() => setSelectedFund(fund)}
                                                                className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors group"
                                                            >
                                                                <td className="px-3 py-2">
                                                                    <div className="font-medium text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors text-sm whitespace-nowrap">{fund.name}</div>
                                                                    <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{fund.code}</div>
                                                                </td>
                                                                <td className="px-2 py-2 text-right">
                                                                    <div className={`font-mono font-bold text-sm whitespace-nowrap ${dailyRate >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                                                        {todayProfit > 0 ? '+' : ''}{todayProfit.toFixed(2)}
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-500 whitespace-nowrap">
                                                                        {dailyRate > 0 ? '+' : ''}{dailyRate}%
                                                                    </div>
                                                                </td>
                                                                <td className="px-2 py-2 text-right">
                                                                    <div className={`font-mono font-bold text-sm whitespace-nowrap ${yesterdayProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                                                        {yesterdayProfit > 0 ? '+' : ''}{yesterdayProfit.toFixed(2)}
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-500 whitespace-nowrap">
                                                                        {histNav ? histNav.yesterdayDate.slice(5) : '-'}
                                                                    </div>
                                                                </td>
                                                                <td className="px-2 py-2 text-right">
                                                                    <div className={`font-mono font-bold text-sm whitespace-nowrap ${yieldRate >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                                                        {yieldRate > 0 ? '+' : ''}{yieldRate.toFixed(2)}%
                                                                    </div>
                                                                </td>
                                                                <td className="px-2 py-2 text-right">
                                                                    <div className={`font-mono font-bold text-sm whitespace-nowrap ${profit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                                                        {profit > 0 ? '+' : ''}{profit.toFixed(2)}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                            {/* Analysis Row placeholder - kept hidden for now as we moved analysis to separate tab */}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Allocation Chart */}
                            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-300">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">资产分布 (市值)</h3>
                                <div className="h-64 flex items-center justify-center">
                                    {funds.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={pieDataMarket}
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {pieDataMarket.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '0.5rem', color: '#f1f5f9' }}
                                                    formatter={(value: number) => `¥${Math.round(value).toLocaleString()}`}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="text-slate-400 dark:text-slate-500 text-sm">暂无数据</div>
                                    )}
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                    {pieDataMarket.map((entry, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                            <span className="text-slate-600 dark:text-slate-300 truncate">{entry.name}</span>
                                            <span className="text-slate-500 dark:text-slate-400 ml-auto">{((entry.value / pieTotal) * 100).toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Actions Sidebar */}
                        <div className="space-y-6">
                            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 flex flex-col justify-center items-center text-center space-y-4">
                                <div className="p-4 bg-emerald-500/10 rounded-full">
                                    <LineChart size={32} className="text-emerald-400" />
                                </div>
                                <h3 className="text-white font-bold text-lg">AI 策略引擎</h3>
                                <p className="text-slate-400 text-sm">
                                    根据实时全球新闻、中国宏观经济指标分析您的当前持仓。<br />
                                    <span className="text-blue-400 text-xs mt-1 block">支持多模型对比 (Gemini, OpenAI, DeepSeek...)</span>
                                </p>
                                <button
                                    onClick={handleRunAnalysis}
                                    disabled={isAnalyzing}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-emerald-900/50 disabled:bg-slate-700 disabled:cursor-not-allowed"
                                >
                                    {isAnalyzing ? '正在并行分析...' : '运行多模型投资分析'}
                                </button>
                            </div>

                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-xs text-slate-400">
                                <h4 className="font-bold text-slate-300 mb-2 flex items-center gap-2"><TrendingUp size={14} /> 市场概况</h4>
                                <p>沪深300: {marketData['hs300'] ? (
                                    <span className={parseFloat(marketData['hs300'].change) >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                                        {marketData['hs300'].price} ({parseFloat(marketData['hs300'].change) > 0 ? '+' : ''}{marketData['hs300'].change}%)
                                    </span>
                                ) : <span className="text-slate-500">--</span>}</p>
                                <p className="mt-1">上证指数: {marketData['ssec'] ? (
                                    <span className={parseFloat(marketData['ssec'].change) >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                                        {marketData['ssec'].price} ({parseFloat(marketData['ssec'].change) > 0 ? '+' : ''}{marketData['ssec'].change}%)
                                    </span>
                                ) : <span className="text-slate-500">--</span>}</p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'analysis' && (
                    <AnalysisPanel
                        data={analysisResult}
                        isLoading={isAnalyzing}
                        onRunAnalysis={handleRunAnalysis}
                        onSaveAnalysis={onSaveAnalysis}
                        funds={funds}
                    />
                )}

                {activeTab === 'discovery' && (
                    <RecommendationPanel
                        recommendations={recommendations}
                        isLoading={isDiscovering}
                        onRefresh={handleDiscovery}
                    />
                )}

                {activeTab === 'budget' && (
                    <div className="max-w-4xl mx-auto">
                        <BudgetPanel
                            budgetConfig={budgetConfig}
                            onUpdateBudget={onUpdateBudget}
                            savedAnalysis={savedAnalysis}
                            funds={funds}
                        />
                    </div>
                )}

                {activeTab === 'strategy' && (
                    <div className="max-w-5xl mx-auto">
                        <TradingPanel
                            funds={funds}
                            savedAnalysis={savedAnalysis}
                            tradingStates={tradingStates}
                            onUpdateTradingState={onUpdateTradingState}
                            onUpdateFund={onUpdateFund}
                        />
                    </div>
                )}

            </main>
        </div>
    );
};

export default Dashboard;
