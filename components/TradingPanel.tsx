import React, { useState, useEffect, useMemo } from 'react';
import { Fund, SavedAnalysisResult, FundTradingState, TradingOperation, PyramidLevel, RecommendationType } from '../types';
import { Target, TrendingUp, TrendingDown, Plus, Minus, Edit2, Trash2, X, Check, Clock, AlertCircle, Sparkles, RefreshCw, BarChart3, Calculator, Wallet } from 'lucide-react';
import { fetchFundInfo } from '../services/eastmoney';

interface TradingPanelProps {
    funds: Fund[];
    savedAnalysis: SavedAnalysisResult | null;
    tradingStates: Record<string, FundTradingState>;
    onUpdateTradingState: (fundCode: string, state: FundTradingState) => void;
    onUpdateFund: (fund: Fund) => void;
}

// 金字塔层级配置
const PYRAMID_LEVELS: { level: PyramidLevel; position: number; label: string; color: string }[] = [
    { level: 0, position: 0, label: 'L0 空仓', color: 'bg-slate-600' },
    { level: 1, position: 20, label: 'L1 底仓', color: 'bg-blue-500' },
    { level: 2, position: 40, label: 'L2 补仓', color: 'bg-emerald-500' },
    { level: 3, position: 70, label: 'L3 重仓', color: 'bg-amber-500' },
    { level: 4, position: 100, label: 'L4 满仓', color: 'bg-red-500' },
];

const COOLDOWN_DAYS = 14;

