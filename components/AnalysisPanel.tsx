import React, { useState } from 'react';
import { Fund, MultiModelAnalysisResult, PortfolioAnalysisResult, RecommendationType, FundAnalysis, SavedAnalysisResult, PerFundAnalysisResult } from '../types';
import { analyzeSingleFundMultiModel } from '../services/gemini';
import { TrendingUp, TrendingDown, Minus, Globe, Bot, Sparkles, Calculator, Save, CheckCircle, Loader2 } from 'lucide-react';

interface AnalysisPanelProps {
  data: MultiModelAnalysisResult | null;
  isLoading: boolean;
  onRunAnalysis: () => void;
  onSaveAnalysis?: (result: SavedAnalysisResult) => void;
  funds: Fund[];
}

const getRatingLabel = (rating: RecommendationType) => {
  switch (rating) {
    case RecommendationType.BUY: return '建议补仓';
    case RecommendationType.SELL: return '建议卖出';
    case RecommendationType.HOLD: return '继续持有';
    default: return rating;
  }
};

const getRatingConfig = (rating: RecommendationType) => {
  switch (rating) {
    case RecommendationType.BUY:
      return { badge: 'bg-red-500/20 text-red-400 border-red-500/30', icon: <TrendingUp size={14} /> };
    case RecommendationType.SELL:
      return { badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: <TrendingDown size={14} /> };
    default:
      return { badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: <Minus size={14} /> };
  }
};

/**
 * 金字塔策略常量
 */
