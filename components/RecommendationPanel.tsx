import React, { useState } from 'react';
import { MultiModelRecommendationResult, MarketRecommendation } from '../types';
import { Sparkles, ArrowRight, ShieldAlert, ShieldCheck, Shield, Bot } from 'lucide-react';

interface RecommendationPanelProps {
  recommendations: MultiModelRecommendationResult | null;
  isLoading: boolean;
  onRefresh: () => void;
}

const RecommendationList: React.FC<{ items: MarketRecommendation[] }> = ({ items }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((rec, idx) => (
        <div key={idx} className="bg-slate-800 rounded-xl p-5 border border-slate-700 relative overflow-hidden group hover:border-purple-500/50 transition-colors animate-in fade-in zoom-in-95">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Sparkles size={64} className="text-purple-500" />
            </div>
            
            <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400 bg-purple-900/30 px-2 py-1 rounded">
                {rec.sector}
                </span>
                <div className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-900 border border-slate-700">
                {rec.riskLevel === 'Low' && <ShieldCheck size={12} className="text-emerald-400" />}
                {rec.riskLevel === 'Medium' && <Shield size={12} className="text-amber-400" />}
                {rec.riskLevel === 'High' && <ShieldAlert size={12} className="text-red-400" />}
                <span className="text-slate-300">
                    {rec.riskLevel === 'Low' ? '低风险' : rec.riskLevel === 'Medium' ? '中风险' : '高风险'}
                </span>
                </div>
            </div>

            <h3 className="text-lg font-bold text-white mb-1">{rec.fundName}</h3>
            <p className="text-xs font-mono text-slate-500 mb-2">{rec.code}</p>
            
            {rec.sourceModel && (
                <div className="mb-3 flex items-center gap-1 text-[10px] text-slate-400">
                    <Bot size={10} /> 来源: <span className="text-slate-300">{rec.sourceModel}</span>
                </div>
            )}

            <p className="text-sm text-slate-300 mb-4 line-clamp-3 group-hover:line-clamp-none transition-all">
            {rec.reason}
            </p>

            <button className="flex items-center gap-1 text-purple-400 text-xs font-bold hover:text-purple-300 transition-colors mt-auto">
            查看详情 <ArrowRight size={12} />
            </button>
        </div>
        ))}
    </div>
);

const RecommendationPanel: React.FC<RecommendationPanelProps> = ({ recommendations, isLoading, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<string>('synthesis');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="text-purple-400" />
            AI 智选发现
          </h2>
          <p className="text-slate-400 text-sm mt-1">基于多模型交叉验证的市场机会</p>
        </div>
        <button 
          onClick={onRefresh}
          disabled={isLoading}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 text-white rounded text-sm font-medium transition-colors"
        >
          {isLoading ? '正在扫描市场...' : '扫描市场机会'}
        </button>
      </div>

      {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-slate-800 h-48 rounded-xl animate-pulse"></div>
              ))}
          </div>
      )}

      {!isLoading && recommendations && (
        <>
            {/* Tabs */}
            <div className="flex space-x-1 mb-6 bg-slate-900/50 p-1 rounded-lg w-auto inline-flex border border-slate-700/50">
                <button
                    onClick={() => setActiveTab('synthesis')}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-all ${
                        activeTab === 'synthesis' 
                        ? 'bg-purple-600 text-white shadow-lg' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Sparkles size={14} /> 综合精选
                </button>
                {Object.keys(recommendations.individualResults).map(key => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-all ${
                            activeTab === key 
                            ? 'bg-slate-700 text-white shadow' 
                            : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Bot size={14} /> {key}
                    </button>
                ))}
            </div>
            
            {activeTab === 'synthesis' ? (
                <RecommendationList items={recommendations.synthesis} />
            ) : (
                <RecommendationList items={recommendations.individualResults[activeTab] || []} />
            )}
        </>
      )}

      {!isLoading && !recommendations && (
          <div className="text-center py-20 text-slate-500 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
              点击 "扫描市场机会" 让多个 AI 模型为您寻找最适合的基金。
          </div>
      )}
    </div>
  );
};

export default RecommendationPanel;
