import React, { useState } from 'react';
import { MultiModelAnalysisResult, PortfolioAnalysisResult, RecommendationType, FundAnalysis, SavedAnalysisResult, SavedFundAnalysis } from '../types';
import { TrendingUp, TrendingDown, Minus, Globe, Bot, Sparkles, Calculator, Save, CheckCircle } from 'lucide-react';

interface AnalysisPanelProps {
  data: MultiModelAnalysisResult | null;
  isLoading: boolean;
  onRunAnalysis: () => void;
  onSaveAnalysis?: (result: SavedAnalysisResult) => void;
}

const getRatingLabel = (rating: RecommendationType) => {
  switch (rating) {
    case RecommendationType.BUY: return '建议补仓';
    case RecommendationType.SELL: return '建议卖出';
    case RecommendationType.HOLD: return '继续持有';
    default: return rating;
  }
};

interface AllocationCalculatorProps {
  analyses: FundAnalysis[];
}

/**
 * 金字塔策略常量
 * 根据 AI 评级分配不同的仓位建议
 */
const PYRAMID_CONFIG = {
  BUY: { baseWeight: 3, strategyLabel: '积极补仓', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  HOLD: { baseWeight: 1, strategyLabel: '维持持有', color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  SELL: { baseWeight: 0, strategyLabel: '建议减仓', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' }
};

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

    // 统计各类评级数量
    const buyCount = analyses.filter(a => a.rating === RecommendationType.BUY).length;
    const holdCount = analyses.filter(a => a.rating === RecommendationType.HOLD).length;
    const sellCount = analyses.filter(a => a.rating === RecommendationType.SELL).length;

    // 计算总权重 (排除 SELL)
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

    // 金字塔分配：BUY 获得 3倍权重，HOLD 获得 1倍，SELL 为 0
    const allocation = analyses.map(a => {
      const w = weights.find(x => x.code === a.fundCode);
      const weight = w ? w.weight : 0;
      const config = PYRAMID_CONFIG[a.rating];
      const allocAmount = totalScore > 0 ? (weight / totalScore) * totalAmount : 0;

      // 金字塔层级说明
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

    // 按金额降序排列
    allocation.sort((a, b) => b.amount - a.amount);

    // 生成策略说明
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
    <div className="bg-slate-800 rounded-xl border border-emerald-500/30 p-6 shadow-lg shadow-emerald-900/10">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Calculator className="text-emerald-400" size={20} />
        金字塔智能仓位计算器
        <span className="text-xs font-normal text-slate-500 ml-2">(AI分析 + 策略融合)</span>
      </h3>

      <div className="flex gap-4 mb-6 items-end">
        <div className="flex-1">
          <label className="block text-slate-400 text-xs mb-2">计划投入总资金 (元)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">¥</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-8 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
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
        <div className="overflow-hidden rounded-lg border border-slate-700">
          {reasoning && (
            <div className="bg-slate-900/80 p-4 text-sm text-slate-300 border-b border-slate-700 leading-relaxed">
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                <div className="whitespace-pre-wrap">{reasoning}</div>
              </div>
            </div>
          )}
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-xs">
              <tr>
                <th className="px-4 py-3">基金</th>
                <th className="px-4 py-3 text-center">策略信号</th>
                <th className="px-4 py-3 text-right">分配权重</th>
                <th className="px-4 py-3 text-right">建议金额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {result.map((row) => {
                const config = PYRAMID_CONFIG[row.rating];
                return (
                  <tr key={row.code} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{row.name}</div>
                      <div className="text-slate-500 text-xs font-mono">{row.code}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${config.bgColor} ${config.color}`}>
                        {row.pyramidLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 font-mono">
                      {row.percentage}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold font-mono ${row.amount > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                        ¥{row.amount.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="bg-slate-900/50 px-4 py-2 text-xs text-slate-500 border-t border-slate-700">
            💡 策略说明：BUY信号×3倍权重 | HOLD信号×1倍权重 | SELL信号=0权重（建议减仓）
          </div>
        </div>
      )}
    </div>
  );
};

const SingleAnalysisView: React.FC<{ data: PortfolioAnalysisResult, isSynthesis?: boolean, consensus?: string }> = ({ data, isSynthesis, consensus }) => (
  <div className="space-y-6">
    {isSynthesis && consensus && (
      <div className="bg-purple-900/30 border border-purple-500/40 rounded-lg p-4 mb-6">
        <h4 className="text-purple-300 font-bold mb-2 flex items-center gap-2">
          <Sparkles size={16} /> 多模型共识
        </h4>
        <p className="text-slate-300 text-sm leading-relaxed">{consensus}</p>
      </div>
    )}

    {/* AI Analysis Cards */}
    <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      {data.fundAnalyses.map((fund) => (
        <div key={fund.fundCode} className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h4 className="text-white font-bold">{fund.fundName}</h4>
              <span className="text-slate-500 text-xs font-mono">{fund.fundCode}</span>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${fund.rating === RecommendationType.BUY ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              fund.rating === RecommendationType.SELL ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
              {getRatingLabel(fund.rating)}
            </span>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">{fund.rationale}</p>
        </div>
      ))}
    </div>

    {/* Allocation Calculator */}
    <AllocationCalculator analyses={data.fundAnalyses} />
  </div>
);

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ data, isLoading, onRunAnalysis, onSaveAnalysis }) => {
  const [activeTab, setActiveTab] = useState<string>('synthesis');
  const [isSaved, setIsSaved] = useState(false);

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

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 border border-dashed border-slate-700 rounded-lg bg-slate-800/50">
        <Globe size={48} className="mb-4 opacity-50" />
        <p className="mb-4">点击运行分析以获取 AI 投资见解。</p>
        <button
          onClick={onRunAnalysis}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-lg shadow-emerald-900/50"
        >
          开始 AI 分析
        </button>
      </div>
    );
  }

  const individualKeys = Object.keys(data.individualResults);
  const showTabs = individualKeys.length > 0;

  return (
    <div>
      {showTabs && (
        <div className="flex space-x-1 mb-6 bg-slate-900/50 p-1 rounded-lg w-auto inline-flex border border-slate-700/50">
          <button
            onClick={() => setActiveTab('synthesis')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-all ${activeTab === 'synthesis'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white'
              }`}
          >
            <Sparkles size={14} /> 综合建议
          </button>
          {individualKeys.map(key => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-all ${activeTab === key
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-400 hover:text-white'
                }`}
            >
              <Bot size={14} /> {key}
            </button>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 mb-4">
        {onSaveAnalysis && (
          <button
            onClick={() => {
              const savedResult: SavedAnalysisResult = {
                analyses: data.synthesis.fundAnalyses.map(f => ({
                  fundCode: f.fundCode,
                  fundName: f.fundName,
                  rating: f.rating,
                  rationale: f.reason || '',
                  savedAt: new Date().toISOString()
                })),
                savedAt: new Date().toISOString(),
                consensusSummary: data.consensusSummary
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
            {isSaved ? '已保存到理财' : '确认并保存到理财'}
          </button>
        )}
        <button
          onClick={onRunAnalysis}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-emerald-400 text-sm font-bold flex items-center gap-2 transition-colors shadow-sm"
        >
          <Sparkles size={16} />
          重新运行分析
        </button>
      </div>

      {activeTab === 'synthesis' ? (
        <SingleAnalysisView
          data={data.synthesis}
          isSynthesis={true}
          consensus={data.consensusSummary}
        />
      ) : (
        <SingleAnalysisView data={data.individualResults[activeTab]} />
      )}
    </div>
  );
};

export default AnalysisPanel;
