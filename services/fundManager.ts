/**
 * FundManagerEngine - 全天候金字塔策略
 * 
 * 核心功能：
 * 1. 金字塔分批补仓 (防守)
 * 2. 结构化减仓止盈 (进攻)
 * 3. 动态追踪止盈
 * 4. 异常处理 (黑天鹅保护)
 */

import {
    FundTradingState,
    TradingSignal,
    TradingOperation,
    TradingAction,
    PyramidLevel
} from '../types';

// ============================================
// 常量配置
// ============================================

/** 金字塔买入配置: [触发跌幅, 买入份数, 累计仓位] */
const PYRAMID_CONFIG: Record<PyramidLevel, { dropTrigger: number; shares: number; totalPosition: number }> = {
    0: { dropTrigger: 0, shares: 0, totalPosition: 0 },     // 空仓
    1: { dropTrigger: 0, shares: 2, totalPosition: 20 },    // 底仓: 买2份 → 20%
    2: { dropTrigger: 0.10, shares: 2, totalPosition: 40 }, // 跌10%: 买2份 → 40%
    3: { dropTrigger: 0.15, shares: 3, totalPosition: 70 }, // 再跌15%: 买3份 → 70%
    4: { dropTrigger: 0.20, shares: 3, totalPosition: 100 } // 再跌20%: 买3份 → 100%
};

/** 结构化减仓配置: [ROI阈值, 卖出仓位比例] */
const PROFIT_TAKING_CONFIG = [
    { roiThreshold: 0.15, sellRatio: 0.20 },  // ROI 15%: 卖20%
    { roiThreshold: 0.30, sellRatio: 0.30 },  // ROI 30%: 卖30%
    { roiThreshold: 0.50, sellRatio: 0.20 },  // ROI 50%: 卖20%
];

const COOLDOWN_DAYS = 14;           // 补仓冷却期 (天)
const TRAILING_STOP_RATIO = 0.08;   // 从最高点回撤8%止盈
const BLACK_SWAN_DROP = 0.07;       // 单日跌7%触发黑天鹅保护

// ============================================
// 工具函数
// ============================================

/** 计算两个日期之间的天数差 */
function daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = Math.abs(d2.getTime() - d1.getTime());
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

// ============================================
// FundManagerEngine 类
// ============================================

export class FundManagerEngine {
    private state: FundTradingState;

    constructor(fundCode: string, initialState?: Partial<FundTradingState>) {
        this.state = {
            fundCode,
            positionSize: 0,
            avgCost: 0,
            peakPrice: 0,
            lastOpDate: null,
            logicStatus: true,
            pyramidLevel: 0,
            operationHistory: [],
            lastBuyPrice: 0,
            ...initialState
        };
    }

    // ============================================
    // 核心方法: 评估市场并返回操作建议
    // ============================================

    /**
     * 评估当前市场状态，返回操作建议
     * @param currentPrice - 当前价格/净值
     * @param ma20 - 20日均线
     * @param currentDate - 当前日期 (YYYY-MM-DD)
     * @param dailyChange - 今日涨跌幅 (可选, 用于黑天鹅检测)
     */
    evaluate_market(
        currentPrice: number,
        ma20: number,
        currentDate: string,
        dailyChange?: number
    ): TradingSignal {
        // ===== 优先级1: 逻辑证伪 → 强制清仓 =====
        if (!this.state.logicStatus) {
            return {
                action: 'SELL_ALL',
                shares: this.state.positionSize / 10,
                reason: '⚠️ 投资逻辑已证伪，强制清仓',
                pyramidLevel: this.state.pyramidLevel
            };
        }

        // ===== 优先级2: 黑天鹅保护 =====
        if (dailyChange !== undefined && dailyChange <= -BLACK_SWAN_DROP) {
            return {
                action: 'WAIT',
                shares: 0,
                reason: `🦢 黑天鹅警报: 单日跌幅 ${(dailyChange * 100).toFixed(1)}%，暂停操作`,
                pyramidLevel: this.state.pyramidLevel
            };
        }

        // ===== 更新最高价 (用于追踪止盈) =====
        if (currentPrice > this.state.peakPrice && this.state.positionSize > 0) {
            this.state.peakPrice = currentPrice;
        }

        const roi = this.calculateROI(currentPrice);

        // ===== 进攻模块: 盈利时 =====
        if (roi > 0 && this.state.positionSize > 0) {
            return this.evaluateOffensive(currentPrice, ma20, roi);
        }

        // ===== 防守模块: 亏损或空仓时 =====
        return this.evaluateDefensive(currentPrice, currentDate);
    }