// 生成唯一ID
const generateId = () => `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 日期格式化
const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

// 计算冷却期剩余天数
const getCooldownDays = (lastOpDate: string | null): number => {
    if (!lastOpDate) return 0;
    const last = new Date(lastOpDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, COOLDOWN_DAYS - diffDays);
};

// ============================================
// 操作记录弹窗
// ============================================
interface OperationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (op: Omit<TradingOperation, 'id'>) => void;
    fundName: string;
    currentLevel: PyramidLevel;
    editingOp?: TradingOperation;
    suggestedAmount?: number; // 建议投入金额
}

const OperationModal: React.FC<OperationModalProps> = ({
    isOpen, onClose, onSave, fundName, currentLevel, editingOp, suggestedAmount
}) => {
    const [action, setAction] = useState<'BUY' | 'SELL'>(editingOp?.action === 'SELL' ? 'SELL' : 'BUY');
    const [amount, setAmount] = useState(editingOp?.amount?.toString() || '');
    const [shares, setShares] = useState(editingOp?.shares?.toString() || '1');
    const [date, setDate] = useState(editingOp?.date || new Date().toISOString().split('T')[0]);
    const [note, setNote] = useState(editingOp?.note || '');

    useEffect(() => {
        if (editingOp) {
            setAction(editingOp.action === 'SELL' ? 'SELL' : 'BUY');
            setAmount(editingOp.amount?.toString() || '');
            setShares(editingOp.shares?.toString() || '1');
            setDate(editingOp.date);
            setNote(editingOp.note || '');
        } else {
            setAction('BUY');
            // 如果有建议金额，自动填充 (默认1份=10%的建议金额)
            setAmount(suggestedAmount ? Math.floor(suggestedAmount * 0.1).toString() : '');
            setShares('1');
            setDate(new Date().toISOString().split('T')[0]);
            setNote('');
        }
    }, [editingOp, isOpen, suggestedAmount]);

    // 当份数改变时，自动计算金额
    const handleSharesChange = (newShares: string) => {
        setShares(newShares);
        if (suggestedAmount && !editingOp) {
            const numShares = parseInt(newShares) || 1;
            // 1份 = 10% * 建议金额
            setAmount(Math.floor(suggestedAmount * 0.1 * numShares).toString());
        }
    };

    if (!isOpen) return null;

    const handleSubmit = () => {
        const parsedShares = parseInt(shares) || 1;

        // 计算新的层级
        let newLevel: PyramidLevel = currentLevel;
        if (action === 'BUY') {
            const newPosition = Math.min(100, PYRAMID_LEVELS[currentLevel].position + parsedShares * 10);
            newLevel = PYRAMID_LEVELS.reduce((acc, l) => newPosition >= l.position ? l.level : acc, 0 as PyramidLevel);
        } else {
            const newPosition = Math.max(0, PYRAMID_LEVELS[currentLevel].position - parsedShares * 10);
            newLevel = PYRAMID_LEVELS.reduce((acc, l) => newPosition >= l.position ? l.level : acc, 0 as PyramidLevel);
        }

        onSave({
            date,
            action,
            amount: parseFloat(amount) || 0,
            shares: parsedShares,
            levelAfter: newLevel,
            note: note || undefined
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl border border-slate-600 p-6 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white">
                        {editingOp ? '编辑操作记录' : '记录操作'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="text-sm text-slate-400 mb-4">{fundName}</div>

                <div className="space-y-4">
                    {/* 操作类型 */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setAction('BUY')}
                            className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${action === 'BUY'
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                }`}
                        >
                            <Plus size={16} /> 买入
                        </button>
                        <button
                            onClick={() => setAction('SELL')}
                            className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${action === 'SELL'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                }`}
                        >
                            <Minus size={16} /> 卖出
                        </button>
                    </div>

                    {/* 日期 */}
                    <div>
                        <label className="block text-slate-400 text-xs mb-1">操作日期</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 px-3 text-white focus:border-emerald-500 outline-none"
                        />
                    </div>

                    {/* 金额 */}
                    <div>
                        <label className="block text-slate-400 text-xs mb-1">金额 (元)</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="2000"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 px-3 text-white focus:border-emerald-500 outline-none"
                        />
                    </div>

                    {/* 份数 */}
                    <div>
                        <label className="block text-slate-400 text-xs mb-1">份数 (1份=10%建议金额)</label>
                        <div className="flex gap-2">
                            {[1, 2, 3].map(n => (
                                <button
                                    key={n}
                                    onClick={() => handleSharesChange(n.toString())}
                                    className={`flex-1 py-2 rounded-lg font-mono text-sm transition-colors ${shares === n.toString()
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                        }`}
                                >
                                    {n}份{suggestedAmount ? ` ¥${Math.floor(suggestedAmount * 0.1 * n).toLocaleString()}` : ''}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 备注 */}
                    <div>
                        <label className="block text-slate-400 text-xs mb-1">备注 (可选)</label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="例如：跌破支撑位补仓"
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 px-3 text-white focus:border-emerald-500 outline-none"
                        />
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <Check size={16} />
                        {editingOp ? '保存修改' : '记录'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================
// 单个基金策略卡片
// ============================================
interface FundStrategyCardProps {
    fund: Fund;
    analysis?: { rating: RecommendationType; rationale: string };
    tradingState: FundTradingState;
    onUpdateState: (state: FundTradingState) => void;
    onUpdateFund: (fund: Fund) => void;
    allocation?: number; // 分配的金额
}

const FundStrategyCard: React.FC<FundStrategyCardProps> = ({ fund, analysis, tradingState, onUpdateState, onUpdateFund, allocation }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingOp, setEditingOp] = useState<TradingOperation | undefined>();
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);

    // 获取实时价格
    useEffect(() => {
        fetchFundInfo(fund.code).then(info => {
            if (info?.dwjz) {
                setCurrentPrice(parseFloat(info.dwjz));
            }
        }).catch(() => { });
    }, [fund.code]);

    const levelConfig = PYRAMID_LEVELS.find(l => l.level === tradingState.pyramidLevel) || PYRAMID_LEVELS[0];
    const cooldownDays = getCooldownDays(tradingState.lastOpDate);
    const avgCost = fund.shares > 0 ? fund.cost / fund.shares : 0;
    const roi = currentPrice && avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;

    const handleAddOperation = (op: Omit<TradingOperation, 'id'>) => {
        const newOp: TradingOperation = { ...op, id: generateId() };
        const newHistory = [...tradingState.operationHistory, newOp];

        onUpdateState({
            ...tradingState,
            pyramidLevel: op.levelAfter,
            lastOpDate: op.date,
            operationHistory: newHistory
        });

        // 同步更新持仓: BUY增加cost和shares, SELL减少
        const amount = op.amount || 0;
        if (op.action === 'BUY' && amount > 0) {
            // 买入: 增加成本和份额
            // 假设每份=当前净值购买的份额, 这里简化为金额直接加到cost
            const currentNav = currentPrice || (fund.shares > 0 ? fund.cost / fund.shares : 1);
            const newShares = amount / currentNav;
            onUpdateFund({
                ...fund,
                cost: fund.cost + amount,
                shares: fund.shares + newShares
            });
        } else if (op.action === 'SELL' && amount > 0) {
            // 卖出: 减少成本和份额 (按比例)
            const currentNav = currentPrice || (fund.shares > 0 ? fund.cost / fund.shares : 1);
            const sellShares = amount / currentNav;
            const newShares = Math.max(0, fund.shares - sellShares);
            const newCost = fund.shares > 0 ? (newShares / fund.shares) * fund.cost : 0;
            onUpdateFund({
                ...fund,
                cost: newCost,
                shares: newShares
            });
        }
    };

    const handleEditOperation = (op: Omit<TradingOperation, 'id'>) => {
        if (!editingOp) return;
        const newHistory = tradingState.operationHistory.map(o =>
            o.id === editingOp.id ? { ...op, id: editingOp.id } : o
        );

        // 重新计算当前层级 (基于最后一条记录)
        const lastOp = newHistory[newHistory.length - 1];

        onUpdateState({
            ...tradingState,
            pyramidLevel: lastOp?.levelAfter ?? 0,
            lastOpDate: lastOp?.date ?? null,
            operationHistory: newHistory
        });
        setEditingOp(undefined);
    };

    const handleDeleteOperation = (opId: string) => {
        const newHistory = tradingState.operationHistory.filter(o => o.id !== opId);
        const lastOp = newHistory[newHistory.length - 1];

        onUpdateState({
            ...tradingState,
            pyramidLevel: lastOp?.levelAfter ?? 0,
            lastOpDate: lastOp?.date ?? null,
            operationHistory: newHistory
        });
    };

    const openEditModal = (op: TradingOperation) => {
        setEditingOp(op);
        setIsModalOpen(true);
    };

    const openAddModal = () => {
        setEditingOp(undefined);
        setIsModalOpen(true);
    };

    return (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors">
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h4 className="text-white font-bold">{fund.name || `基金 ${fund.code}`}</h4>
                    <span className="text-slate-500 text-xs font-mono">{fund.code}</span>
                </div>
                {analysis && (
                    <span className={`px-2 py-1 rounded text-xs font-bold ${analysis.rating === RecommendationType.BUY ? 'bg-red-500/20 text-red-400' :
                        analysis.rating === RecommendationType.SELL ? 'bg-emerald-500/20 text-emerald-400' :
                            'bg-amber-500/20 text-amber-400'
                        }`}>
                        {analysis.rating === RecommendationType.BUY ? '建议补仓' :
                            analysis.rating === RecommendationType.SELL ? '建议减仓' : '持有'}
                    </span>
                )}
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-slate-400">仓位进度</span>
                    <span className={`text-xs font-bold ${levelConfig.color.replace('bg-', 'text-')}`}>
                        {levelConfig.label} ({levelConfig.position}%)
                    </span>
                </div>
                <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${levelConfig.color} transition-all duration-500`}
                        style={{ width: `${levelConfig.position}%` }}
                    />
                </div>
                {/* Level markers */}
                <div className="flex justify-between mt-1 text-[10px] text-slate-600">
                    <span>0%</span>
                    <span>20%</span>
                    <span>40%</span>
                    <span>70%</span>
                    <span>100%</span>
                </div>
            </div>

            {/* Allocation Display */}
            {allocation && allocation > 0 && (
                <div className="mb-3 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 rounded-lg p-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Wallet className="text-emerald-400" size={16} />
                        <span className="text-emerald-300 text-sm">建议投入</span>
                    </div>
                    <span className="text-white font-bold font-mono text-lg">¥{allocation.toLocaleString()}</span>
                </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                <div className="bg-slate-900 rounded p-2 text-center">
                    <div className="text-slate-500">ROI</div>
                    <div className={`font-bold font-mono ${roi >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                    </div>
                </div>
                <div className="bg-slate-900 rounded p-2 text-center">
                    <div className="text-slate-500">累计投入</div>
                    <div className="font-bold text-white font-mono">
                        ¥{tradingState.operationHistory.filter(o => o.action === 'BUY').reduce((s, o) => s + (o.amount || 0), 0).toLocaleString()}
                    </div>
                </div>
                <div className="bg-slate-900 rounded p-2 text-center">
                    <div className="text-slate-500">冷却期</div>
                    {cooldownDays > 0 ? (
                        <div className="font-bold text-amber-400 flex items-center justify-center gap-1">
                            <Clock size={12} /> {cooldownDays}天
                        </div>
                    ) : (
                        <div className="font-bold text-emerald-400">可操作</div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mb-3">
                <button
                    onClick={openAddModal}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-1 transition-colors"
                >
                    <Plus size={14} /> 记录买入
                </button>
                <button
                    onClick={() => { setEditingOp(undefined); setIsModalOpen(true); }}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-1 transition-colors"
                >
                    <Minus size={14} /> 记录卖出
                </button>
            </div>

            {/* Operation History */}
            {tradingState.operationHistory.length > 0 && (
                <div className="border-t border-slate-700 pt-3">
                    <div className="text-xs text-slate-400 mb-2">操作历史</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                        {tradingState.operationHistory.slice().reverse().map(op => (
                            <div key={op.id || Math.random()} className="flex items-center justify-between py-1 px-2 bg-slate-900/50 rounded text-xs group">
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${op.action === 'BUY' ? 'bg-red-400' : 'bg-emerald-400'}`} />
                                    <span className="text-slate-500">{formatDate(op.date)}</span>
                                    <span className={op.action === 'BUY' ? 'text-red-400' : 'text-emerald-400'}>
                                        {op.action === 'BUY' ? '买入' : '卖出'}
                                    </span>
                                    <span className="text-white">¥{(op.amount || 0).toLocaleString()}</span>
                                    <span className="text-slate-500">→ L{op.levelAfter ?? 0}</span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEditModal(op)}
                                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteOperation(op.id)}
                                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modal */}
            <OperationModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingOp(undefined); }}
                onSave={editingOp ? handleEditOperation : handleAddOperation}
                fundName={fund.name || fund.code}
                currentLevel={tradingState.pyramidLevel}
                editingOp={editingOp}
                suggestedAmount={allocation}
            />
        </div>
    );
};

