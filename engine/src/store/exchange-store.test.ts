import { describe, test, expect, beforeEach } from "bun:test";
import {
    createOrder,
    getUserBalance,
    getDepth,
    cancelOrder,
    BALANCES,
    ORDERBOOKS,
    ORDERS,
    FILLS
} from "./exchange-store"

describe("Exchance Store Core Tests", () => {
    // Before each test runs, completely clear the state 
    // so tests don't interfere with each other
    beforeEach(() => {
        BALANCES.clear();
        ORDERBOOKS.clear();
        ORDERS.clear();
        FILLS.length = 0;
    });

    test("B2: Should seed default test balances for new users", () => {
        const balance = getUserBalance({ userId: "user-1" });
        expect(balance["USD"]!.available).toBe(10000);
        expect(balance["BTC"]!.available).toBe(10);
        expect(balance["USD"]!.locked).toBe(0);
    });

    test("I1: Should lock USD balance when a Buy Limit Order is placed", () => {
        createOrder({
            userId: "user-1",
            type: "limit",
            side: "buy",
            symbol: "BTC",
            price: 100,
            qty: 2
        });

        const balance = getUserBalance({ userId: "user-1" });
        expect(balance["USD"]!.available).toBe(9800); // 10000 - (100 * 2)
        expect(balance["USD"]!.locked).toBe(200);     // 100 * 2 
    });

    test("I2: Should match a Sell Limit order against a resting Buy Limit order", () => {

        // 1. Place a resting Buy order from user-1
        createOrder({
            userId: "user-1",
            type: "limit",
            side: "buy",
            symbol: "BTC",
            price: 100,
            qty: 1,
        });

        // 2. Place matching Sell order from user-2
        const sellOrder = createOrder({
            userId: "user-2",
            type: "limit",
            side: "sell",
            symbol: "BTC",
            price: 100,
            qty: 1
        }) as any;

        expect(sellOrder.status).toBe("filled");
        expect(sellOrder.filledQty).toBe(1);
        expect(sellOrder.fills.length).toBe(1);

        // 3. Verify final balances
        const buyerBalance = getUserBalance({ userId: "user-1" });
        const sellerBalance = getUserBalance({ userId: "user-2" });

        //Buyer spent $100, got 1 BTC
        expect(buyerBalance["USD"]!.available).toBe(9900);
        expect(buyerBalance["BTC"]!.available).toBe(11)

        //Seller got $100, sold 1 BTC
        expect(sellerBalance["USD"]!.available).toBe(10100);
        expect(sellerBalance["BTC"]!.available).toBe(9);
    });

    test("I3: Should aggregate and sort book depth correctly", () => {
        // place 2 resting buy orders at different prices
        createOrder({
            userId: "user-1",
            type: "limit",
            side: "buy",
            symbol: "BTC",
            price: 90,
            qty: 1
        });
        createOrder({
            userId: "user-2",
            type: "limit",
            side: "buy",
            symbol: "BTC",
            price: 95,
            qty: 2
        });

        const depth = getDepth({ symbol: "BTC" }) as any;

        //Bids should be sorted descending order
        expect(depth.bids.length).toBe(2);
        expect(depth.bids[0].price).toBe(95);
        expect(depth.bids[0].qty).toBe(2);
        expect(depth.bids[1].price).toBe(90);
        expect(depth.bids[1].qty).toBe(1);
    });

    test("I4: Should cancel a resting order and refund locked balance", () => {

        // 1. Place order (locks $100 USD)
        const order = createOrder({
            userId: "user-1",
            type: "limit",
            side: "buy",
            symbol: "BTC",
            price: 100,
            qty: 1,
        }) as any;

        // 2. Cancel it
        const cancelled = cancelOrder({ userId: "user-1", orderId: order.orderId }) as any;
        expect(cancelled.status).toBe("cancelled");

        // 3. Balance should be refunded
        const balance = getUserBalance({ userId: "user-1" });
        expect(balance["USD"]!.available).toBe(10000);
        expect(balance["USD"]!.locked).toBe(0);
    });

    test("A1: Should execute Market Order and not leave it resting on book", () => {

        // 1. Place a resting Sell Limit order
        createOrder({
            userId: "user-2",
            type: "limit",
            side: "sell",
            symbol: "BTC",
            price: 100,
            qty: 1,
        });

        // 2. Execute a Market Buy order for 1 BTC
        const marketOrder = createOrder({
            userId: "user-1",
            type: "market",
            side: "buy",
            symbol: "BTC",
            qty: 1,
        }) as any;
        expect(marketOrder.status).toBe("filled");
        expect(marketOrder.filledQty).toBe(1);

        // 3. Verify final balance of buyer (deducted directly from available USD)
        const buyerBalance = getUserBalance({ userId: "user-1" });
        expect(buyerBalance["USD"]!.available).toBe(9900);
        expect(buyerBalance["USD"]!.locked).toBe(0);
    });

});