    // ============================================
    // 防守模块: 金字塔分批补仓
    // ============================================

    private evaluateDefensive(currentPrice: number, currentDate: string): TradingSignal {
        const { pyramidLevel, lastBuyPrice, lastOpDate, positionSize } = this.state;

        // 检查冷却期
        if (lastOpDate && daysBetween(lastOpDate, currentDate) < COOLDOWN_DAYS) {
            const daysLeft = COOLDOWN_DAYS - daysBetween(lastOpDate, currentDate);
            return {
                action: 'HOLD',
                shares: 0,
                reason: `⏳ 冷却期中，还需等待 ${daysLeft} 天`,
                pyramidLevel
            };
        }

        // 空仓时建立底仓
        if (pyramidLevel === 0) {
            return {
                action: 'BUY',
                shares: PYRAMID_CONFIG[1].shares,
                reason: '📈 建立底仓 (Level 1: 20%)',
                pyramidLevel: 1
            };
        }

        // 已满仓
        if (pyramidLevel === 4) {
            return {
                action: 'HOLD',
                shares: 0,
                reason: '🏔️ 已满仓，等待反弹',
                pyramidLevel
            };
        }

        // 检查是否触发下一级补仓
        const nextLevel = (pyramidLevel + 1) as PyramidLevel;
        const nextConfig = PYRAMID_CONFIG[nextLevel];
        const dropFromLastBuy = (lastBuyPrice - currentPrice) / lastBuyPrice;

        if (dropFromLastBuy >= nextConfig.dropTrigger) {
            return {
                action: 'BUY',
                shares: nextConfig.shares,
                reason: `📉 触发 Level ${nextLevel} 补仓: 从上次买入跌 ${(dropFromLastBuy * 100).toFixed(1)}%`,
                pyramidLevel: nextLevel
            };
        }

        return {
            action: 'HOLD',
            shares: 0,
            reason: `⏸️ 等待补仓时机 (需跌至 ${(lastBuyPrice * (1 - nextConfig.dropTrigger)).toFixed(4)})`,
            pyramidLevel,
            roi: this.calculateROI(currentPrice)
        };
    }

    // ============================================
    // 进攻模块: 结构化减仓 + 动态止盈
    // ============================================

    private evaluateOffensive(currentPrice: number, ma20: number, roi: number): TradingSignal {
        const { positionSize, peakPrice, pyramidLevel } = this.state;

        // ===== 动态追踪止盈: 从最高点回撤8% =====
        const drawdown = (peakPrice - currentPrice) / peakPrice;
        if (drawdown >= TRAILING_STOP_RATIO && positionSize > 0) {
            return {
                action: 'SELL_ALL',
                shares: positionSize / 10,
                reason: `📉 触发追踪止盈: 从最高点 ${peakPrice.toFixed(4)} 回撤 ${(drawdown * 100).toFixed(1)}%`,
                roi,
                pyramidLevel
            };
        }

        // ===== 趋势预警: 跌破MA20 =====
        if (currentPrice < ma20 && positionSize > 0) {
            return {
                action: 'HOLD',
                shares: 0,
                reason: `⚠️ 价格跌破20日均线，建议关注 (当前: ${currentPrice.toFixed(4)}, MA20: ${ma20.toFixed(4)})`,
                roi,
                pyramidLevel
            };
        }

        // ===== 结构化减仓 =====
        const executedROIs = this.getExecutedProfitTakingLevels();

        for (const config of PROFIT_TAKING_CONFIG) {
            if (roi >= config.roiThreshold && !executedROIs.includes(config.roiThreshold)) {
                const sharesToSell = Math.ceil((positionSize * config.sellRatio) / 10);
                return {
                    action: 'SELL',
                    shares: sharesToSell,
                    reason: `💰 ROI ${(roi * 100).toFixed(1)}% 触发结构减仓: 卖出 ${(config.sellRatio * 100)}% 仓位`,
                    roi,
                    pyramidLevel
                };
            }
        }

        return {
            action: 'HOLD',
            shares: 0,
            reason: `📊 持仓中, ROI: ${(roi * 100).toFixed(2)}%`,
            roi,
            pyramidLevel
        };
    }

