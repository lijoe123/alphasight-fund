import React, { useEffect, useState } from 'react';
import { X, TrendingUp, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Fund } from '../types';
import { fetchFundHistory, fetchFundInfo, fetchStockInfo, fetchStockHistory, EastMoneyFundInfo } from '../services/eastmoney';

interface FundDetailModalProps {
    fund: Fund | null;
    onClose: () => void;
}

const FundDetailModal: React.FC<FundDetailModalProps> = ({ fund, onClose }) => {
    const [history, setHistory] = useState<any[]>([]);
    const [realtimeInfo, setRealtimeInfo] = useState<EastMoneyFundInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isStockAsset, setIsStockAsset] = useState(false);
    const [fetchError, setFetchError] = useState(false);

    const loadData = () => {
        if (fund) {
            setIsLoading(true);
            setHistory([]);
            setRealtimeInfo(null);
            setFetchError(false);

            const isStock = fund.type === 'STOCK' ||
                (fund.code.length === 6 &&
                    (fund.code.startsWith('6') || fund.code.startsWith('4') || fund.code.startsWith('8')));

            setIsStockAsset(isStock);

            const fetchInfoPromise = isStock ? fetchStockInfo(fund.code) : fetchFundInfo(fund.code);
            const fetchHistoryPromise = isStock ? fetchStockHistory(fund.code) : fetchFundHistory(fund.code);

            Promise.all([fetchHistoryPromise, fetchInfoPromise]).then(([histData, rtData]) => {
                const last3Months = histData.slice(-90);
                setHistory(last3Months);
                setRealtimeInfo(rtData);
                if (!rtData && last3Months.length === 0) {
                    setFetchError(true);
                }
            }).catch(() => {
                setFetchError(true);
            }).finally(() => {
                setIsLoading(false);
            });
        }
    };

    useEffect(() => {
        loadData();
    }, [fund]);

    if (!fund) return null;

    // Calculate metrics
    const currentPrice = realtimeInfo ? parseFloat(realtimeInfo.gsz) : fund.cost;
    const holdingProfit = (currentPrice - fund.cost) * fund.shares;
    const holdingYield = ((currentPrice - fund.cost) / fund.cost) * 100;
    const dailyChange = realtimeInfo ? parseFloat(realtimeInfo.gszzl) : 0;
    const yesterdayProfit = realtimeInfo ? (parseFloat(realtimeInfo.gszzl) / 100) * (fund.cost * fund.shares) : 0; // Approx based on holding value

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col transition-colors duration-300">

                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-start transition-colors duration-300">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white transition-colors duration-300">{fund.name}</h2>
                            <span className="font-mono text-sm px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 transition-colors duration-300">
                                {fund.code}
                            </span>
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 text-sm flex gap-4 transition-colors duration-300">
                            <span>持仓成本: <span className="text-slate-900 dark:text-slate-200 font-mono">¥{fund.cost.toFixed(4)}</span></span>
                            <span>持有份额: <span className="text-slate-900 dark:text-slate-200 font-mono">{fund.shares.toFixed(2)}</span></span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-50 border-slate-200 dark:bg-slate-800/50 p-4 rounded-xl border dark:border-slate-700/50 transition-colors duration-300">
                            <div className="text-slate-500 dark:text-slate-400 text-xs mb-1">最新估值 ({realtimeInfo?.gztime?.split(' ')[1] || '-'})</div>
                            <div className={`text-2xl font-bold font-mono ${dailyChange >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                {realtimeInfo?.gsz || (fetchError ? '加载失败' : '-')}
                            </div>
                            <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${dailyChange >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                {realtimeInfo ? (
                                    <>{dailyChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {dailyChange > 0 ? '+' : ''}{dailyChange}%</>
                                ) : (
                                    fetchError && <button onClick={loadData} className="text-blue-500 hover:text-blue-400 underline">重试</button>
                                )}
                            </div>
                        </div>

                        <div className="bg-slate-50 border-slate-200 dark:bg-slate-800/50 p-4 rounded-xl border dark:border-slate-700/50 transition-colors duration-300">
                            <div className="text-slate-500 dark:text-slate-400 text-xs mb-1">今日预估收益</div>
                            <div className={`text-2xl font-bold font-mono ${yesterdayProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                {yesterdayProfit > 0 ? '+' : ''}{yesterdayProfit.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                * 基于实时估值估算
                            </div>
                        </div>

                        <div className="bg-slate-50 border-slate-200 dark:bg-slate-800/50 p-4 rounded-xl border dark:border-slate-700/50 transition-colors duration-300">
                            <div className="text-slate-500 dark:text-slate-400 text-xs mb-1">持有收益</div>
                            <div className={`text-2xl font-bold font-mono ${holdingProfit >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                {holdingProfit > 0 ? '+' : ''}{holdingProfit.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                总盈亏金额
                            </div>
                        </div>

                        <div className="bg-slate-50 border-slate-200 dark:bg-slate-800/50 p-4 rounded-xl border dark:border-slate-700/50 transition-colors duration-300">
                            <div className="text-slate-500 dark:text-slate-400 text-xs mb-1">持有收益率</div>
                            <div className={`text-2xl font-bold font-mono ${holdingYield >= 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                                {holdingYield > 0 ? '+' : ''}{holdingYield.toFixed(2)}%
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                累计收益百分比
                            </div>
                        </div>
                    </div>

                    {/* Chart Section */}
                    <div className="bg-slate-50 border-slate-200 dark:bg-slate-800/50 p-4 rounded-xl border dark:border-slate-700/50 min-h-[300px] transition-colors duration-300">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                            <TrendingUp size={16} className="text-blue-500 dark:text-blue-400" />
                            近3月业绩走势
                        </h3>

                        {isLoading ? (
                            <div className="h-64 flex items-center justify-center text-slate-500 gap-2">
                                <Clock className="animate-spin" size={20} /> 加载数据中...
                            </div>
                        ) : history.length > 0 ? (
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={history}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                            minTickGap={30}
                                        />
                                        <YAxis
                                            domain={['auto', 'auto']}
                                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={40}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569', color: '#f8fafc', fontSize: '12px' }}
                                            itemStyle={{ color: '#fff' }}
                                            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={false}
                                            name={isStockAsset ? "收盘价" : "单位净值"}
                                            activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-64 flex items-center justify-center text-slate-500 italic">
                                <AlertCircle size={16} className="mr-2" />
                                暂无历史数据
                            </div>
                        )}
                        <div className="text-[10px] text-slate-500 text-center mt-2">
                            数据来源: 东方财富
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-center text-xs text-slate-500 transition-colors duration-300">
                    注：所有数据仅供参考，不构成投资建议。实时估值可能存在偏差。
                </div>
            </div>
        </div>
    );
};

export default FundDetailModal;
