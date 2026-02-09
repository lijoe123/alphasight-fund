import React, { useState, useEffect } from 'react';
import { X, Save, Server, Key, Box, Globe, CheckCircle2, Circle } from 'lucide-react';
import { AIProviderConfig, AIProvider } from '../types';
import { getAIConfigs, updateAIConfig } from '../services/gemini';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [configs, setConfigs] = useState<Record<AIProvider, AIProviderConfig>>(getAIConfigs());
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');

  useEffect(() => {
    if (isOpen) {
        setConfigs(getAIConfigs());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activeConfig = configs[selectedProvider];

  const handleConfigChange = (field: keyof AIProviderConfig, value: any) => {
      setConfigs(prev => ({
          ...prev,
          [selectedProvider]: {
              ...prev[selectedProvider],
              [field]: value
          }
      }));
  };

  const toggleEnable = (provider: AIProvider, e: React.MouseEvent) => {
      e.stopPropagation();
      setConfigs(prev => ({
          ...prev,
          [provider]: {
              ...prev[provider],
              enabled: !prev[provider].enabled
          }
      }));
  };

  const handleSave = () => {
      // Save all configs
      Object.keys(configs).forEach(key => {
          const k = key as AIProvider;
          updateAIConfig(k, configs[k]);
      });
      onSave();
      onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Server className="text-blue-400" size={20} />
                多模型 AI 设置
            </h2>
            <p className="text-xs text-slate-400 mt-1">启用多个模型可进行交叉验证与综合分析</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
            {/* Sidebar List */}
            <div className="w-1/3 border-r border-slate-700 bg-slate-900/30 overflow-y-auto">
                {(Object.values(configs) as AIProviderConfig[]).map((conf) => (
                    <div 
                        key={conf.provider}
                        onClick={() => setSelectedProvider(conf.provider)}
                        className={`p-4 border-b border-slate-700/50 cursor-pointer transition-colors flex items-center justify-between group ${selectedProvider === conf.provider ? 'bg-slate-700/50 border-l-2 border-l-blue-400' : 'hover:bg-slate-800'}`}
                    >
                        <div>
                            <div className={`font-bold text-sm ${selectedProvider === conf.provider ? 'text-white' : 'text-slate-300'}`}>{conf.name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{conf.model}</div>
                        </div>
                        <button 
                            onClick={(e) => toggleEnable(conf.provider, e)}
                            className={`p-1 rounded-full transition-colors ${conf.enabled ? 'text-emerald-400 bg-emerald-900/20' : 'text-slate-600 hover:text-slate-400'}`}
                            title={conf.enabled ? "已启用" : "点击启用"}
                        >
                            {conf.enabled ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        </button>
                    </div>
                ))}
            </div>

            {/* Config Form */}
            <div className="w-2/3 p-6 overflow-y-auto bg-slate-800">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white">{activeConfig.name} 配置</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-slate-400">{activeConfig.enabled ? '已启用' : '已禁用'}</span>
                        <div 
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${activeConfig.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                            onClick={() => handleConfigChange('enabled', !activeConfig.enabled)}
                        >
                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${activeConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </label>
                </div>

                <div className="space-y-4">
                     <div>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            <Key size={12} /> API Key
                        </label>
                        <input 
                            type="password" 
                            value={activeConfig.apiKey}
                            onChange={(e) => handleConfigChange('apiKey', e.target.value)}
                            placeholder={`输入 ${activeConfig.name} API Key`}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-slate-600"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                            {activeConfig.provider === 'gemini' 
                                ? '默认使用系统内置 Key，如需自定义请输入。' 
                                : 'Key 仅存储在本地浏览器中。'}
                        </p>
                    </div>

                    <div>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            <Box size={12} /> 模型名称
                        </label>
                        <input 
                            type="text" 
                            value={activeConfig.model}
                            onChange={(e) => handleConfigChange('model', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    {activeConfig.provider !== 'gemini' && (
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                <Globe size={12} /> Base URL
                            </label>
                            <input 
                                type="text" 
                                value={activeConfig.baseUrl}
                                onChange={(e) => handleConfigChange('baseUrl', e.target.value)}
                                placeholder="https://api.example.com/v1"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none text-slate-300"
                            />
                        </div>
                    )}
                </div>

                {activeConfig.provider === 'gemini' && (
                    <div className="mt-6 bg-emerald-900/10 border border-emerald-500/20 rounded p-3 text-xs text-emerald-300/80 flex gap-2">
                        <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                        Gemini 支持实时 Google Search (Grounding)，可提供最新的市场净值和新闻。建议设为常驻开启。
                    </div>
                )}
            </div>
        </div>

        <div className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end gap-3">
            <button 
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
                取消
            </button>
            <button 
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
            >
                <Save size={16} /> 保存所有配置
            </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;