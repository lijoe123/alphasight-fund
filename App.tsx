import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import { Fund, BudgetConfig, SavedAnalysisResult, FundTradingState } from './types';
import { identifyFund } from './services/gemini';
import { loadFunds, saveFunds } from './services/storage';

// Default funds if API fails or empty (optional, maybe empty local)
const INITIAL_FUNDS: Fund[] = [];

// Storage keys
const BUDGET_STORAGE_KEY = 'alphasight_budget_config';
const SAVED_ANALYSIS_KEY = 'alphasight_saved_analysis';
const TRADING_STATES_KEY = 'alphasight_trading_states';

function App() {
  const [funds, setFunds] = useState<Fund[]>(INITIAL_FUNDS);
  const [budgetConfig, setBudgetConfig] = useState<BudgetConfig | null>(null);
  const [savedAnalysis, setSavedAnalysis] = useState<SavedAnalysisResult | null>(null);
  const [tradingStates, setTradingStates] = useState<Record<string, FundTradingState>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Auto Load
  useEffect(() => {
    loadFunds().then(data => {
      if (data && data.length > 0) {
        setFunds(data);
      }
      // Load budget config from localStorage
      const savedBudget = localStorage.getItem(BUDGET_STORAGE_KEY);
      if (savedBudget) {
        try {
          setBudgetConfig(JSON.parse(savedBudget));
        } catch (e) {
          console.error('Failed to parse budget config', e);
        }
      }
      // Load saved analysis from localStorage
      const savedAnal = localStorage.getItem(SAVED_ANALYSIS_KEY);
      if (savedAnal) {
        try {
          setSavedAnalysis(JSON.parse(savedAnal));
        } catch (e) {
          console.error('Failed to parse saved analysis', e);
        }
      }
      // Load trading states from localStorage
      const savedTrading = localStorage.getItem(TRADING_STATES_KEY);
      if (savedTrading) {
        try {
          setTradingStates(JSON.parse(savedTrading));
        } catch (e) {
          console.error('Failed to parse trading states', e);
        }
      }
      setIsLoaded(true);
    });
  }, []);

  // Auto Save Funds
  // Use a separate effect to save only when funds change AND are loaded
  useEffect(() => {
    if (isLoaded) {
      saveFunds(funds);
    }
  }, [funds, isLoaded]);

  // Auto Save Budget
  useEffect(() => {
    if (isLoaded && budgetConfig) {
      localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgetConfig));
    }
  }, [budgetConfig, isLoaded]);

  const handleAddFund = (newFund: Fund) => {
    // Use functional update to ensure concurrent updates (like from CSV loop) 
    // don't overwrite each other with stale state.
    setFunds(prevFunds => {
      const next = [...prevFunds, newFund];
      return next;
    });

    // Check if the fund needs name resolution (if it uses a placeholder name)
    // Placeholder patterns: "基金 [CODE]", "导入基金 [CODE]", or undefined/empty
    const isPlaceholder = !newFund.name ||
      newFund.name === `基金 ${newFund.code}` ||
      newFund.name === `导入基金 ${newFund.code}`;

    if (isPlaceholder) {
      // Trigger background identification
      // We introduce a small random delay to prevent hitting API rate limits instantly 
      // if a large CSV is imported (staggering requests)
      const delay = Math.random() * 2000;

      setTimeout(() => {
        // Fallback or specific logic if needed. 
        // Note: Sidebar import likely already resolved names via EastMoney.
        identifyFund(newFund.code)
          .then(resolvedName => {
            // Only update if we got a valid name different from the fallback
            // Note: identifyFund fallback is "基金 code"
            if (resolvedName && resolvedName !== `基金 ${newFund.code}`) {
              setFunds(currentFunds =>
                currentFunds.map(f =>
                  f.id === newFund.id ? { ...f, name: resolvedName } : f
                )
              );
            }
          })
          .catch(err => {
            console.error(`Failed to resolve name for ${newFund.code}`, err);
          });
      }, delay);
    }
  };

  const handleUpdateFund = (updatedFund: Fund) => {
    setFunds(prevFunds => prevFunds.map(f => f.id === updatedFund.id ? updatedFund : f));
  };

  const handleRemoveFund = (id: string) => {
    setFunds(prevFunds => prevFunds.filter(f => f.id !== id));
  };

  const handleUpdateBudget = (config: BudgetConfig) => {
    setBudgetConfig(config);
  };

  const handleSaveAnalysis = (result: SavedAnalysisResult) => {
    setSavedAnalysis(result);
    localStorage.setItem(SAVED_ANALYSIS_KEY, JSON.stringify(result));
  };

  const handleUpdateTradingState = (fundCode: string, state: FundTradingState) => {
    setTradingStates(prev => {
      const updated = { ...prev, [fundCode]: state };
      localStorage.setItem(TRADING_STATES_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <div className="flex min-h-screen font-sans bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-200 transition-colors duration-300">
      <Sidebar
        funds={funds}
        onAddFund={handleAddFund}
        onUpdateFund={handleUpdateFund}
        onRemoveFund={handleRemoveFund}
      />
      <Dashboard
        funds={funds}
        budgetConfig={budgetConfig}
        savedAnalysis={savedAnalysis}
        tradingStates={tradingStates}
        onUpdateBudget={handleUpdateBudget}
        onSaveAnalysis={handleSaveAnalysis}
        onUpdateTradingState={handleUpdateTradingState}
        onUpdateFund={handleUpdateFund}
      />
    </div>
  );
}

export default App;