// ============================================
// 主面板
// ============================================
const TradingPanel: React.FC<TradingPanelProps> = ({ funds, savedAnalysis, tradingStates, onUpdateTradingState, onUpdateFund }) => {
    // 仓位计算器状态
    const [investAmount, setInvestAmount] = useState<string>('10000');
    const [allocations, setAllocations] = useState<Record<string, number>>({});

    // 初始化每只基金的交易状态
    const getOrCreateState = (fundCode: string): FundTradingState => {
        if (tradingStates[fundCode]) {
            return tradingStates[fundCode];
        }
        return {
            fundCode,
            positionSize: 0,
            avgCost: 0,
            peakPrice: 0,
            lastOpDate: null,
            logicStatus: true,
            pyramidLevel: 0,
            operationHistory: [],
            lastBuyPrice: 0
        };
    };

    const fundsWithAnalysis = funds.map(fund => ({
        fund,
        analysis: savedAnalysis?.analyses.find(a => a.fundCode === fund.code),
        tradingState: getOrCreateState(fund.code)
    }));

    // 统计
    const totalInvested = Object.values(tradingStates).reduce<number>((sum, state) =>
        sum + (state as FundTradingState).operationHistory.filter(o => o.action === 'BUY').reduce((s, o) => s + (o.amount || 0), 0), 0
    );
    const avgLevel = funds.length > 0
        ? fundsWithAnalysis.reduce((sum, f) => sum + f.tradingState.pyramidLevel, 0) / funds.length
        : 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-600/20 to-red-600/20 border border-amber-500/30 rounded-xl p-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Target className="text-amber-400" />
                    金字塔策略追踪
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                    记录买入/卖出操作，追踪每只基金的仓位进度
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
                    <BarChart3 className="text-blue-400 mx-auto mb-2" size={24} />
                    <div className="text-2xl font-bold text-white">{funds.length}</div>
                    <div className="text-xs text-slate-500">持仓基金</div>
                </div>
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
                    <TrendingUp className="text-emerald-400 mx-auto mb-2" size={24} />
                    <div className="text-2xl font-bold text-emerald-400">¥{totalInvested.toLocaleString()}</div>
                    <div className="text-xs text-slate-500">累计投入</div>
                </div>
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
                    <Target className="text-amber-400 mx-auto mb-2" size={24} />
                    <div className="text-2xl font-bold text-amber-400">L{avgLevel.toFixed(1)}</div>
                    <div className="text-xs text-slate-500">平均仓位</div>
                </div>
            </div>

            {/* 金字塔智能仓位计算器 */}
            {savedAnalysis && (
                <div className="bg-slate-800 rounded-xl border border-emerald-500/30 p-4">
                    <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                        <Calculator className="text-emerald-400" size={18} />
                        智能仓位计算器
                    </h3>
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="block text-slate-500 text-xs mb-1">计划投入资金</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">¥</span>
                                <input
                                    type="number"
                                    value={investAmount}
                                    onChange={(e) => setInvestAmount(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 pl-8 pr-4 text-white focus:outline-none focus:border-emerald-500"
                                    placeholder="10000"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                const total = parseFloat(investAmount) || 0;
                                if (total <= 0 || !savedAnalysis) return;

                                // 计算权重: BUY=3, HOLD=1, SELL=0
                                const analyses = savedAnalysis.analyses || [];
                                let totalWeight = 0;
                                const weights: Record<string, number> = {};

                                analyses.forEach(a => {
                                    let w = 0;
                                    if (a.rating === 'BUY') w = 3;
                                    else if (a.rating === 'HOLD') w = 1;
                                    weights[a.fundCode] = w;
                                    totalWeight += w;
                                });

                                // 分配金额
                                const newAllocations: Record<string, number> = {};
                                analyses.forEach(a => {
                                    newAllocations[a.fundCode] = totalWeight > 0
                                        ? Math.floor((weights[a.fundCode] / totalWeight) * total)
                                        : 0;
                                });
                                setAllocations(newAllocations);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-5 rounded-lg transition-colors"
                        >
                            智能分配
                        </button>
                    </div>

                    {/* 分配结果摘要 */}
                    {Object.keys(allocations).length > 0 && (
                        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2">
                                <div className="text-red-400 text-xs mb-1">补仓资金</div>
                                <div className="text-white font-bold font-mono">
                                    ¥{Object.entries(allocations)
                                        .filter(([code]) => savedAnalysis?.analyses.find(a => a.fundCode === code)?.rating === 'BUY')
                                        .reduce((sum, [, amt]) => sum + (amt as number), 0).toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                                <div className="text-amber-400 text-xs mb-1">持有资金</div>
                                <div className="text-white font-bold font-mono">
                                    ¥{Object.entries(allocations)
                                        .filter(([code]) => savedAnalysis?.analyses.find(a => a.fundCode === code)?.rating === 'HOLD')
                                        .reduce((sum, [, amt]) => sum + (amt as number), 0).toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2">
                                <div className="text-emerald-400 text-xs mb-1">减仓资金</div>
                                <div className="text-white font-bold font-mono">
                                    ¥{Object.entries(allocations)
                                        .filter(([code]) => savedAnalysis?.analyses.find(a => a.fundCode === code)?.rating === 'SELL')
                                        .reduce((sum, [, amt]) => sum + (amt as number), 0).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* AI Analysis Tip */}
            {!savedAnalysis && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 flex items-start gap-3">
                    <Sparkles className="text-purple-400 shrink-0 mt-0.5" size={20} />
                    <div>
                        <div className="text-purple-300 font-medium">提示</div>
                        <div className="text-slate-400 text-sm">
                            前往 "AI分析" 页面运行分析，然后点击 "确认并保存到理财"，即可在此查看每只基金的 AI 建议
                        </div>
                    </div>
                </div>
            )}

            {/* Fund Cards Grouped by Recommendation */}
            {funds.length > 0 ? (
                <div className="space-y-6">
                    {/* 建议补仓 - BUY */}
                    {(() => {
                        const buyFunds = fundsWithAnalysis.filter(f => f.analysis?.rating === 'BUY');
                        if (buyFunds.length === 0) return null;
                        const groupAllocation = buyFunds.reduce((sum, f) => sum + (allocations[f.fund.code] || 0), 0);
                        return (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                    <h3 className="text-red-400 font-bold">建议补仓</h3>
                                    <span className="text-slate-500 text-sm">({buyFunds.length})</span>
                                    {groupAllocation > 0 && (
                                        <span className="ml-auto bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-mono">
                                            可用 ¥{groupAllocation.toLocaleString()}
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {buyFunds.map(({ fund, analysis, tradingState }) => (
                                        <FundStrategyCard
                                            key={fund.id}
                                            fund={fund}
                                            analysis={analysis ? { rating: analysis.rating, rationale: analysis.rationale } : undefined}
                                            tradingState={tradingState}
                                            onUpdateState={(state) => onUpdateTradingState(fund.code, state)}
                                            onUpdateFund={onUpdateFund}
                                            allocation={allocations[fund.code]}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* 持有观望 - HOLD */}
                    {(() => {
                        const holdFunds = fundsWithAnalysis.filter(f => f.analysis?.rating === 'HOLD');
                        if (holdFunds.length === 0) return null;
                        return (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                                    <h3 className="text-amber-400 font-bold">持有观望</h3>
                                    <span className="text-slate-500 text-sm">({holdFunds.length})</span>
                                    {(() => {
                                        const groupAllocation = holdFunds.reduce((sum, f) => sum + (allocations[f.fund.code] || 0), 0);
                                        return groupAllocation > 0 && (
                                            <span className="ml-auto bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs font-mono">
                                                可用 ¥{groupAllocation.toLocaleString()}
                                            </span>
                                        );
                                    })()}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {holdFunds.map(({ fund, analysis, tradingState }) => (
                                        <FundStrategyCard
                                            key={fund.id}
                                            fund={fund}
                                            analysis={analysis ? { rating: analysis.rating, rationale: analysis.rationale } : undefined}
                                            tradingState={tradingState}
                                            onUpdateState={(state) => onUpdateTradingState(fund.code, state)}
                                            onUpdateFund={onUpdateFund}
                                            allocation={allocations[fund.code]}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* 建议减仓 - SELL */}
                    {(() => {
                        const sellFunds = fundsWithAnalysis.filter(f => f.analysis?.rating === 'SELL');
                        if (sellFunds.length === 0) return null;
                        return (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
                                    <h3 className="text-emerald-400 font-bold">建议减仓</h3>
                                    <span className="text-slate-500 text-sm">({sellFunds.length})</span>
                                    <span className="ml-auto text-slate-500 text-xs">不分配资金</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {sellFunds.map(({ fund, analysis, tradingState }) => (
                                        <FundStrategyCard
                                            key={fund.id}
                                            fund={fund}
                                            analysis={analysis ? { rating: analysis.rating, rationale: analysis.rationale } : undefined}
                                            tradingState={tradingState}
                                            onUpdateState={(state) => onUpdateTradingState(fund.code, state)}
                                            onUpdateFund={onUpdateFund}
                                            allocation={0}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* 未分析 - No analysis */}
                    {(() => {
                        const noAnalysisFunds = fundsWithAnalysis.filter(f => !f.analysis);
                        if (noAnalysisFunds.length === 0) return null;
                        return (
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                                    <h3 className="text-slate-400 font-bold">待分析</h3>
                                    <span className="text-slate-500 text-sm">({noAnalysisFunds.length})</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {noAnalysisFunds.map(({ fund, analysis, tradingState }) => (
                                        <FundStrategyCard
                                            key={fund.id}
                                            fund={fund}
                                            analysis={undefined}
                                            tradingState={tradingState}
                                            onUpdateState={(state) => onUpdateTradingState(fund.code, state)}
                                            onUpdateFund={onUpdateFund}
                                            allocation={0}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            ) : (
                <div className="bg-slate-800 rounded-xl border border-dashed border-slate-600 p-12 text-center">
                    <AlertCircle className="text-slate-600 mx-auto mb-4" size={48} />
                    <h3 className="text-white font-bold mb-2">暂无持仓基金</h3>
                    <p className="text-slate-500 text-sm">
                        请先在左侧边栏添加基金
                    </p>
                </div>
            )}

            {/* Strategy Legend */}
            <div className="bg-slate-800/50 rounded-xl p-4 text-xs text-slate-500 space-y-1">
                <div className="font-bold text-slate-400 mb-2">策略说明</div>
                <div>🛡️ <strong>防守模块</strong>: 价格&lt;成本时，L1底仓20% → L2补仓40% → L3重仓70% → L4满仓100%</div>
                <div>⚔️ <strong>进攻模块</strong>: 价格&gt;成本时，ROI 15%卖20% → 30%卖30% → 50%卖20%</div>
                <div>⏳ <strong>冷却期</strong>: 两次补仓间隔 ≥ 14天，防止追涨杀跌</div>
            </div>
        </div>
    );
};

export default TradingPanel;
