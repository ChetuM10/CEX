import "dotenv/config";
import { createClient } from "redis";
import { env } from "./utils/env.js";
import {
  cancelOrder,
  createOrder,
  getDepth,
  getOrder,
  getUserBalance,
} from "./store/exchange-store.js";
import { logEngineEvent, recoverEngineState } from "./store/persistence.js";


export type EngineCommandType =
  | "create_order"
  | "get_depth"
  | "get_user_balance"
  | "get_order"
  | "cancel_order";

export interface EngineRequest {
  correlationId: string;
  responseQueue: string;
  type: EngineCommandType;
  payload: Record<string, unknown>;
}

export interface EngineResponse {
  correlationId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const brokerClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis broker client error", error);
});

const responseClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis response client error", error);
});

await Promise.all([brokerClient.connect(), responseClient.connect()]);

//recovery state on startup before handling any new client requests
await recoverEngineState(responseClient);

// // :-)) I added this just to check the flow, remove it when you start
// const DUMMY_SELL_ORDER = {
//   orderId: "dummy-sell-order-1",
//   userId: "dummy-seller",
//   type: "limit",
//   side: "sell",
//   symbol: "BTC",
//   price: 100,
//   qty: 1,
//   filledQty: 0,
//   status: "open",
// };

async function sendResponse(responseQueue: string, response: EngineResponse): Promise<void> {
  await responseClient.lPush(responseQueue, JSON.stringify(response));
}

function handleEngineRequest(message: EngineRequest): unknown {
  /**
   * TODO(student):
   * 1. Check _message.type.
   * 2. Read _message.payload.
   * 3. Call your order book / balance / order logic.
   * 4. Return the data that should go back to the backend.
   *
   * Required message types:
   * - create_order
   * - get_depth
   * - get_user_balance
   * - get_order
   * - cancel_order
   */
  const payload = message.payload;
  switch (message.type) {
    case "create_order":
      return createOrder(payload);
    case "get_depth":
      return getDepth(payload);
    case "get_user_balance":
      return getUserBalance(payload);
    case "get_order":
      return getOrder(payload);
    case "cancel_order":
      return cancelOrder(payload);
    default:
      throw new Error(`Unkown Command:" ${message.type}`)
  }

  // // just checking the flow, remove this when you start implementing the logic
  // if (message.type === "create_order") {
  //   return {
  //     orderId: crypto.randomUUID(),
  //     status: "filled",
  //     filledQty: DUMMY_SELL_ORDER.qty,
  //     averagePrice: DUMMY_SELL_ORDER.price,
  //     fills: [
  //       {
  //         fillId: crypto.randomUUID(),
  //         symbol: DUMMY_SELL_ORDER.symbol,
  //         price: DUMMY_SELL_ORDER.price,
  //         qty: DUMMY_SELL_ORDER.qty,
  //         buyOrderId: "request-buy-order",
  //         sellOrderId: DUMMY_SELL_ORDER.orderId,
  //       },
  //     ],
  //     note: "Smoke-test response only. Students must replace this with real matching logic.",
  //   };
  // }

  // throw new Error("TODO(student): implement this engine request type");
}

console.log(`Engine listening on Redis queue: ${env.incomingQueue}`);

for (; ;) {
  const item = await brokerClient.brPop(env.incomingQueue, 0);
  if (!item) continue;

  let message: EngineRequest;

  try {
    message = JSON.parse(item.element) as EngineRequest;
  } catch {
    console.error("Skipping invalid broker message");
    continue;
  }

  try {
    const data = handleEngineRequest(message);

    //WAL (Write-Ahead Log): Log stae-changing operations if they succeed
    if (message.type === "create_order") {
      const order = data as any;
      await logEngineEvent(responseClient, {
        type: "ORDER_PLACED",
        payload: {
          ...message.payload,
          orderId: order.orderId,
          createdAt: order.createdAt, //stores the generated ID and STAMP
        },
      });
    } else if (message.type === "cancel_order") {
      await logEngineEvent(responseClient, {
        type: "ORDER_CANCELLED",
        payload: message.payload,
      });
    }

    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok: true,
      data,
    });
  } catch (error) {
    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok: false,
      error: error instanceof Error ? error.message : "engine_error",
    });
  }
}