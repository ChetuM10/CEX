import { createClient } from "redis";
import { createOrder, cancelOrder } from "./exchange-store.js";

// here we are defining the types we want to stoe in out Wrtie-Ahead Log(WAL)
export type JournalEvent =
    | { type: "ORDER_PLACED"; payload: Record<string, unknown> }
    | { type: "ORDER_CANCELLED"; payload: Record<string, unknown> };

//redis key where all the events will be stored
const EVENT_LOG_KEY = "engine:events";

/* Save an event to Redis so the exchange can recover its state after a restart.  */
export async function logEngineEvent(
    client: ReturnType<typeof createClient>,
    event: JournalEvent
): Promise<void> {

    // Convert the event into JSON format and save it at the end of the Redis event list
    await client.rPush(EVENT_LOG_KEY, JSON.stringify(event));
}

/*--------------------------------------------------------------*/
// REPLAYS all saved evenets in sequence from the Redis list
export async function recoverEngineState(
    client: ReturnType<typeof createClient>
): Promise<number> {

    // retrieves all events in sequence from the Redis list
    const events = await client.lRange(EVENT_LOG_KEY, 0, -1);
    if (!events || events.length === 0) {
        return 0;
    }
    console.log(`[Recovery] replaying ${events.length} events from Redis list...`);

    // 5.Read all saved events one by one and rebuild the exchange data in memory.
    for (const rawEvent of events) {
        try {
            const event = JSON.parse(rawEvent) as JournalEvent;
            if (event.type === "ORDER_PLACED") {
                createOrder(event.payload);
            } else if (event.type === "ORDER_CANCELLED") {
                cancelOrder(event.payload);
            }
        } catch (err) {
            console.error(`[Recovery Error] Failed to replay event: ${rawEvent}`, err);
        }
    }

    console.log("[Recovery] Sate reconstruction complete.");
    return events.length;
}


