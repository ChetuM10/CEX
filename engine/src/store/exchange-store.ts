export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled";

export interface Balance {
  available: number;
  locked: number;
}

export interface RestingOrder {
  orderId: string;
  userId: string;
  side: Side;
  type: "limit";
  symbol: string;
  price: number;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  createdAt: number;
}

export interface OrderRecord {
  orderId: string;
  userId: string;
  side: Side;
  type: OrderType;
  symbol: string;
  price: number | null;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  fills: Fill[];
  createdAt: number;
}

export interface Fill {
  fillId: string;
  symbol: string;
  price: number;
  qty: number;
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;
}

export interface OrderBook {
  bids: Map<number, RestingOrder[]>;
  asks: Map<number, RestingOrder[]>;
}

export interface CreateOrderInput {
  userId: string;
  type: OrderType;
  side: Side;
  symbol: string;
  price: number | null;
  qty: number;
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthResponse {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export const BALANCES = new Map<string, Record<string, Balance>>();
export const ORDERBOOKS = new Map<string, OrderBook>();
export const ORDERS = new Map<string, OrderRecord>();
export const FILLS: Fill[] = [];

//helper to seed balance for testing if user is new
export function seedBalanceIfNeeded(userId: string): Record<string, Balance> {
  let userBalances = BALANCES.get(userId);
  if (!userBalances) {
    userBalances = {
      USD: { available: 10000, locked: 0 },
      BTC: { available: 10, locked: 0 },
    };
    BALANCES.set(userId, userBalances);
  }
  return userBalances;
}

//handler to fetch user balance
export function getUserBalance(payload: Record<string, unknown>):
  Record<string, Balance> {
  const userId = payload.userId as string;
  if (!userId) throw new Error("Missing userId in payload");
  return seedBalanceIfNeeded(userId);
}

//temporary placeholders to fix compile errors
export function createOrder(payload: Record<string, unknown>): unknown {
  const { userId, type, side, symbol, price, qty } = payload as unknown as CreateOrderInput;
  if (!userId || !type || !side || !symbol || !price || !qty) {
    throw new Error("Invalid order payload!")
  }

  //ensure user has seeded balances
  const userBalances = seedBalanceIfNeeded(userId);

  //lock balance for limit orders
  if (type === "limit") {
    if (!price || price <= 0) throw new Error("Limited orders require a positive price");

    if (side === "buy") {
      const totalCost = price * qty;
      const usdBalance = userBalances["USD"];
      if (!usdBalance || usdBalance.available < totalCost) {
        throw new Error("Insufficient USD balance for buy order");
      }

      //lock the USD
      usdBalance.available -= totalCost;
      usdBalance.locked += totalCost;

    } else if (side === "sell") {
      const baseAssetBalance = userBalances[symbol];
      if (!baseAssetBalance || baseAssetBalance.available < qty) {
        throw new Error(`Insufficient ${symbol} balance for sell order.`);
      }

      //lock the base asset(e.g. BTC)
      baseAssetBalance.available -= qty;
      baseAssetBalance.locked += qty;
    }
  }

  //TODO: Next step will be matching the order or placing it on the book
  return { userId, type, side, symbol, price, qty, status: "open" };
}

export function cancelOrder(payload: Record<string, unknown>): unknown {
  throw new Error("cancelOrder not implemented yet");
}

export function getDepth(payload: Record<string, unknown>): unknown {
  throw new Error("getDepth not implemented yet");
}

export function getOrder(payload: Record<string, unknown>):
  OrderRecord {
  const orderId = payload.orderId as string;
  if (!orderId) throw new Error("Missing orderId in payload");

  const order = ORDERS.get(orderId);
  if (!order) throw new Error("Order not found");

  return order;
}

//real implementation will begin from here