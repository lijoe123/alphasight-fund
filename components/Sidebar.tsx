import React, { useState, useEffect } from 'react';
import { Plus, Trash2, PieChart, Upload, Search, Loader2, CheckCircle2, Edit2, X, Calculator, Save, AlertTriangle } from 'lucide-react';
import { Fund } from '../types';
// import { identifyFund } from '../services/gemini'; 
import { fetchFundInfo, fetchStockInfo } from '../services/eastmoney';

interface SidebarProps {
    funds: Fund[];
    onAddFund: (fund: Fund) => void;
    onUpdateFund: (fund: Fund) => void;
    onRemoveFund: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ funds, onAddFund, onUpdateFund, onRemoveFund }) => {
    // Form State
    const [code, setCode] = useState('');
    const [cost, setCost] = useState('');
    const [shares, setShares] = useState('');
    const [purchaseDate, setPurchaseDate] = useState('');

    // Identification State
    const [identifiedName, setIdentifiedName] = useState<string | null>(null);
    const [identifiedType, setIdentifiedType] = useState<'FUND' | 'STOCK'>('FUND');
    const [isIdentifying, setIsIdentifying] = useState(false);

    // Edit Mode State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTab, setEditTab] = useState<'DIRECT' | 'TRANSACTION'>('DIRECT');

    // Delete Confirmation State
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Transaction State (for calculating new average)
    const [transPrice, setTransPrice] = useState('');
    const [transShares, setTransShares] = useState('');

    // Clear delete confirmation after 3 seconds if not clicked
    useEffect(() => {
        if (deleteConfirmId) {
            const timer = setTimeout(() => setDeleteConfirmId(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [deleteConfirmId]);

    // Reset form when switching modes
    const resetForm = () => {
        setCode('');
        setCost('');
        setShares('');
        setIdentifiedName(null);
        setIdentifiedType('FUND');
        setEditingId(null);
        setPurchaseDate('');
        setEditTab('DIRECT');
        setTransPrice('');
        setTransShares('');
        setDeleteConfirmId(null);
    };

    const startEditing = (fund: Fund) => {
        setEditingId(fund.id);
        setCode(fund.code);
        setCost(fund.cost.toString());
        setShares(fund.shares.toString());
        setPurchaseDate(fund.purchaseDate || '');
        setIdentifiedName(fund.name || null);
        setIdentifiedType(fund.type || 'FUND');
        setEditTab('DIRECT');
        setTransPrice('');
        setTransShares('');
        setDeleteConfirmId(null);
    };

    const handleCodeBlur = async () => {
        if (!editingId && code.length >= 6) {
            setIsIdentifying(true);
            try {
                let info = null;
                let type: 'FUND' | 'STOCK' = 'FUND';

                // Codes starting with 6/4/8 are definitely stocks
                const definitelyStock = code.length === 6 &&
                    (code.startsWith('6') || code.startsWith('4') || code.startsWith('8'));

                if (definitelyStock) {
                    // Try Stock first for definite stock codes
                    info = await fetchStockInfo(code);
                    if (info && info.name) {
                        type = 'STOCK';
                    } else {
                        // Fallback to fund (unlikely but safe)
                        info = await fetchFundInfo(code);
                    }
                } else {
                    // Try Fund first for other codes
                    info = await fetchFundInfo(code);
                    if (!info || !info.name) {
                        // Try Stock as fallback
                        info = await fetchStockInfo(code);
                        if (info && info.name) {
                            type = 'STOCK';
                        }
                    }
                }

                if (info && info.name) {
                    setIdentifiedName(info.name);
                    setIdentifiedType(type);
                } else {
                    // Even if API fails, set type based on code pattern
                    setIdentifiedName(null);
                    setIdentifiedType(definitelyStock ? 'STOCK' : 'FUND');
                }
            } catch (error) {
                console.error("Failed to identify fund/stock", error);
                setIdentifiedName(null);
            } finally {
                setIsIdentifying(false);
            }
        } else {
            if (!editingId) setIdentifiedName(null);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingId) {
            // UPDATE EXISTING

            // Validate Transaction Mode Inputs
            if (editTab === 'TRANSACTION') {
                if (!transPrice || !transShares) {
                    alert("请输入有效的交易单价和份额");
                    return;
                }
                // Handle commas in input
                const sanitizeNumber = (str: string) => parseFloat(str.replace(/,/g, ''));

                const newPrice = sanitizeNumber(transPrice);
                const newShareCount = sanitizeNumber(transShares);

                if (isNaN(newPrice) || isNaN(newShareCount)) {
                    alert("请输入有效的数字");
                    return;
                }

                const currentCost = sanitizeNumber(cost);
                const currentShares = sanitizeNumber(shares);

                const totalValue = (currentCost * currentShares) + (newPrice * newShareCount);
                const finalSharesRaw = currentShares + newShareCount;

                if (finalSharesRaw <= 0) {
                    alert("交易后持有份额必须大于0");
                    return;
                }

                const finalCostRaw = totalValue / finalSharesRaw;

                onUpdateFund({
                    id: editingId,
                    code,
                    cost: parseFloat(finalCostRaw.toFixed(4)),
                    shares: parseFloat(finalSharesRaw.toFixed(2)),
                    purchaseDate: purchaseDate || undefined,
                    name: identifiedName || `基金 ${code}`,
                    type: identifiedType
                });
                resetForm();
                return;
            }

            // DIRECT EDIT FALLBACK
            const sanitizeNumber = (str: string) => parseFloat(str.replace(/,/g, ''));
            let finalCost = sanitizeNumber(cost);
            let finalShares = sanitizeNumber(shares);

            if (isNaN(finalCost) || isNaN(finalShares)) {
                alert("请输入有效的持仓成本和份额");
                return;
            }

            onUpdateFund({
                id: editingId,
                code,
                cost: parseFloat(finalCost.toFixed(4)),
                shares: parseFloat(finalShares.toFixed(2)),
                purchaseDate: purchaseDate || undefined,
                name: identifiedName || `基金 ${code}`,
                type: identifiedType
            });
            resetForm();
        } else {
            // ADD NEW
            if (!code || !cost || !shares) return;
            onAddFund({
                id: Date.now().toString(),
                code,
                cost: parseFloat(cost),
                shares: parseFloat(shares),
                purchaseDate: purchaseDate || undefined,
                name: identifiedName || `基金 ${code}`,
                type: identifiedType
            });
            resetForm();
        }
    };

    // Import Loading State
    const [isImporting, setIsImporting] = useState(false);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            if (!text) {
                setIsImporting(false);
                return;
            }

            const lines = text.split(/\r\n|\n/);
            let successCount = 0;

            try {
                for (let index = 0; index < lines.length; index++) {
                    const line = lines[index];
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    // Skip header
                    if (index === 0 && (trimmedLine.toLowerCase().includes('code') || trimmedLine.includes('代码'))) continue;

                    const parts = trimmedLine.split(/,|，/).map(item => item.trim().replace(/^"|"$/g, ''));

                    if (parts.length >= 3) {
                        const rawCode = parts[0];
                        const rawCost = parseFloat(parts[1]);
                        const rawShares = parseFloat(parts[2]);
                        // Attempt to use 4th column if available, else null
                        let rawName = parts[3] || null;

                        if (rawCode && !isNaN(rawCost) && !isNaN(rawShares)) {
                            // If name is missing, try to identify it
                            let type: 'FUND' | 'STOCK' = 'FUND';
                            if (!rawName) {
                                try {
                                    let emData = await fetchFundInfo(rawCode);
                                    if (emData && emData.name) {
                                        rawName = emData.name;
                                    } else {
                                        // Try Stock
                                        emData = await fetchStockInfo(rawCode);
                                        if (emData && emData.name) {
                                            rawName = emData.name;
                                            type = 'STOCK';
                                        } else {
                                            rawName = `基金 ${rawCode}`;
                                        }
                                    }
                                } catch (err) {
                                    console.warn(`Failed to identify ${rawCode}`, err);
                                    rawName = `基金 ${rawCode}`;
                                }
                            }

                            onAddFund({
                                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                code: rawCode,
                                cost: rawCost,
                                shares: rawShares,
                                purchaseDate: undefined,
                                name: rawName || `导入基金 ${rawCode}`,
                                type
                            });
                            successCount++;
                        }
                    }
                }

                if (successCount > 0) alert(`成功导入 ${successCount} 支基金`);
                else alert('导入失败：未找到有效数据。');

            } catch (error) {
                console.error("Import error:", error);
                alert("导入过程中发生错误");
            } finally {
                setIsImporting(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    // Calculate preview for transaction mode
    const sanitizeNumber = (str: string) => parseFloat(str.replace(/,/g, ''));

    const previewNewAvg = () => {
        if (editTab === 'TRANSACTION' && cost && shares && transPrice && transShares) {
            const c = sanitizeNumber(cost);
            const s = sanitizeNumber(shares);
            const tp = sanitizeNumber(transPrice);
            const ts = sanitizeNumber(transShares);
            if (isNaN(c) || isNaN(s) || isNaN(tp) || isNaN(ts)) return null;

            const totalVal = (c * s) + (tp * ts);
            const totalShares = s + ts;
            return totalShares > 0 ? (totalVal / totalShares).toFixed(4) : 0;
        }
        return null;
    };

    const previewNewShares = () => {
        if (editTab === 'TRANSACTION' && shares && transShares) {
            const s = sanitizeNumber(shares);
            const ts = sanitizeNumber(transShares);
            return isNaN(s) || isNaN(ts) ? null : (s + ts).toFixed(2);
        }
        return null;
    };

    return (
        <div className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 overflow-hidden z-20 shadow-xl dark:bg-slate-800 dark:border-slate-700 dark:shadow-none transition-colors duration-300">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 transition-colors duration-300">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 transition-colors duration-300">
                    <PieChart className="text-emerald-500 dark:text-emerald-400" />
                    AlphaSight
                </h1>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 transition-colors duration-300">AI 驱动的基金智能投顾</p>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
                <div className="mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200 dark:bg-slate-900/50 dark:border-slate-700/50 transition-colors duration-300">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider transition-colors duration-300">
                            {editingId ? '编辑持仓' : '添加资产'}
                        </h2>
                        {editingId && (
                            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white transition-colors" type="button">
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {editingId && (
                        <div className="flex mb-4 bg-slate-800 rounded p-1 text-xs">
                            <button
                                type="button"
                                onClick={() => setEditTab('DIRECT')}
                                className={`flex-1 py-1 rounded transition-colors ${editTab === 'DIRECT' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                直接修改
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditTab('TRANSACTION')}
                                className={`flex-1 py-1 rounded transition-colors ${editTab === 'TRANSACTION' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                新增交易
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="space-y-1">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="基金代码 (例如 000001)"
                                    className={`w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-white ${editingId ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    value={code}
                                    onChange={(e) => {
                                        setCode(e.target.value);
                                        if (e.target.value.length < 6 && !editingId) setIdentifiedName(null);
                                    }}
                                    onBlur={handleCodeBlur}
                                    readOnly={!!editingId}
                                />
                                {!editingId && (
                                    <div className="absolute right-3 top-2.5 text-slate-500">
                                        {isIdentifying ? <Loader2 size={16} className="animate-spin text-emerald-500" /> : <Search size={16} />}
                                    </div>
                                )}
                            </div>
                            {(identifiedName || editingId) && !isIdentifying && (
                                <div className="text-xs text-emerald-400 flex items-center gap-1 px-1 fade-in font-medium">
                                    <CheckCircle2 size={12} />
                                    {identifiedName}
                                </div>
                            )}
                        </div>

                        {editTab === 'DIRECT' ? (
                            // DIRECT EDIT FORM
                            <div className="space-y-3">
                                <div className="flex gap-2">
                                    <div className="w-1/2">
                                        <label className="text-[10px] text-slate-500 dark:text-slate-500 ml-1 mb-0.5 block">持仓成本</label>
                                        <input
                                            type="number"
                                            placeholder="持仓成本"
                                            step="0.0001"
                                            className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                            value={cost}
                                            onChange={(e) => setCost(e.target.value)}
                                        />
                                    </div>
                                    <div className="w-1/2">
                                        <label className="text-[10px] text-slate-500 dark:text-slate-500 ml-1 mb-0.5 block">持有份额</label>
                                        <input
                                            type="number"
                                            placeholder="持有份额"
                                            className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                            value={shares}
                                            onChange={(e) => setShares(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-500 dark:text-slate-500 ml-1 mb-0.5 block">买入日期 (选填)</label>
                                    <input
                                        type="date"
                                        className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                        value={purchaseDate}
                                        onChange={(e) => setPurchaseDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        ) : (
                            // TRANSACTION FORM
                            <div className="space-y-3 bg-slate-50 p-3 rounded border border-slate-200 dark:bg-slate-800 dark:border-slate-700 transition-colors duration-300">
                                <div className="flex gap-2">
                                    <div className="w-1/2">
                                        <label className="text-[10px] text-blue-500 dark:text-blue-400 ml-1 mb-0.5 block">交易单价</label>
                                        <input
                                            type="number"
                                            placeholder="买入净值"
                                            step="0.0001"
                                            className="w-full bg-white border border-blue-200 rounded px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 transition-colors dark:bg-slate-900 dark:border-blue-500/50 dark:text-white"
                                            value={transPrice}
                                            onChange={(e) => setTransPrice(e.target.value)}
                                        />
                                    </div>
                                    <div className="w-1/2">
                                        <label className="text-[10px] text-blue-500 dark:text-blue-400 ml-1 mb-0.5 block">买入份额</label>
                                        <input
                                            type="number"
                                            placeholder="买入份额"
                                            className="w-full bg-white border border-blue-200 rounded px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 transition-colors dark:bg-slate-900 dark:border-blue-500/50 dark:text-white"
                                            value={transShares}
                                            onChange={(e) => setTransShares(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Calculation Preview */}
                                {(transPrice && transShares) && (
                                    <div className="text-[10px] text-slate-500 bg-white border border-slate-200 p-2 rounded flex flex-col gap-1 dark:bg-slate-900 dark:border-0 dark:text-slate-400">
                                        <div className="flex justify-between">
                                            <span>交易后成本:</span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-mono">{previewNewAvg()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>交易后份额:</span>
                                            <span className="text-slate-900 dark:text-white font-mono">{previewNewShares()}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            className={`w-full font-medium py-2 rounded text-sm transition-colors flex items-center justify-center gap-2 ${editingId ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                        >
                            {editingId ? <><Save size={16} /> 保存修改</> : <><Plus size={16} /> 添加持仓</>}
                        </button>
                    </form>

                    {!editingId && (
                        <div className="mt-3">
                            <label className="cursor-pointer w-full border border-dashed border-slate-600 rounded flex items-center justify-center py-2 text-slate-400 hover:text-white hover:border-slate-500 transition-all text-xs gap-2 group">
                                <Upload size={14} className="group-hover:text-emerald-400 transition-colors" />
                                <span>{isImporting ? '正在分析并导入...' : '一键导入 CSV'}</span>
                                <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} disabled={isImporting} />
                            </label>
                        </div>
                    )}
                </div>

                <div>
                    <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">投资组合 ({funds.length})</h2>
                    {funds.length === 0 ? (
                        <p className="text-slate-500 text-sm italic">暂无基金，请添加。</p>
                    ) : (
                        <div className="space-y-2">
                            {funds.map((fund) => {
                                const isDeleting = deleteConfirmId === fund.id;

                                return (
                                    <div key={fund.id} className={`p-3 rounded border flex justify-between items-center group transition-all ${editingId === fund.id ? 'border-blue-500 ring-1 ring-blue-500/50 bg-blue-50 dark:bg-slate-900/50' : isDeleting ? 'border-red-500/50 bg-red-50 dark:bg-red-900/10' : 'bg-white border-slate-200 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:hover:border-slate-600'}`}>
                                        <div className="overflow-hidden">
                                            <div className="font-mono text-emerald-600 dark:text-emerald-400 text-xs font-bold mb-0.5 transition-colors">{fund.code}</div>
                                            <div className="text-slate-900 dark:text-white text-sm font-medium truncate w-32 transition-colors">{fund.name}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 transition-colors">
                                                {(fund.cost * fund.shares).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                            {!isDeleting && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        startEditing(fund);
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                                                    title="编辑/加仓"
                                                >
                                                    <Edit2 size={14} className="pointer-events-none" />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    if (isDeleting) {
                                                        onRemoveFund(fund.id);
                                                        if (editingId === fund.id) resetForm();
                                                        setDeleteConfirmId(null);
                                                    } else {
                                                        setDeleteConfirmId(fund.id);
                                                    }
                                                }}
                                                className={`p-1.5 rounded transition-all flex items-center gap-1 ${isDeleting ? 'bg-red-600 text-white hover:bg-red-700 w-auto px-2' : 'text-slate-400 hover:text-red-400 hover:bg-slate-800'}`}
                                                title={isDeleting ? "确认删除" : "删除"}
                                            >
                                                {isDeleting ? (
                                                    <span className="text-[10px] font-bold whitespace-nowrap">确认?</span>
                                                ) : (
                                                    <Trash2 size={14} className="pointer-events-none" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 transition-colors duration-300">
                <div className="text-xs text-slate-500 dark:text-slate-500">
                    数据由 AI 模拟与搜索提供。不构成投资建议。
                </div>
            </div>
        </div>
    );
};

export default Sidebar;