    // ============================================
    // 执行操作 (更新状态)
    // ============================================

    executeBuy(shares: number, price: number, date: string): void {
        const previousCost = this.state.avgCost * this.state.positionSize;
        const newCost = price * shares * 10; // 每份 = 10%
        const newPosition = Math.min(100, this.state.positionSize + shares * 10);

        this.state.avgCost = newPosition > 0
            ? (previousCost + newCost) / newPosition
            : price;
        this.state.positionSize = newPosition;
        this.state.lastBuyPrice = price;
        this.state.peakPrice = Math.max(this.state.peakPrice, price);
        this.state.lastOpDate = date;
        this.state.pyramidLevel = Math.min(4, this.state.pyramidLevel + 1) as PyramidLevel;

        this.recordOperation('BUY', price, shares, date);
    }

    executeSell(shares: number, price: number, date: string): void {
        const soldPosition = shares * 10;
        this.state.positionSize = Math.max(0, this.state.positionSize - soldPosition);
        this.state.lastOpDate = date;

        if (this.state.positionSize === 0) {
            this.resetState();
        }

        this.recordOperation('SELL', price, shares, date);
    }

    executeSellAll(price: number, date: string): void {
        const shares = this.state.positionSize / 10;
        this.state.positionSize = 0;
        this.state.lastOpDate = date;
        this.resetState();
        this.recordOperation('SELL_ALL', price, shares, date);
    }

    // ============================================
    // 状态管理
    // ============================================

    setLogicStatus(status: boolean): void {
        this.state.logicStatus = status;
    }

    getState(): FundTradingState {
        return { ...this.state };
    }

    loadState(state: FundTradingState): void {
        this.state = { ...state };
    }

    // ============================================
    // 私有辅助方法
    // ============================================

    private calculateROI(currentPrice: number): number {
        if (this.state.avgCost === 0 || this.state.positionSize === 0) return 0;
        return (currentPrice - this.state.avgCost) / this.state.avgCost;
    }

    private getExecutedProfitTakingLevels(): number[] {
        // 从历史操作中提取已执行的止盈阈值
        return this.state.operationHistory
            .filter(op => op.action === 'SELL')
            .map(op => {
                const roi = (op.price - this.state.avgCost) / this.state.avgCost;
                for (const config of PROFIT_TAKING_CONFIG) {
                    if (roi >= config.roiThreshold - 0.01) {
                        return config.roiThreshold;
                    }
                }
                return 0;
            })
            .filter(v => v > 0);
    }

    private recordOperation(action: TradingAction, price: number, shares: number, date: string): void {
        this.state.operationHistory.push({
            date,
            action,
            price,
            shares,
            positionAfter: this.state.positionSize
        });
    }

    private resetState(): void {
        this.state.avgCost = 0;
        this.state.peakPrice = 0;
        this.state.pyramidLevel = 0;
        this.state.lastBuyPrice = 0;
    }
}

// ============================================
// 工厂函数
// ============================================

export function createFundManager(fundCode: string, savedState?: FundTradingState): FundManagerEngine {
    if (savedState) {
        const engine = new FundManagerEngine(fundCode);
        engine.loadState(savedState);
        return engine;
    }
    return new FundManagerEngine(fundCode);
}
