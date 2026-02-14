
export interface Fund {
  id: string;
  code: string;
  name?: string;
  type?: 'FUND' | 'STOCK'; // Defaults to FUND if undefined
  cost: number;
  shares: number;
  purchaseDate?: string;
}

export enum RecommendationType {
  BUY = 'BUY',
  HOLD = 'HOLD',
  SELL = 'SELL',
}

export interface FundAnalysis {
  fundCode: string;
  fundName: string;
  rating: RecommendationType;
  reason: string;
  currentNavEstimate?: number; // Estimated from search
}

export interface GlobalContext {
  summary: string;
  macroIndicators: {
    name: string;
    value: string;
    trend: 'UP' | 'DOWN' | 'NEUTRAL';
  }[];
}

export interface PortfolioAnalysisResult {
  globalContext: GlobalContext;
  fundAnalyses: FundAnalysis[];
}

export interface MarketRecommendation {
  fundName: string;
  code: string;
  sector: string;
  reason: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  sourceModel?: string; // To track which model recommended this
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export type AIProvider = 'gemini' | 'openai' | 'deepseek' | 'qwen';

export interface AIProviderConfig {
  provider: AIProvider;
  name: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface MultiModelAnalysisResult {
  synthesis: PortfolioAnalysisResult;
  individualResults: Record<string, PortfolioAnalysisResult>;
  consensusSummary: string; // Text explaining the agreement/disagreement
}

// Per-fund analysis result (inline display in holdings table)
export interface PerFundAnalysisResult {
  synthesis: FundAnalysis;                        // 综合分析
  perModel: Record<string, FundAnalysis>;         // 各模型独立分析
}

export interface MultiModelRecommendationResult {
  synthesis: MarketRecommendation[];
  individualResults: Record<string, MarketRecommendation[]>;
}

export interface FundHistoryItem {
  date: string;
  value: number;
  equityReturn: number; // For cumulative return chart
  unitNav: number;
}

export interface FundHistory {
  fundCode: string;
  history: FundHistoryItem[];
}

// Budget / Financial Planning Types
export interface FixedExpenses {
  rent: number;      // 房租
  food: number;      // 餐饮
  commute: number;   // 通勤
  utilities: number; // 水电通讯
  other: number;     // 其他固定支出
}

export interface BudgetConfig {
  monthlySalary: number;
  fixedExpenses: FixedExpenses;
  allocationRatios: {
    flexible: number;   // 弹性消费比例 (%)
    savings: number;    // 储蓄比例 (%)
    investment: number; // 投资比例 (%)
  };
}

// ============================================
// FundManagerEngine Types (全天候金字塔策略)
// ============================================

export type TradingAction = 'BUY' | 'SELL' | 'HOLD' | 'SELL_ALL' | 'WAIT';

export interface TradingSignal {
  action: TradingAction;
  shares: number;           // 建议交易份数 (占总预算的份数, 1份=10%)
  reason: string;           // 操作原因
  roi?: number;             // 当前收益率
  pyramidLevel?: number;    // 当前金字塔层级
}

export interface TradingOperation {
  id: string;               // 唯一ID用于编辑/删除
  date: string;
  action: TradingAction;
  amount: number;           // 交易金额
  shares: number;           // 份数 (1份=10%)
  levelAfter: PyramidLevel; // 操作后仓位层级
  note?: string;            // 备注
}

export type PyramidLevel = 0 | 1 | 2 | 3 | 4;

export interface FundTradingState {
  fundCode: string;
  positionSize: number;       // 0-100 仓位百分比
  avgCost: number;            // 平均成本
  peakPrice: number;          // 买入后最高价 (用于追踪止盈)
  lastOpDate: string | null;  // 上次操作日期 (YYYY-MM-DD)
  logicStatus: boolean;       // true = 投资逻辑有效
  pyramidLevel: PyramidLevel; // 金字塔阶段 0=空仓, 4=满仓
  operationHistory: TradingOperation[];
  lastBuyPrice: number;       // 上次买入价格 (用于计算补仓点位)
}

// ============================================
// 保存的AI分析结果 (用于理财页面)
// ============================================

export interface SavedFundAnalysis {
  fundCode: string;
  fundName: string;
  rating: RecommendationType;
  rationale: string;
  savedAt: string;            // ISO日期
  currentPrice?: number;      // 保存时的价格
  avgCost?: number;           // 平均成本
}

export interface SavedAnalysisResult {
  analyses: SavedFundAnalysis[];
  savedAt: string;
  consensusSummary?: string;
}
