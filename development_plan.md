# Development Plan

## 2. Roadmaps

### Beginner Roadmap (Base Routing & Balances)
Focuses on establishing the request handling flow and implementing simple in-memory state manipulation.

#### Task B1: Implement Engine Request Router

* **Description**: Replace the dummy smoke-test response in [engine/src/index.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/index.ts) with a router that switches on `message.type` and invokes the corresponding functions in `exchange-store.ts`.
* **Files to Edit**: [engine/src/index.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/index.ts)
* **Files to Create**: None
* **Dependencies**: None
* **Expected Difficulty**: Easy

#### Task B2: Implement Balance Seeding and Fetching

* **Description**: Implement balance seeding. When a user queries their balance or submits an order, seed their balance in the in-memory `BALANCES` map if it doesn't already exist (e.g. credit them with 10,000 USD and 10 BTC for testing). Implement the `get_user_balance` handler.
* **Files to Edit**: [engine/src/store/exchange-store.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/store/exchange-store.ts)
* **Files to Create**: None
* **Dependencies**: None
* **Expected Difficulty**: Easy

#### Task B3: Implement Order Retrieval Query

* **Description**: Implement the `get_order` handler. It queries the `ORDERS` map by `orderId` and returns the `OrderRecord`. If not found, throw/return a clear error.
* **Files to Edit**: [engine/src/store/exchange-store.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/store/exchange-store.ts)
* **Files to Create**: None
* **Dependencies**: None
* **Expected Difficulty**: Easy

---

### Intermediate Roadmap (Limit Order Matching & Canceling)
Implements core order matching, sorting, and balance locking logic.

#### Task I1: Implement Balance Locking for Limit Orders

* **Description**: When placing a limit order, lock the corresponding funds in the user's balance to prevent double-spending.
  * **Buy Order**: Lock `price * qty` of the quote asset (e.g. USD).
  * **Sell Order**: Lock `qty` of the base asset (e.g. BTC).
* **Files to Edit**: [engine/src/store/exchange-store.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/store/exchange-store.ts)
* **Files to Create**: None
* **Dependencies**: None
* **Expected Difficulty**: Medium

#### Task I2: Implement Limit Order Matching Logic

* **Description**: Match incoming limit orders against resting orders on the opposite side of the book.
  * **If a match is found**:
    * Generate a `Fill` record.
    * Adjust remaining execution quantities (`filledQty`).
    * Transfer assets between the buyer's and seller's available/locked balances.
  * **If the order is not fully filled**:
    * Insert the remaining portion as a `RestingOrder` in the `ORDERBOOKS` map.
* **Files to Edit**: [engine/src/store/exchange-store.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/store/exchange-store.ts)
* **Files to Create**: None (or create helper module `engine/src/store/matching.ts` for modularity)
* **Dependencies**: None
* **Expected Difficulty**: Hard

#### Task I3: Implement Order Book Depth Query

* **Description**: Implement `get_depth` handler. Compile depth levels grouped by price.
  * Bids must be sorted descending (highest price first).
  * Asks must be sorted ascending (lowest price first).
* **Files to Edit**: [engine/src/store/exchange-store.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/store/exchange-store.ts)
* **Files to Create**: None
* **Dependencies**: None
* **Expected Difficulty**: Medium

#### Task I4: Implement Order Cancellation

* **Description**: Implement the `cancel_order` handler. Locate the order in the book, remove it, update the status to `cancelled`, and unlock any remaining locked balances. Return an error if the order is already filled or does not exist.
* **Files to Edit**: [engine/src/store/exchange-store.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/store/exchange-store.ts)
* **Files to Create**: None
* **Dependencies**: None
* **Expected Difficulty**: Medium

---

### Advanced Roadmap (Market Orders, Crash Recovery & Production Concerns)
Hardens the system for production-like environments.

#### Task A1: Implement Market Orders

* **Description**: Implement market orders. Match the incoming order against resting limit orders on the opposite side of the book immediately at the best available prices until either fully filled or the order book is exhausted. Ensure balances are adjusted dynamically.
* **Files to Edit**: [engine/src/store/exchange-store.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/store/exchange-store.ts)
* **Files to Create**: None
* **Dependencies**: None
* **Expected Difficulty**: Medium

#### Task A2: Add Core Unit Tests

* **Description**: Set up unit tests for the matching logic and balance calculations using Bun's native test runner (`bun test`).
* **Files to Edit**: None
* **Files to Create**: `engine/src/store/exchange-store.test.ts`
* **Dependencies**: None (uses built-in Bun test utilities)
* **Expected Difficulty**: Easy

#### Task A3: Persistence and Crash Recovery (Production Strategy)

* **Description**: Build a persistence strategy. Since engine state is in-memory, write matches/fills or order logs to Redis or a Postgres log table asynchronously so the state can be fully replayed and reconstructed after a server restart.
* **Files to Edit**: [engine/src/index.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/index.ts)
* **Files to Create**: `engine/src/store/persistence.ts`
* **Dependencies**: None
* **Expected Difficulty**: Hard

---

## 3. Testing Strategy

* **Unit Testing**: Run `bun test` in the engine folder to check matching edge cases (e.g. price priority execution, partial fills, balance adjustments).
* **Integration Testing**: Use Postman (or write a test script in [CHECK-FLOW.md](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/CHECK-FLOW.md)) to test the entire client -> API -> Redis -> Engine -> API -> client loop.

---

## 4. Production Concerns

* **Single Point of Failure (Engine State)**: Since the Engine maintains state in-memory, a crash deletes all active balances, orders, and books. An append-only log (AOF) or write-ahead logging (WAL) system in Redis or PostgreSQL is needed to replay events on restart.
* **Concurrency & Thread Safety**: JavaScript/Node/Bun executes single-threaded event loops, preventing race conditions on the state maps. However, if scaling out the engine, you must partition books and balances by trading pairs (e.g. engine-1 handles BTC/USD, engine-2 handles ETH/USD).
* **Queue Build-up**: If the engine processes requests slower than the API server places them, the Redis queue will build up. Monitor queue lengths using Redis monitoring tools.

---

## 5. Final TODO List

### Phase 1: Environment & Setup
- [ ] Seed the PostgreSQL database with the User schema using `bun prisma migrate dev`.
- [ ] Create `.env` files for both backend and engine.
- [ ] Confirm connection to Redis and PostgreSQL.

### Phase 2: Authentication
- [ ] Confirm `POST /signup` inserts the hashed password user record.
- [ ] Verify `POST /signin` works, checking hashes and returning a JWT.

### Phase 3: Engine Broker & Basic Logic
- [ ] Implement `message.type` router inside [engine/src/index.ts](file:///c:/Users/cheta/OneDrive/Desktop/PROJECTS/CEX/engine/src/index.ts).
- [ ] Implement user balance seeding & checking.
- [ ] Implement `get_order` retrieval.

### Phase 4: Order Matching & Operations
- [ ] Implement asset balance locking upon limit order entry.
- [ ] Implement limit order matching (FIFO execution & partial fills).
- [ ] Implement order cancellation & balance unlocking.
- [ ] Implement price-grouped sorted book depth query.
- [ ] Implement market orders execution.

### Phase 5: Quality Assurance
- [ ] Write unit tests for matching/balance edge cases using `bun test`.
- [ ] Run `CHECK-FLOW.md` instructions using Postman to confirm complete round-trip flow.
