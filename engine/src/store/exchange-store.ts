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

//----------------------------------------------------------------------------------------//
//--------------------helper to seed balance for testing if user is new------------- -----//

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

//----------------------------------------------------------------------------------------//
//----------------------------handler to fetch user balance-------------------------------//

export function getUserBalance(payload: Record<string, unknown>):
  Record<string, Balance> {
  const userId = payload.userId as string;
  if (!userId) throw new Error("Missing userId in payload");
  return seedBalanceIfNeeded(userId);
}

//temporary placeholders to fix compile errors
export function createOrder(payload: Record<string, unknown>): unknown {
  const { userId, type, side, symbol, price, qty } = payload as unknown as CreateOrderInput;
  if (!userId || !type || !side || !symbol || !qty || (type === "limit" && !price)) {
    throw new Error("Invalid order payload!")
  }

  //ensure user has seeded balances
  const userBalances = seedBalanceIfNeeded(userId);

  //if order is a limit order, lock funds immediately
  if (type === "limit") {
    if (!price || price <= 0) throw new Error("Limited orders require a positive price");

    //lock balance for limit orders
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

  // //TODO: Next step will be matching the order or placing it on the book
  // return { userId, type, side, symbol, price, qty, status: "open" };

  //create the permanent order record
  const orderId = crypto.randomUUID();
  // const now = Date.now();

  const order: OrderRecord = {
    orderId,
    userId,
    side,
    type,
    symbol,
    price,
    qty,
    filledQty: 0,
    status: "open",
    fills: [],
    createdAt: Date.now()
  };
  ORDERS.set(orderId, order);

  // create orderbook for the symbol if not exists
  // Each symbol (BTC, ETH, etc.) has its own bids and asks. 
  if (!ORDERBOOKS.has(symbol)) {
    ORDERBOOKS.set(symbol, { bids: new Map(), asks: new Map() });
  }
  const book = ORDERBOOKS.get(symbol)!;

  //match against the book
  if (side === "buy") {
    //sort assks: lowest price first
    const askPrices = Array.from(book.asks.keys()).sort((a, b) => a - b);

    for (const askPrice of askPrices) {
      if (order.filledQty >= qty) break;
      if (price !== null && price < askPrice) break;//buy price must be >= ask price

      const restingOrders = book.asks.get(askPrice) || [];
      while (restingOrders.length > 0 && order.filledQty < qty) {
        const askOrder = restingOrders[0];
        if (!askOrder) break;

        const remainingToFill = qty - order.filledQty;
        const askRemaining = askOrder.qty - askOrder.filledQty;
        const fillQty = Math.min(remainingToFill, askRemaining);

        //calculate fill price(match at resting order's price)
        const fillPrice = askOrder.price;
        const usdValue = fillPrice * fillQty;

        // Update seller's order progress and mark it as filled or partially filled
        const fillId = crypto.randomUUID();
        const fill: Fill = {
          fillId,
          symbol,
          price: fillPrice,
          qty: fillQty,
          buyOrderId: orderId,
          sellOrderId: askOrder.orderId,
          createdAt: Date.now(),
        };

        FILLS.push(fill);
        order.fills.push(fill);
        order.filledQty += fillQty;

        //update seller order fills
        const parentAskOrder = ORDERS.get(askOrder.orderId);
        if (parentAskOrder) {
          parentAskOrder.fills.push(fill);
          parentAskOrder.filledQty += fillQty;
          parentAskOrder.status = parentAskOrder.filledQty === parentAskOrder.qty ? "filled" : "partially_filled";
        }

        askOrder.filledQty += fillQty;
        askOrder.status = askOrder.filledQty === askOrder.qty ? "filled" : "partially_filled";

        //Adjust balances: Transfer USD from buyer (Alice) to seller (Bob)
        const sellerBalances = seedBalanceIfNeeded(askOrder.userId);

        // // Buyer USD was locked at the incoming order's price. 
        // // If matched at a lower askPrice, unlock the difference
        // const usdRefund = (price! - fillPrice) * fillQty;
        // userBalances["USD"]!.locked -= (price! * fillQty);
        // userBalances["USD"]!.available += usdRefund;

        //replaced this with the above code  in order to handle the balance deduction
        //differently for market buys since they don't have previously locked funds

        if (type == "limit") {
          const usdRefund = (price! - fillPrice) * fillQty;
          userBalances["USD"]!.locked -= (price! * fillQty);
          userBalances["USD"]!.available += usdRefund;
        } else {
          //for market orders, deduct directly from available USD
          if (userBalances["USD"]!.available < usdValue) {
            throw new Error("Insuffie=cient USD balance for market order.");
          }
          userBalances["USD"]!.available -= usdValue;
        }

        // Ensure buyer's token balance is initialized
        if (!userBalances[symbol]) {
          userBalances[symbol] = { available: 0, locked: 0 };
        }
        userBalances[symbol]!.available += fillQty; // give token to buyer

        sellerBalances["USD"]!.available += usdValue; // give USD to seller
        // Ensure seller's token balance is initialized
        if (!sellerBalances[symbol]) {
          sellerBalances[symbol] = { available: 0, locked: 0 };
        }
        sellerBalances[symbol]!.locked -= fillQty; // unlock token from seller

        if (askOrder.status === "filled") {
          restingOrders.shift();
        }
      }
      if (restingOrders.length === 0) {
        book.asks.delete(askPrice);
      }
    }
    //update final buyrer order status
    order.status = order.filledQty === 0 ? "open" : order.filledQty === qty ? "filled" : "partially_filled";

    //place remaining quantity on bids book
    if (type === "limit" && order.filledQty < qty) {
      const restingQty = qty - order.filledQty;
      const limitPrice = price!
      if (!book.bids.has(limitPrice)) {
        book.bids.set(limitPrice, []);
      }
      book.bids.get(limitPrice)!.push({
        orderId,
        userId,
        side,
        type: "limit",
        symbol,
        price: limitPrice,
        qty: restingQty,
        filledQty: 0,
        status: order.status,
        createdAt: order.createdAt,
      });
    }
  } else {
    //sort bids: highest price first
    const bidPrices = Array.from(book.bids.keys()).sort((a, b) => b - a);

    for (const bidPrice of bidPrices) {
      if (order.filledQty >= qty) break;
      if (price !== null && price > bidPrice) break;//sell price must be <= bid price

      const restingOrders = book.bids.get(bidPrice) || [];
      while (restingOrders.length > 0 && order.filledQty < qty) {
        const bidOrder = restingOrders[0];
        if (!bidOrder) break;

        const remainingToFill = qty - order.filledQty;
        const bidRemaining = bidOrder.qty - bidOrder.filledQty;
        const fillQty = Math.min(remainingToFill, bidRemaining);

        const fillPrice = bidOrder.price;
        const usdValue = fillPrice * fillQty;

        // Create a trade record, save it, and update the order's filled quantity
        const fillId = crypto.randomUUID();
        const fill: Fill = {
          fillId,
          symbol,
          price: fillPrice,
          qty: fillQty,
          buyOrderId: bidOrder.orderId,
          sellOrderId: orderId,
          createdAt: Date.now(),
        };

        FILLS.push(fill);
        order.fills.push(fill);
        order.filledQty += fillQty;

        //update buyer order fills
        const parentBidOrder = ORDERS.get(bidOrder.orderId);
        if (parentBidOrder) {
          parentBidOrder.fills.push(fill);
          parentBidOrder.filledQty += fillQty;
          parentBidOrder.status = parentBidOrder.filledQty === parentBidOrder.qty ? "filled" : "partially_filled";
        }

        bidOrder.filledQty += fillQty;
        bidOrder.status = bidOrder.filledQty === bidOrder.qty ? "filled" : "partially_filled";

        //adjust balances: transfer token from seller to buyer
        const buyerBalances = seedBalanceIfNeeded(bidOrder.userId);

        // userBalances[symbol]!.locked -= fillQty; //unlock token from seller

        // userBalances[symbol]!.locked -= fillQty; //unlock token from seller
        if (type === "limit") {
          userBalances[symbol]!.locked -= fillQty; //unlock token from seller
        } else {
          // For market orders, deduct directly from available tokens
          if (userBalances[symbol]!.available < fillQty) {
            throw new Error(`Insufficient ${symbol} balance for market order`);
          }
          userBalances[symbol]!.available -= fillQty;
        }
        userBalances["USD"]!.available += usdValue; //give USD to seller
        buyerBalances["USD"]!.locked -= usdValue;   // Unlock USD from buyer

        //ensure buyer's token balance is initialzed
        if (!buyerBalances[symbol]) {
          buyerBalances[symbol] = { available: 0, locked: 0 };
        }
        buyerBalances[symbol]!.available += fillQty; //give t

        if (bidOrder.status === "filled") {
          restingOrders.shift();
        }
      }
      if (restingOrders.length === 0) {
        book.bids.delete(bidPrice);
      }
    }
    //update final seller order status
    order.status = order.filledQty === 0 ? "open" : order.filledQty === qty ? "filled" : "partially_filled";

    //place remaining quantity on asks book
    if (type === "limit" && order.filledQty < qty) {
      const restingQty = qty - order.filledQty;
      const limitPrice = price!;
      if (!book.asks.has(limitPrice)) {
        book.asks.set(limitPrice, []);
      }
      book.asks.get(limitPrice)!.push({
        orderId,
        userId,
        side,
        type: "limit",
        symbol,
        price: limitPrice,
        qty: restingQty,
        filledQty: 0,
        status: order.status,
        createdAt: order.createdAt,
      });
    }
  }
  return order;
}

//-------------------------------------------------------------------------------------------//
//------------Show how much BTC people want to buy and sell at each price------------------//
export function getDepth(payload: Record<string, unknown>): unknown {

  const symbol = payload.symbol as string;
  if (!symbol) throw new Error("Missing symbol in payload");

  const book = ORDERBOOKS.get(symbol);
  if (!book) {
    return { symbol, bids: [], asks: [] };
  }

  //Aggregate and group BIDS by price level
  const bids: DepthLevel[] = [];
  for (const [price, orders] of book.bids.entries()) {
    const totalQty = orders.reduce((sum, o) => sum + (o.qty - o.filledQty), 0);
    if (totalQty > 0) {
      bids.push({ price, qty: totalQty });
    }
  }

  //SORT Bids: Highest price first
  bids.sort((a, b) => b.price - a.price);

  //Aggregate and group ASKS by price level
  const asks: DepthLevel[] = [];
  for (const [price, orders] of book.asks.entries()) {
    const totalQty = orders.reduce((sum, o) => sum + (o.qty - o.filledQty), 0);
    if (totalQty > 0) {
      asks.push({ price, qty: totalQty });
    }
  }

  //SORT Asks: lowest price first
  asks.sort((a, b) => a.price - b.price);

  return { symbol, bids, asks };
}

//------------------------------------------------------------------------------//
//-----------------------cancelOrder (cancels resting orders)-------------------//
export function cancelOrder(payload: Record<string, unknown>): unknown {
  const userId = payload.userId as string;
  const orderId = payload.orderId as string;

  if (!userId || !orderId) {
    throw new Error("Missing userId or orderId in payload");
  }

  // 1. Locate the order
  const order = ORDERS.get(orderId);
  if (!order) {
    throw new Error("Order not found.");
  }

  // 2. Validare ownership and status
  if (order.userId !== userId) {
    throw new Error("Unauthorized to cancel this order.");
  }

  if (order.status === "filled") {
    throw new Error("Cannot cancel a fully filled order.");
  }

  if (order.status === "cancelled") {
    throw new Error("Order is already cancelled.")
  }

  // 3. Remove the order from order book
  const book = ORDERBOOKS.get(order.symbol);
  if (book) {
    const priceLevel = order.price!;

    // Remove the order from the order book.
    // If nobody is buying/selling at this price anymore, remove that price entry.
    if (order.side === "buy") {
      const restingOrders = book.bids.get(priceLevel) || [];
      const updateOrders = restingOrders.filter((o) => o.orderId !== orderId);

      if (updateOrders.length == 0) {
        book.bids.delete(priceLevel);
      } else {
        book.bids.set(priceLevel, updateOrders);
      }
    } else {
      const restingOrders = book.asks.get(priceLevel) || [];
      const updateOrders = restingOrders.filter((o) => o.orderId !== orderId);
      if (updateOrders.length === 0) {
        book.asks.delete(priceLevel);
      } else {
        book.asks.set(priceLevel, updateOrders);
      }
    }
  }

  // 4. Calculate remaining quantity and unlock balances
  const remainingQty = order.qty - order.filledQty;
  const userBalances = seedBalanceIfNeeded(userId);

  // Return the remaining locked funds/assets back to the user's available balance.
  if (order.side === "buy") {
    const lockedValue = order.price! * remainingQty;
    userBalances["USD"]!.locked -= lockedValue;
    userBalances["USD"]!.available += lockedValue;
  } else {
    userBalances[order.symbol]!.locked -= remainingQty;
    userBalances[order.symbol]!.available += remainingQty;
  }

  // 5. Update status of the order
  order.status = "cancelled"

  return order;
}

//------------------------------------------------------------------------------//
//----------------retrieves order status by individual ID-----------------------//
export function getOrder(payload: Record<string, unknown>):
  OrderRecord {
  const orderId = payload.orderId as string;
  if (!orderId) throw new Error("Missing orderId in payload");

  const order = ORDERS.get(orderId);
  if (!order) throw new Error("Order not found");

  return order;
}