const PYRAMID_CONFIG = {
  BUY: { baseWeight: 3, strategyLabel: '积极补仓', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  HOLD: { baseWeight: 1, strategyLabel: '维持持有', color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  SELL: { baseWeight: 0, strategyLabel: '建议减仓', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' }
};

interface AllocationCalculatorProps {
  analyses: FundAnalysis[];
}

const AllocationCalculator: React.FC<AllocationCalculatorProps> = ({ analyses }) => {
  const [amount, setAmount] = useState<string>('10000');
  const [result, setResult] = useState<{
    code: string;
    name: string;
    amount: number;
    percentage: string;
    rating: RecommendationType;
    strategy: string;
    pyramidLevel: string;
  }[] | null>(null);
  const [reasoning, setReasoning] = useState<string | null>(null);

  const handleCalculate = () => {
    const totalAmount = parseFloat(amount);
    if (isNaN(totalAmount) || totalAmount <= 0) return;

    const buyCount = analyses.filter(a => a.rating === RecommendationType.BUY).length;
    const holdCount = analyses.filter(a => a.rating === RecommendationType.HOLD).length;
    const sellCount = analyses.filter(a => a.rating === RecommendationType.SELL).length;

    let totalScore = 0;
    const weights = analyses.map(a => {
      const config = PYRAMID_CONFIG[a.rating];
      totalScore += config.baseWeight;
      return { code: a.fundCode, weight: config.baseWeight, rating: a.rating };
    });

    if (totalScore === 0) {
      setResult([]);
      setReasoning(sellCount > 0
        ? "🛡️ 市场信号偏空，所有持仓均建议减仓。建议暂不追加投资，优先落袋为安。"
        : "暂无有效持仓进行分配。");
      return;
    }

    const allocation = analyses.map(a => {
      const w = weights.find(x => x.code === a.fundCode);
      const weight = w ? w.weight : 0;
      const config = PYRAMID_CONFIG[a.rating];
      const allocAmount = totalScore > 0 ? (weight / totalScore) * totalAmount : 0;

      let pyramidLevel = '';
      if (a.rating === RecommendationType.BUY) {
        pyramidLevel = weight >= 3 ? '🔺 重点加仓' : '🔸 适度加仓';
      } else if (a.rating === RecommendationType.HOLD) {
        pyramidLevel = '⏸️ 维持现状';
      } else {
        pyramidLevel = '🔻 逐步减仓';
      }

      return {
        code: a.fundCode,
        name: a.fundName,
        amount: Math.floor(allocAmount),
        percentage: totalScore > 0 ? `${((weight / totalScore) * 100).toFixed(1)}%` : '0%',
        rating: a.rating,
        strategy: config.strategyLabel,
        pyramidLevel
      };
    });

    allocation.sort((a, b) => b.amount - a.amount);

    let reasonText = `📊 **金字塔智能分配**: 基于 AI 对 ${analyses.length} 只基金的深度分析，采用动态权重配置。`;
    if (buyCount > 0) {
      reasonText += `\n\n🔥 **积极信号** (${buyCount}只): 赋予 3倍 权重，集中资金于高胜率标的；`;
    }
    if (holdCount > 0) {
      reasonText += `\n⚖️ **稳健信号** (${holdCount}只): 标准权重，保持合理配置；`;
    }
    if (sellCount > 0) {
      reasonText += `\n🛡️ **防守信号** (${sellCount}只): 零权重，建议逐步减仓或观望。`;
    }

    setReasoning(reasonText);
    setResult(allocation);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-emerald-100 dark:border-emerald-500/30 p-6 shadow-sm dark:shadow-lg dark:shadow-emerald-900/10 transition-colors duration-300">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <Calculator className="text-emerald-500 dark:text-emerald-400" size={20} />
        金字塔智能仓位计算器
        <span className="text-xs font-normal text-slate-500 ml-2">(AI分析 + 策略融合)</span>
      </h3>

      <div className="flex gap-4 mb-6 items-end">
        <div className="flex-1">
          <label className="block text-slate-500 dark:text-slate-400 text-xs mb-2">计划投入总资金 (元)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">¥</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg py-2 pl-8 pr-4 text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              placeholder="请输入金额"
            />
          </div>
        </div>
        <button
          onClick={handleCalculate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-lg shadow-emerald-900/20 h-[42px]"
        >
          智能分配
        </button>
      </div>

      {result && (
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 transition-colors duration-300">
          {reasoning && (
            <div className="bg-slate-50 p-4 text-sm text-slate-600 border-b border-slate-200 dark:bg-slate-900/80 dark:text-slate-300 dark:border-slate-700 leading-relaxed transition-colors duration-300">
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="text-amber-500 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div className="whitespace-pre-wrap">{reasoning}</div>
              </div>
            </div>
          )}
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400 uppercase font-mono text-xs transition-colors duration-300">
              <tr>
                <th className="px-4 py-3">基金</th>
                <th className="px-4 py-3 text-center">策略信号</th>
                <th className="px-4 py-3 text-right">分配权重</th>
                <th className="px-4 py-3 text-right">建议金额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50 transition-colors duration-300">
              {result.map((row) => {
                const config = PYRAMID_CONFIG[row.rating];
                return (
                  <tr key={row.code} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-slate-900 dark:text-white font-medium">{row.name}</div>
                      <div className="text-slate-500 text-xs font-mono">{row.code}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${config.bgColor} ${config.color}`}>
                        {row.pyramidLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 font-mono">
                      {row.percentage}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold font-mono ${row.amount > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        ¥{row.amount.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500 border-t border-slate-200 dark:bg-slate-900/50 dark:border-slate-700 transition-colors duration-300">
            💡 策略说明：BUY信号×3倍权重 | HOLD信号×1倍权重 | SELL信号=0权重（建议减仓）
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Per-fund analysis card with model tabs
 */
const FundAnalysisCard: React.FC<{
  fund: Fund;
  synthesisAnalysis?: FundAnalysis;
  perModelAnalysis: Record<string, FundAnalysis>;
  onAnalyzeSingle: (fund: Fund) => void;
  isAnalyzing: boolean;
}> = ({ fund, synthesisAnalysis, perModelAnalysis, onAnalyzeSingle, isAnalyzing }) => {
  const [activeModelTab, setActiveModelTab] = useState<string>('synthesis');
  const modelNames = Object.keys(perModelAnalysis);
  const hasAnalysis = !!synthesisAnalysis || modelNames.length > 0;

  const currentAnalysis = activeModelTab === 'synthesis'
    ? synthesisAnalysis
    : perModelAnalysis[activeModelTab];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm dark:shadow-none transition-all overflow-hidden duration-300">
      {/* Fund Header */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-700/50 transition-colors duration-300">
        <div className="flex items-center gap-3">
          <div>
            <h4 className="text-slate-900 dark:text-white font-bold text-base transition-colors duration-300">{fund.name || fund.code}</h4>
            <span className="text-slate-500 text-xs font-mono">{fund.code}</span>
          </div>
          {synthesisAnalysis && (() => {
            const cfg = getRatingConfig(synthesisAnalysis.rating);
            return (
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.badge} flex items-center gap-1`}>
                {cfg.icon}
                {getRatingLabel(synthesisAnalysis.rating)}
              </span>
            );
          })()}
        </div>
        <button
          onClick={() => onAnalyzeSingle(fund)}
          disabled={isAnalyzing}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isAnalyzing
            ? 'bg-amber-500/10 text-amber-400 cursor-wait'
            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
            }`}
        >
          {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {isAnalyzing ? '分析中...' : '单独分析'}
        </button>
      </div>

      {/* Analysis Content */}
      {hasAnalysis ? (
        <div className="px-5 py-4">
          {/* Model Tabs */}
          {modelNames.length > 0 && (
            <div className="flex gap-1 mb-4 flex-wrap">
              <button
                onClick={() => setActiveModelTab('synthesis')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${activeModelTab === 'synthesis'
                  ? 'bg-purple-100 text-purple-700 shadow-sm ring-1 ring-purple-500/20 dark:bg-purple-600 dark:text-white dark:shadow-lg dark:shadow-purple-900/30'
                  : 'text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:bg-slate-900 dark:hover:bg-slate-700'
                  }`}
              >
                <Sparkles size={10} /> 综合
              </button>
              {modelNames.map(name => (
                <button
                  key={name}
                  onClick={() => setActiveModelTab(name)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${activeModelTab === name
                    ? 'bg-slate-100 text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-white dark:shadow'
                    : 'text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:bg-slate-900 dark:hover:bg-slate-700'
                    }`}
                >
                  <Bot size={10} /> {name}
                </button>
              ))}
            </div>
          )}

          {/* Rating + Reason */}
          {currentAnalysis ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {(() => {
                  const cfg = getRatingConfig(currentAnalysis.rating);
                  return (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.badge} flex items-center gap-1`}>
                      {cfg.icon}
                      {getRatingLabel(currentAnalysis.rating)}
                    </span>
                  );
                })()}
                {currentAnalysis.currentNavEstimate && (
                  <span className="text-xs text-slate-500 font-mono">
                    预估净值: {currentAnalysis.currentNavEstimate}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                {currentAnalysis.reason}
              </p>
            </div>
          ) : (
            <p className="text-slate-500 text-sm italic">该模型暂无此基金的分析结果。</p>
          )}
        </div>
      ) : (
        <div className="px-5 py-6 text-center">
          <p className="text-slate-500 text-sm">
            暂无分析结果，点击「单独分析」或运行全局分析。
          </p>
        </div>
      )}
    </div>
  );
};


