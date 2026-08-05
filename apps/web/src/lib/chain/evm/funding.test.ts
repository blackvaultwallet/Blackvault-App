import { afterEach, describe, expect, it, vi } from "vitest";

// Funding is mainnet-only (Relay has no Robinhood testnet route) and local dev
// runs testnet — so pin the network before the module reads it.
vi.stubEnv("NEXT_PUBLIC_EVM_NETWORK", "mainnet");
const { FUNDING_ORIGINS, FUNDING_SUPPORTED, getFundingQuote, getPayoutQuote } =
  await import("./funding");

const USER = "0x4d883c37064FEbB056C94047aC3efacdAaDd9Ad4";
const RH_USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

// Trimmed from a real api.relay.link/quote response (Base USDC -> RH Chain ETH,
// 2026-07-30). Two steps: approve carries no `check`, deposit carries it.
const TWO_STEP = {
  steps: [
    {
      id: "approve",
      description: "Sign an approval for USDC",
      items: [{ data: { to: "0x8335", data: "0x1", value: "0", chainId: 8453 } }],
    },
    {
      id: "deposit",
      description: "Depositing funds to the relayer",
      items: [
        {
          data: { to: "0x4cd0", data: "0x2", value: "0", chainId: 8453 },
          check: { endpoint: "/intents/status?requestId=0xabc", method: "GET" },
        },
      ],
    },
  ],
  fees: { relayer: { amountUsd: "0.040946" } },
  details: {
    currencyIn: {
      amountUsd: "24.994025",
      amountFormatted: "25",
      currency: { symbol: "USDC" },
    },
    currencyOut: {
      amountFormatted: "0.013115",
      amountUsd: "24.948143",
      currency: { symbol: "ETH" },
    },
    timeEstimate: 3,
  },
};

// The USDG shape differs in one way that matters: Relay reports the ETH it
// bundles in as gas under details.currencyGasTopup.
const USDG_FILL = {
  ...TWO_STEP,
  details: {
    ...TWO_STEP.details,
    currencyOut: {
      amountFormatted: "22.95771",
      amountUsd: "22.957710",
      currency: { symbol: "USDG" },
    },
    currencyGasTopup: { amountUsd: "2.000000" },
  },
};

function stubFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async (_url: string, init?: { body?: string }) => {
    void init;
    return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The JSON body Relay was called with on the nth request. */
const bodyOf = (f: ReturnType<typeof stubFetch>, n: number) =>
  JSON.parse(f.mock.calls[n]![1]!.body!);

afterEach(() => vi.unstubAllGlobals());

describe("getFundingQuote", () => {
  it("is gated on mainnet", () => {
    expect(FUNDING_SUPPORTED).toBe(true);
  });

  it("maps a two-step quote and finds the status path on the last item", async () => {
    stubFetch(TWO_STEP);
    const q = await getFundingQuote({
      user: USER,
      origin: FUNDING_ORIGINS[0],
      asset: "USDC",
      amount: 25_000_000n,
    });
    expect(q.txCount).toBe(2);
    expect(q.statusPath).toBe("/intents/status?requestId=0xabc");
    expect(q.outFormatted).toBe("0.013115");
    expect(q.outSymbol).toBe("ETH");
    expect(q.feeUsd).toBe("0.040946");
    expect(q.etaSeconds).toBe(3);
  });

  it("sends the native sentinel for ETH and the USDC address otherwise", async () => {
    const f = stubFetch(TWO_STEP);
    const origin = FUNDING_ORIGINS[0];

    await getFundingQuote({ user: USER, origin, asset: "ETH", amount: 1n });
    expect(bodyOf(f, 0).originCurrency).toBe("0x0000000000000000000000000000000000000000");
    expect(bodyOf(f, 0).destinationChainId).toBe(4663);

    await getFundingQuote({ user: USER, origin, asset: "USDC", amount: 1n });
    expect(bodyOf(f, 1).originCurrency).toBe(origin.usdc);
  });

  it("asks for ETH with no gas top-up by default", async () => {
    const f = stubFetch(TWO_STEP);
    const q = await getFundingQuote({
      user: USER,
      origin: FUNDING_ORIGINS[0],
      asset: "USDC",
      amount: 1n,
    });
    expect(bodyOf(f, 0).destinationCurrency).toBe(
      "0x0000000000000000000000000000000000000000"
    );
    expect(bodyOf(f, 0).topupGas).toBe(false);
    expect(q.gasTopupUsd).toBeUndefined();
  });

  it("targets USDG with gas top-up on, and reports what the top-up cost", async () => {
    const f = stubFetch(USDG_FILL);
    const q = await getFundingQuote({
      user: USER,
      origin: FUNDING_ORIGINS[0],
      asset: "USDC",
      amount: 25_000_000n,
      destination: "USDG",
    });
    expect(bodyOf(f, 0).destinationCurrency).toBe(RH_USDG);
    expect(bodyOf(f, 0).topupGas).toBe(true);
    expect(q.outSymbol).toBe("USDG");
    expect(q.gasTopupUsd).toBe("2.000000");
  });

  it("leaves statusPath unset when no step can be polled", async () => {
    stubFetch({ ...TWO_STEP, steps: [TWO_STEP.steps[0]] });
    const q = await getFundingQuote({
      user: USER,
      origin: FUNDING_ORIGINS[0],
      asset: "USDC",
      amount: 1n,
    });
    expect(q.statusPath).toBeUndefined();
    expect(q.txCount).toBe(1);
  });

  it("sends a payout the other way, to someone else's address", async () => {
    const f = stubFetch(TWO_STEP);
    // A card provider's deposit rail — Kripicard's is USDT on Solana, and a
    // Solana address is base58, so it must not be run through getAddress.
    const to = {
      chainId: 792703809,
      currency: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
      recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    };
    await getPayoutQuote({ user: USER, from: "USDG", amount: 25_000_000n, to });

    const body = bodyOf(f, 0);
    expect(body.originChainId).toBe(4663);
    expect(body.originCurrency).toBe(RH_USDG);
    expect(body.destinationChainId).toBe(to.chainId);
    expect(body.destinationCurrency).toBe(to.currency);
    expect(body.recipient).toBe(to.recipient);
    // Nobody transacts from a provider's deposit address, so no gas is bundled.
    expect(body.topupGas).toBe(false);
    // Default is exact-input; exactOutput is opt-in.
    expect(body.tradeType).toBe("EXACT_INPUT");
    expect("exactOutput" in body).toBe(false);
  });

  it("fixes the delivered amount when exactOutput is set", async () => {
    const f = stubFetch(TWO_STEP);
    // A provider's deposit address is quoted an exact figure and keeps the
    // difference if you miss it, so the arriving amount is what gets pinned.
    await getPayoutQuote({
      user: USER,
      from: "USDG",
      amount: 20_020_000n,
      exactOutput: true,
      to: {
        chainId: 792703809,
        currency: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        recipient: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      },
    });
    expect(bodyOf(f, 0).tradeType).toBe("EXACT_OUTPUT");
    expect(bodyOf(f, 0).amount).toBe("20020000");
  });

  it("surfaces the response body on a Relay error", async () => {
    stubFetch({ message: "amount too small" }, false, 400);
    await expect(
      getFundingQuote({
        user: USER,
        origin: FUNDING_ORIGINS[0],
        asset: "ETH",
        amount: 1n,
      })
    ).rejects.toThrow(/400.*amount too small/);
  });
});