const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ data, isLoading, onRunAnalysis, onSaveAnalysis, funds }) => {
  const [isSaved, setIsSaved] = useState(false);
  // Per-fund single analysis states
  const [perFundResults, setPerFundResults] = useState<Record<string, PerFundAnalysisResult>>({});
  const [analyzingCodes, setAnalyzingCodes] = useState<Set<string>>(new Set());

  // Build merged per-fund data: combine global analysis results with per-fund single results
  const getPerFundData = (fundCode: string): { synthesis?: FundAnalysis; perModel: Record<string, FundAnalysis> } => {
    // Priority: single-fund result overrides global
    const singleResult = perFundResults[fundCode];
    if (singleResult) {
      return { synthesis: singleResult.synthesis, perModel: singleResult.perModel };
    }

    // Fall back to global analysis
    if (data) {
      const synthFa = data.synthesis?.fundAnalyses?.find(a => a.fundCode === fundCode);
      const perModel: Record<string, FundAnalysis> = {};
      if (data.individualResults) {
        Object.entries(data.individualResults).forEach(([modelName, result]) => {
          const typedResult = result as PortfolioAnalysisResult;
          const fa = typedResult.fundAnalyses?.find(a => a.fundCode === fundCode);
          if (fa) perModel[modelName] = fa;
        });
      }
      if (synthFa || Object.keys(perModel).length > 0) {
        return { synthesis: synthFa, perModel };
      }
    }

    return { perModel: {} };
  };

  const handleAnalyzeSingle = async (fund: Fund) => {
    setAnalyzingCodes(prev => new Set(prev).add(fund.code));
    try {
      const result = await analyzeSingleFundMultiModel(fund);
      setPerFundResults(prev => ({ ...prev, [fund.code]: result }));
    } catch (e: any) {
      console.error(`Single fund analysis failed for ${fund.code}:`, e);
    } finally {
      setAnalyzingCodes(prev => {
        const next = new Set(prev);
        next.delete(fund.code);
        return next;
      });
    }
  };

  // Collect all synthesis analyses for the allocation calculator
  const allSynthesisAnalyses: FundAnalysis[] = funds.map(f => {
    const d = getPerFundData(f.code);
    return d.synthesis;
  }).filter(Boolean) as FundAnalysis[];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4 animate-pulse">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 font-mono">AI 正在并行分析全球市场...</p>
        <div className="flex gap-2">
          <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-500">Gemini</span>
          <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-500">Processing...</span>
        </div>
      </div>
    );
  }

  const hasAnyAnalysis = !!data || Object.keys(perFundResults).length > 0;

  return (
    <div>
      {/* Header Actions */}
      <div className="flex justify-between items-center mb-6">
        <div>
          {data?.consensusSummary && (
            <div className="bg-purple-50 border border-purple-200 text-purple-900 dark:bg-purple-900/30 dark:border-purple-500/40 dark:text-purple-300 rounded-lg p-3 mb-4 max-w-2xl transition-colors duration-300">
              <h4 className="text-purple-800 dark:text-purple-300 font-bold mb-1 flex items-center gap-2 text-sm">
                <Sparkles size={14} /> 多模型共识
              </h4>
              <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{data.consensusSummary}</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 shrink-0">
          {onSaveAnalysis && hasAnyAnalysis && (
            <button
              onClick={() => {
                const savedResult: SavedAnalysisResult = {
                  analyses: allSynthesisAnalyses.map(f => ({
                    fundCode: f.fundCode,
                    fundName: f.fundName,
                    rating: f.rating,
                    rationale: f.reason || '',
                    savedAt: new Date().toISOString()
                  })),
                  savedAt: new Date().toISOString(),
                  consensusSummary: data?.consensusSummary || ''
                };
                onSaveAnalysis(savedResult);
                setIsSaved(true);
                setTimeout(() => setIsSaved(false), 3000);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
            >
              {isSaved ? <CheckCircle size={16} /> : <Save size={16} />}
              {isSaved ? '已保存' : '保存到理财'}
            </button>
          )}
          <button
            onClick={onRunAnalysis}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white text-sm font-bold flex items-center gap-2 transition-colors shadow-lg shadow-emerald-900/30"
          >
            <Sparkles size={16} />
            {hasAnyAnalysis ? '重新全局分析' : '运行全局分析'}
          </button>
        </div>
      </div>

      {/* Per-fund Analysis Cards */}
      {funds.length > 0 ? (
        <div className="space-y-4 mb-6">
          {funds.map(fund => {
            const fundData = getPerFundData(fund.code);
            return (
              <FundAnalysisCard
                key={fund.code}
                fund={fund}
                synthesisAnalysis={fundData.synthesis}
                perModelAnalysis={fundData.perModel}
                onAnalyzeSingle={handleAnalyzeSingle}
                isAnalyzing={analyzingCodes.has(fund.code)}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 mb-6 transition-colors duration-300">
          <Globe size={48} className="mb-4 opacity-50" />
          <p>请先添加基金到您的投资组合。</p>
        </div>
      )}

      {/* Allocation Calculator */}
      {allSynthesisAnalyses.length > 0 && (
        <AllocationCalculator analyses={allSynthesisAnalyses} />
      )}
    </div>
  );
};

export default AnalysisPanel;
